"""FastAPI dependencies — current session + shared VK client."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from . import storage
from .storage import Session
from .vk.client import VKClient


def get_vk_client(request: Request) -> VKClient:
    client: VKClient | None = getattr(request.app.state, "vk_client", None)
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="VK client not initialized",
        )
    return client


def get_session() -> Session:
    session = storage.load()
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"kind": "not_authenticated", "message": "Сначала войдите в аккаунт VK."},
        )
    return session


VKDep = Annotated[VKClient, Depends(get_vk_client)]
SessionDep = Annotated[Session, Depends(get_session)]
