# Chess PGN Coach

A FastAPI web app that runs Stockfish analysis on the server via MCP and generates the coaching report in the browser using the user's own OpenAI API key.

## How it works

- The browser sends pasted PGNs to the FastAPI backend.
- The backend runs `mcp-stockfish` and returns engine analysis JSON only.
- The browser sends that analysis to OpenAI with the user's API key and renders the coaching report locally.
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

- `OPENAI_MODEL`: default model prefilled in the UI, default `gpt-4.1-mini`
- `MCP_STOCKFISH_CMD`: command used to start the MCP Stockfish process
- `MCP_ANALYSIS_MODE`: `movetime` or `depth`
- `MCP_ANALYSIS_MOVETIME_MS`: default `300` in `movetime` mode
- `MCP_ANALYSIS_DEPTH`: default `12` in `depth` mode
- `MCP_ANALYSIS_MAX_PLIES`: analyze at most N plies, default `120`
- `MCP_ANALYSIS_MAX_GAMES`: analyze at most N games from pasted input, default `5`
- `APP_LOG_LEVEL`: `INFO` or `DEBUG`

## Notes

- No server-side OpenAI key is required or used.
- The user's OpenAI API key is entered on the page and stored in browser local storage only.
- The engine mistakes table is based on Stockfish/MCP analysis from the backend.
- The interactive board uses CDN scripts (`chess.js` and `chessboard-element`).
