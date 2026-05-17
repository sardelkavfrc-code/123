"""Entry point for the PyInstaller-bundled backend.

When the app is shipped as a desktop installer, Electron spawns this binary
as a child process on app start. It listens on 127.0.0.1 on a port supplied
via the ``VKMP_BIND_PORT`` env var (defaults to 8765), prints a single
``VKMP_BACKEND_READY <port>`` line on stdout once the HTTP server is up so
the parent process can wait for readiness, and exits when the parent process
dies (a portable equivalent of a parent-death signal on all platforms).
"""

from __future__ import annotations

import asyncio
import logging
import logging.handlers
import os
import sys
import threading
import time
from pathlib import Path

import uvicorn

from app.main import app


def _configure_file_logging() -> None:
    """Mirror app logs to ``~/.vk-music-player/backend.log`` (rotated, 5x256kB).

    stdout/stderr are owned by Electron and are swallowed when the binary is
    launched from a desktop shortcut, so this file is the only place users
    can read backend-side diagnostics (auth, audio probes, VK errors).
    """
    log_dir = Path.home() / ".vk-music-player"
    try:
        log_dir.mkdir(parents=True, exist_ok=True)
    except OSError:
        return
    log_path = log_dir / "backend.log"
    handler = logging.handlers.RotatingFileHandler(
        log_path, maxBytes=256 * 1024, backupCount=5, encoding="utf-8"
    )
    handler.setFormatter(
        logging.Formatter(
            "%(asctime)s %(levelname)s %(name)s: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )
    root = logging.getLogger()
    if root.level == logging.NOTSET or root.level > logging.INFO:
        root.setLevel(logging.INFO)
    root.addHandler(handler)
    logging.getLogger("uvicorn").addHandler(handler)
    logging.getLogger("uvicorn.error").addHandler(handler)
    logging.getLogger("app").setLevel(logging.INFO)


def _parent_alive(initial_ppid: int) -> bool:
    """True if the parent process that launched us is still around."""
    if sys.platform == "win32":
        import ctypes

        process_query_limited_information = 0x1000
        still_active = 259
        kernel32 = ctypes.windll.kernel32
        handle = kernel32.OpenProcess(process_query_limited_information, False, initial_ppid)
        if not handle:
            return False
        try:
            exit_code = ctypes.c_ulong()
            if not kernel32.GetExitCodeProcess(handle, ctypes.byref(exit_code)):
                return False
            return exit_code.value == still_active
        finally:
            kernel32.CloseHandle(handle)
    # POSIX: when the parent dies the child is reparented to init (PID 1) or
    # launchd; getppid() reflects that immediately.
    return os.getppid() == initial_ppid


def _watch_parent(initial_ppid: int) -> None:
    while _parent_alive(initial_ppid):
        time.sleep(0.5)
    os._exit(0)


def _watch_parent_stdin() -> None:
    """Belt-and-braces: also exit on stdin EOF.

    Electron pipes our stdin and closes it on quit. The PPID poll above is
    the primary mechanism; this is here so the process exits within a few
    ms instead of up to 500ms when the parent closes us deliberately.
    """
    try:
        while True:
            chunk = sys.stdin.buffer.read(1024)
            if not chunk:
                break
    except Exception:  # noqa: BLE001 — stdin may already be torn down on quit
        pass
    os._exit(0)


def main() -> None:
    _configure_file_logging()
    logging.getLogger(__name__).info("VKMP backend starting")
    port = int(os.environ.get("VKMP_BIND_PORT", "8765"))
    host = os.environ.get("VKMP_BIND_HOST", "127.0.0.1")

    if os.environ.get("VKMP_WATCH_PARENT") == "1":
        initial_ppid = os.getppid()
        threading.Thread(target=_watch_parent, args=(initial_ppid,), daemon=True).start()
        threading.Thread(target=_watch_parent_stdin, daemon=True).start()

    config = uvicorn.Config(
        app,
        host=host,
        port=port,
        log_level="warning",
        access_log=False,
        loop="asyncio",
        lifespan="on",
    )
    server = uvicorn.Server(config)

    async def runner() -> None:
        task = asyncio.create_task(server.serve())
        # Poll until the server reports it is listening, then announce.
        while not server.started:
            await asyncio.sleep(0.05)
        print(f"VKMP_BACKEND_READY {port}", flush=True)
        await task

    asyncio.run(runner())


if __name__ == "__main__":
    main()
