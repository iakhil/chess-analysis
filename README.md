# Chess PGN Coach

A FastAPI web app that runs Stockfish analysis on the server via MCP and generates the coaching report through the backend using the user's own OpenAI API key.

## How it works

- The browser sends pasted PGNs to the FastAPI backend.
- The backend runs `mcp-stockfish` and returns engine analysis JSON.
- The browser sends that analysis plus the user's API key and chosen side to the backend, which calls OpenAI for that request only and returns the coaching report.
- Replay is rendered in the browser with `chessboard-element`.

## Run locally

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Open `http://localhost:8000`.

## Configuration

- `OPENAI_MODEL`: model used server-side for report generation, default `gpt-4.1-mini`
- `MCP_STOCKFISH_CMD`: command used to start the MCP Stockfish process
- `MCP_ANALYSIS_MODE`: `movetime` or `depth`
- `MCP_ANALYSIS_MOVETIME_MS`: default `300` in `movetime` mode
- `MCP_ANALYSIS_DEPTH`: default `12` in `depth` mode
- `MCP_ANALYSIS_MAX_PLIES`: analyze at most N plies, default `120`
- `MCP_ANALYSIS_MAX_GAMES`: analyze at most N games from pasted input, default `5`
- `APP_LOG_LEVEL`: `INFO` or `DEBUG`

## Notes

- No server-side OpenAI key is required.
- The user's OpenAI API key is entered on the page, stored in browser local storage, and sent to the backend only for the report-generation request. The app does not persist it in `.env`.
- The user explicitly chooses whether they played as White or Black so the coaching is from the correct perspective.
- The engine mistakes table is based on Stockfish/MCP analysis from the backend.
- The interactive board uses CDN scripts (`chess.js` and `chessboard-element`).
