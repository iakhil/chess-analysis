import io
import logging
import os
import re
import time
import uuid
from dataclasses import dataclass
from typing import Any

import chess.pgn

from .mcp_client import MCPStockfishClient


MATE_SCORE = 100000
logger = logging.getLogger(__name__)


@dataclass
class MoveReview:
    ply: int
    mover: str
    played: str
    bestmove: str
    before_score: int
    after_score: int
    loss_cp: int


def _parse_score_cp(lines: list[str]) -> int | None:
    best_depth = -1
    best_score = None
    for line in lines:
        if not line.startswith("info"):
            continue
        depth_match = re.search(r"\bdepth\s+(\d+)\b", line)
        if not depth_match:
            continue
        depth = int(depth_match.group(1))
        cp_match = re.search(r"\bscore\s+cp\s+(-?\d+)\b", line)
        mate_match = re.search(r"\bscore\s+mate\s+(-?\d+)\b", line)
        if cp_match:
            score = int(cp_match.group(1))
        elif mate_match:
            mate = int(mate_match.group(1))
            score = MATE_SCORE if mate > 0 else -MATE_SCORE
        else:
            continue
        if depth > best_depth:
            best_depth = depth
            best_score = score
    return best_score


def _parse_bestmove(lines: list[str]) -> str | None:
    for line in reversed(lines):
        if line.startswith("bestmove"):
            parts = line.split()
            if len(parts) >= 2:
                return parts[1]
    return None


def _parse_games(pgn_text: str) -> list[chess.pgn.Game]:
    stream = io.StringIO(pgn_text.strip())
    games: list[chess.pgn.Game] = []
    while True:
        game = chess.pgn.read_game(stream)
        if game is None:
            break
        games.append(game)
    return games


async def _analyze_game(game: chess.pgn.Game, game_index: int) -> dict[str, Any]:
    started = time.perf_counter()
    mode = os.getenv("MCP_ANALYSIS_MODE", "movetime").strip().lower()
    depth = int(os.getenv("MCP_ANALYSIS_DEPTH", "12"))
    movetime_ms = int(os.getenv("MCP_ANALYSIS_MOVETIME_MS", "300"))
    max_plies = int(os.getenv("MCP_ANALYSIS_MAX_PLIES", "120"))
    mcp_cmd = os.getenv("MCP_STOCKFISH_CMD", "mcp-stockfish")

    moves = list(game.mainline_moves())[:max_plies]
    logger.info(
        "Game %d: %d plies, mode=%s, depth=%d, movetime_ms=%d",
        game_index,
        len(moves),
        mode,
        depth,
        movetime_ms,
    )

    search_cmd = f"go depth {depth}" if mode == "depth" else f"go movetime {movetime_ms}"

    position_evals: list[int | None] = []
    bestmoves: list[str] = []

    async with MCPStockfishClient(command=mcp_cmd) as client:
        session_id = str(uuid.uuid4())
        await client.run_command("uci", session_id)
        await client.run_command("isready", session_id)

        for ply_idx, _move in enumerate(moves, start=1):
            ply_started = time.perf_counter()
            before_moves = [m.uci() for m in moves[: ply_idx - 1]]
            before_cmd = "position startpos"
            if before_moves:
                before_cmd += " moves " + " ".join(before_moves)

            await client.run_command(before_cmd, session_id)
            before_res = await client.run_command(search_cmd, session_id)
            before_lines = before_res.get("response", [])
            before_score = _parse_score_cp(before_lines)
            bestmove = _parse_bestmove(before_lines)
            position_evals.append(before_score)
            bestmoves.append(bestmove or "(unknown)")
            logger.info(
                "Game %d ply %d/%d: best=%s score=%s (%.2fs)",
                game_index,
                ply_idx,
                len(moves),
                bestmove or "(unknown)",
                str(before_score),
                time.perf_counter() - ply_started,
            )

        await client.run_command("quit", session_id)

    move_reviews: list[MoveReview] = []
    for idx, move in enumerate(moves[:-1]):
        before_score = position_evals[idx]
        after_score = position_evals[idx + 1]
        if before_score is None or after_score is None:
            continue

        ply = idx + 1
        mover_is_white = (ply % 2 == 1)
        loss_cp = (before_score - after_score) if mover_is_white else ((-before_score) - (-after_score))

        move_reviews.append(
            MoveReview(
                ply=ply,
                mover="White" if mover_is_white else "Black",
                played=move.uci(),
                bestmove=bestmoves[idx],
                before_score=before_score,
                after_score=after_score,
                loss_cp=loss_cp,
            )
        )

    move_reviews.sort(key=lambda x: x.loss_cp, reverse=True)
    major = [m for m in move_reviews if m.loss_cp >= 80][:8]
    summary = {
        "event": game.headers.get("Event", "Unknown Event"),
        "white": game.headers.get("White", "White"),
        "black": game.headers.get("Black", "Black"),
        "result": game.headers.get("Result", "*"),
        "total_plies": len(moves),
        "moves_uci": [m.uci() for m in moves],
        "top_mistakes": [m.__dict__ for m in major],
        "all_reviews": [m.__dict__ for m in move_reviews[:40]],
    }
    logger.info("Game %d analyzed in %.2fs", game_index, time.perf_counter() - started)
    return summary


async def analyze_pgns(pgn_text: str) -> list[dict[str, Any]]:
    games = _parse_games(pgn_text)
    if not games:
        raise ValueError("Could not parse PGN. Ensure it contains one or more valid games.")

    max_games = int(os.getenv("MCP_ANALYSIS_MAX_GAMES", "5"))
    games = games[:max_games]
    logger.info("Analyze PGN bundle started (%d games)", len(games))
    analyses: list[dict[str, Any]] = []
    for i, game in enumerate(games, start=1):
        analyses.append(await _analyze_game(game, i))
    return analyses


async def analyze_pgn(pgn_text: str) -> dict[str, Any]:
    analyses = await analyze_pgns(pgn_text)
    return analyses[0]
