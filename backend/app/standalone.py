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
import os
import sys
import threading
import time

import uvicorn

from app.main import app


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
