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
from .llm import build_coaching_report


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


class ReportRequest(BaseModel):
    analysis: dict
    played_as: str


@app.get("/", response_class=HTMLResponse)
def index() -> HTMLResponse:
    html_path = BASE_DIR / "templates" / "index.html"
    styles_path = BASE_DIR / "static" / "styles.css"
    app_js_path = BASE_DIR / "static" / "app.js"
    html = html_path.read_text(encoding="utf-8")
    html = html.replace("__STYLES_VERSION__", str(int(styles_path.stat().st_mtime)))
    html = html.replace("__APP_VERSION__", str(int(app_js_path.stat().st_mtime)))
    return HTMLResponse(
        content=html,
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


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


@app.post("/api/report")
async def report(req: ReportRequest):
    played_as = req.played_as.strip()
    if played_as not in {"White", "Black"}:
        raise HTTPException(status_code=400, detail="Played side must be White or Black")

    try:
        logger.info("POST /api/report started (played_as=%s)", played_as)
        report_text = build_coaching_report(req.analysis, played_as=played_as)
        return {"output_text": report_text}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Report generation failed: {exc}") from exc
