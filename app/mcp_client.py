import asyncio
import json
import logging
import time
from typing import Any


class MCPError(Exception):
    pass


class MCPStockfishClient:
    def __init__(self, command: str = "mcp-stockfish") -> None:
        self.logger = logging.getLogger(__name__)
        self.command = command
        self._proc: asyncio.subprocess.Process | None = None
        self._next_id = 1
        self._write_lock = asyncio.Lock()

    async def __aenter__(self) -> "MCPStockfishClient":
        self.logger.info("Starting MCP stockfish process: %s", self.command)
        self._proc = await asyncio.create_subprocess_shell(
            self.command,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        started = time.perf_counter()
        await self._rpc("initialize", {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "chess-pgn-coach", "version": "0.1.0"}})
        await self._notify("notifications/initialized", {})
        self.logger.info("MCP initialized in %.2fs", time.perf_counter() - started)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        if self._proc and self._proc.returncode is None:
            self.logger.info("Stopping MCP process")
            self._proc.terminate()
            try:
                await asyncio.wait_for(self._proc.wait(), timeout=2)
            except asyncio.TimeoutError:
                self._proc.kill()

    async def run_command(self, command: str, session_id: str = "") -> dict[str, Any]:
        started = time.perf_counter()
        self.logger.info("MCP command start: %s", command)
        result = await self._rpc(
            "tools/call",
            {
                "name": "chess_engine",
                "arguments": {"command": command, "session_id": session_id},
            },
        )
        content = result.get("content", [])
        if not content:
            raise MCPError("Empty MCP tool response")
        text = content[0].get("text", "")
        if not text:
            raise MCPError("No text content in MCP response")
        try:
            parsed = json.loads(text)
            self.logger.info("MCP command done: %s (%.2fs)", command, time.perf_counter() - started)
            return parsed
        except json.JSONDecodeError as exc:
            raise MCPError(f"Failed to parse MCP response JSON: {text}") from exc

    async def _notify(self, method: str, params: dict[str, Any]) -> None:
        if not self._proc or not self._proc.stdin:
            raise MCPError("MCP process not started")
        msg = {"jsonrpc": "2.0", "method": method, "params": params}
        self._proc.stdin.write((json.dumps(msg) + "\n").encode("utf-8"))
        await self._proc.stdin.drain()

    async def _rpc(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        if not self._proc or not self._proc.stdin or not self._proc.stdout:
            raise MCPError("MCP process not started")

        async with self._write_lock:
            started = time.perf_counter()
            rpc_id = self._next_id
            self._next_id += 1

            msg = {
                "jsonrpc": "2.0",
                "id": rpc_id,
                "method": method,
                "params": params,
            }
            self._proc.stdin.write((json.dumps(msg) + "\n").encode("utf-8"))
            await self._proc.stdin.drain()

            while True:
                line = await self._proc.stdout.readline()
                if not line:
                    err = ""
                    if self._proc.stderr:
                        try:
                            err = (await asyncio.wait_for(self._proc.stderr.read(), timeout=0.2)).decode("utf-8", errors="ignore")
                        except Exception:
                            err = ""
                    raise MCPError(f"MCP process exited unexpectedly. stderr={err.strip()}")
                try:
                    msg_obj = json.loads(line.decode("utf-8"))
                except json.JSONDecodeError:
                    continue

                if msg_obj.get("id") != rpc_id:
                    continue
                if "error" in msg_obj:
                    raise MCPError(str(msg_obj["error"]))
                self.logger.debug("MCP rpc done: %s (id=%s, %.2fs)", method, rpc_id, time.perf_counter() - started)
                return msg_obj.get("result", {})
