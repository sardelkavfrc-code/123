from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status

from .. import storage
from ..deps import VKDep
from ..models.auth import AuthStatus, TokenLoginRequest
from ..services.friends import parse_user
from ..vk.audio_token import refresh_to_audio_token
from ..vk.exceptions import VKError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


async def _probe_audio(vk: VKDep, token: str) -> bool:
    """Return True if the token can call audio.* methods.

    The vk.com web client (the only OAuth-implicit flow that still grants
    audio scope in 2026) returns error 3 'Unknown method passed' for a
    handful of audio.* endpoints (notably audio.getAudiosByArtist), but
    audio.get works. We probe with a cheap audio.get count=1 once at
    login time so the frontend can warn if audio is gated.
    """
    try:
        await vk.call("audio.get", token, count=1)
    except VKError as exc:
        if exc.code == 3:
            return False
        if exc.code in (5, 1117, 28, 3610):
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                detail={"kind": "vk_error", "message": exc.message},
            ) from exc
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail={"kind": "vk_error", "message": exc.message},
        ) from exc
    return True


async def _resolve_user(vk: VKDep, token: str, *, has_audio: bool) -> AuthStatus:
    try:
        response = await vk.call("users.get", token, fields="photo_200")
        user = parse_user(response)
    except VKError as exc:
        if exc.code in (5, 1117, 28, 3610):
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                detail={"kind": "vk_error", "message": exc.message},
            ) from exc
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail={"kind": "vk_error", "message": exc.message},
        ) from exc

    if user is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail={"kind": "vk_error", "message": "Не удалось получить профиль"},
        )

    return AuthStatus(
        authenticated=True,
        user_id=user.id,
        first_name=user.first_name,
        last_name=user.last_name,
        photo=user.photo,
        has_audio=has_audio,
    )


import asyncio

@router.get("/status", response_model=AuthStatus)
async def status_endpoint(vk: VKDep) -> AuthStatus:
    session = storage.load()
    if session is None:
        return AuthStatus(authenticated=False)
    
    for attempt in range(3):
        try:
            has_audio = await _probe_audio(vk, session.access_token)
            return await _resolve_user(vk, session.access_token, has_audio=has_audio)
        except HTTPException as exc:
            if exc.status_code == status.HTTP_502_BAD_GATEWAY and attempt < 2:
                await asyncio.sleep(1.0)
                continue
            if exc.status_code == status.HTTP_401_UNAUTHORIZED:
                storage.clear()
                return AuthStatus(authenticated=False)
            raise exc


@router.post("/token", response_model=AuthStatus)
async def login_with_token(payload: TokenLoginRequest, vk: VKDep) -> AuthStatus:
    """Accept an access_token captured from the vk.com OAuth redirect.

    The Electron main process opens ``oauth.vk.com/authorize`` with the
    vk.com web client (client_id 6287487, scope 1073737727), captures the
    token from the ``oauth.vk.com/blank.html`` redirect, and POSTs it
    here. This is the only flow in 2026 that still yields a token with
    working audio.get / audio.search / audio.getRecommendations.

    We still apply a best-effort ``refresh_to_audio_token`` blessing and
    probe audio.get once so the frontend knows whether to display the
    'audio gated' warning.
    """
    user_id = payload.user_id or 0
    if not user_id:
        try:
            response = await vk.call("users.get", payload.access_token)
            if isinstance(response, list) and response:
                user_id = int(response[0].get("id", 0))
        except VKError as exc:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                detail={"kind": "vk_error", "message": exc.message},
            ) from exc

    if not user_id:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail={"kind": "vk_error", "message": "Не удалось определить user_id"},
        )

    session = storage.Session(access_token=payload.access_token, user_id=user_id)

    refresh_result = await refresh_to_audio_token(session.access_token)
    if refresh_result.ok and refresh_result.refreshed_token:
        logger.info("FCM receipt blessing succeeded")
        session = storage.Session(
            access_token=refresh_result.refreshed_token,
            user_id=session.user_id,
            expires_at=session.expires_at,
        )
    else:
        logger.info("FCM receipt blessing skipped (%s)", refresh_result.error)

    has_audio = await _probe_audio(vk, session.access_token)
    if not has_audio:
        logger.warning("audio.get probe failed on token — audio gated")

    if payload.remember:
        storage.save(session)
    return await _resolve_user(vk, session.access_token, has_audio=has_audio)


@router.post("/logout", response_model=AuthStatus)
async def logout() -> AuthStatus:
    storage.clear()
    return AuthStatus(authenticated=False)


