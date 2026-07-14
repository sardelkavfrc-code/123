from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import art, audio, auth, friends, rpc
from .vk.client import VKClient


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    settings.session_dir.mkdir(parents=True, exist_ok=True)
    app.state.vk_client = VKClient(settings)
    
    # Proactively refresh token if session is older than 2 weeks (14 days = 1209600 seconds)
    import asyncio
    from . import storage
    session = storage.load()
    if session and session.access_token:
        if storage.get_session_age_seconds() > 14 * 24 * 3600:
            import logging
            logger = logging.getLogger(__name__)
            logger.info("Session token is older than 2 weeks. Starting proactive background refresh...")
            asyncio.create_task(app.state.vk_client.refresh_session())

    try:
        yield
    finally:
        from .services.discord_rpc import rpc_manager
        await rpc_manager.close()
        await app.state.vk_client.aclose()
        await art.aclose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="VK Music Player",
        version="0.1.0",
        description="Локальный прокси к VK API для десктопного плеера.",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router)
    app.include_router(audio.router)
    app.include_router(friends.router)
    app.include_router(art.router)
    app.include_router(rpc.router)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
