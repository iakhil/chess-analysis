FROM golang:1.24-bookworm AS mcp-builder

WORKDIR /src
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git && rm -rf /var/lib/apt/lists/*
RUN git clone https://github.com/sonirico/mcp-stockfish.git .
RUN go build -o /out/mcp-stockfish-persistent .

FROM python:3.12-slim-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends stockfish && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /app/bin

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY static ./static
COPY templates ./templates
COPY --from=mcp-builder /out/mcp-stockfish-persistent ./bin/mcp-stockfish-persistent

ENV MCP_STOCKFISH_PATH=/usr/games/stockfish
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
