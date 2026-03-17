import logging
import os
import time
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .analyzer import analyze_pgns


BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")
LOG_LEVEL = os.getenv("APP_LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Chess PGN Coach")
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")


class AnalyzeRequest(BaseModel):
    pgn: str


@app.get("/", response_class=HTMLResponse)
def index() -> str:
    html_path = BASE_DIR / "templates" / "index.html"
    default_model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
    html = html_path.read_text(encoding="utf-8")
    return html.replace("__OPENAI_MODEL__", default_model)


@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest):
    request_started = time.perf_counter()
    pgn = req.pgn.strip()
    if not pgn:
        raise HTTPException(status_code=400, detail="PGN is required")

    try:
        logger.info("POST /api/analyze started")
        analyses = await analyze_pgns(pgn)
        games = []
        for idx, analysis in enumerate(analyses, start=1):
            games.append(
                {
                    "index": idx,
                    "title": f"Game {idx}: {analysis.get('white', 'White')} vs {analysis.get('black', 'Black')} ({analysis.get('result', '*')})",
                    "analysis": analysis,
                }
            )
        logger.info("POST /api/analyze completed in %.2fs", time.perf_counter() - request_started)
        return {
            "games": games,
            "analysis": games[0]["analysis"],
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}") from exc
