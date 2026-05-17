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

    The OAuth implicit flow returns tokens that work for users.get /
    friends.get but every audio.* call fails with VK error 3
    ("Unknown method passed"). After the Kate Mobile receipt refresh
    (see ``vk.audio_token``) the same token gets the Kate Mobile
    blessing and audio.* starts working. We probe once at login so
    the UI can surface ``has_audio`` to the user.
    """
    try:
        await vk.call("audio.get", token, count=1)
    except VKError:
        return False
    return True


async def _resolve_user(vk: VKDep, token: str, *, has_audio: bool) -> AuthStatus:
    try:
        response = await vk.call("users.get", token, fields="photo_200")
        user = parse_user(response)
    except VKError as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
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


@router.get("/status", response_model=AuthStatus)
async def status_endpoint(vk: VKDep) -> AuthStatus:
    session = storage.load()
    if session is None:
        return AuthStatus(authenticated=False)
    try:
        has_audio = await _probe_audio(vk, session.access_token)
        return await _resolve_user(vk, session.access_token, has_audio=has_audio)
    except HTTPException:
        storage.clear()
        return AuthStatus(authenticated=False)


@router.post("/token", response_model=AuthStatus)
async def login_with_token(payload: TokenLoginRequest, vk: VKDep) -> AuthStatus:
    """Persist an access_token from the Electron OAuth implicit-flow window.

    Tokens straight off the OAuth window lack audio scope. We run them
    through ``refresh_to_audio_token`` (Kate Mobile receipt + VK
    auth.refreshToken) which "blesses" the token so audio.* methods
    start responding. If the refresh fails (Google FCM unreachable,
    VK rejects, etc.) we keep the original token — the rest of the
    player still works, only audio stays gated.
    """
    refresh_result = await refresh_to_audio_token(payload.access_token)
    if refresh_result.ok and refresh_result.refreshed_token:
        token_to_use = refresh_result.refreshed_token
        logger.info("Audio-token refresh succeeded")
    else:
        token_to_use = payload.access_token
        logger.warning(
            "Audio-token refresh failed, keeping OAuth token: %s",
            refresh_result.error,
        )

    has_audio = await _probe_audio(vk, token_to_use)
    status_response = await _resolve_user(vk, token_to_use, has_audio=has_audio)
    assert status_response.user_id is not None  # guaranteed by _resolve_user

    session = storage.Session(
        access_token=token_to_use,
        user_id=status_response.user_id,
    )
    if payload.remember:
        storage.save(session)
    return status_response


@router.post("/logout", response_model=AuthStatus)
async def logout() -> AuthStatus:
    storage.clear()
    return AuthStatus(authenticated=False)
