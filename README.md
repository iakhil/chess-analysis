# Chess PGN Coach

A FastAPI web app that runs Stockfish analysis on the server via MCP and generates the coaching report through the backend using a server-side OpenAI API key.

## How it works

- The browser sends pasted PGNs to the FastAPI backend.
- The backend runs `mcp-stockfish` and returns engine analysis JSON.
- The browser sends that analysis plus the chosen side to the backend, which calls OpenAI and returns the coaching report.
- Replay is rendered in the browser with `chessboard-element`.

## Run locally

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Open `http://localhost:8000`.

## Deploy on Render

This repository includes `render.yaml` for a Docker-based Render deploy.

1. Create a new Render Web Service from this repo.
2. Render should detect the `Dockerfile`.
3. Add these environment variables in Render:

```text
OPENAI_API_KEY=<your key>
OPENAI_MODEL=gpt-4.1-mini
APP_LOG_LEVEL=INFO
MCP_ANALYSIS_MODE=movetime
MCP_ANALYSIS_MOVETIME_MS=300
MCP_ANALYSIS_DEPTH=12
MCP_ANALYSIS_MAX_PLIES=120
MCP_ANALYSIS_MAX_GAMES=5
```

`OPENAI_API_KEY` is now required on the backend.

## Deploy on Koyeb

This app is best deployed to Koyeb from the included `Dockerfile` because it needs:

- Python/FastAPI
- a Linux `stockfish` binary
- a Linux-compatible `mcp-stockfish` binary

The `Dockerfile` handles all of that by:

- installing `stockfish` with `apt`
- building `mcp-stockfish-persistent` for Linux from `sonirico/mcp-stockfish`
- starting `uvicorn` on Koyeb's `PORT`

### Koyeb setup

1. Push this repository to GitHub.
2. In Koyeb, create a new app from the GitHub repo.
3. Choose Dockerfile deployment.
4. Set the exposed HTTP port to `8000`.
5. Set these environment variables if you want to tune analysis:

```text
OPENAI_MODEL=gpt-4.1-mini
MCP_ANALYSIS_MODE=movetime
MCP_ANALYSIS_MOVETIME_MS=300
MCP_ANALYSIS_DEPTH=12
MCP_ANALYSIS_MAX_PLIES=120
MCP_ANALYSIS_MAX_GAMES=5
APP_LOG_LEVEL=INFO
```

Server-side `OPENAI_API_KEY` is required.

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

- `OPENAI_API_KEY` must be configured on the backend.
- The user explicitly chooses whether they played as White or Black so the coaching is from the correct perspective.
- The engine mistakes table is based on Stockfish/MCP analysis from the backend.
- The interactive board uses CDN scripts (`chess.js` and `chessboard-element`).
