from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from .. import storage
from ..deps import VKDep
from ..models.auth import AuthStatus, TokenLoginRequest
from ..services.friends import parse_user
from ..vk.exceptions import VKError

router = APIRouter(prefix="/auth", tags=["auth"])


async def _resolve_user(vk: VKDep, token: str) -> AuthStatus:
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
    )


@router.get("/status", response_model=AuthStatus)
async def status_endpoint(vk: VKDep) -> AuthStatus:
    session = storage.load()
    if session is None:
        return AuthStatus(authenticated=False)
    try:
        return await _resolve_user(vk, session.access_token)
    except HTTPException:
        storage.clear()
        return AuthStatus(authenticated=False)


@router.post("/token", response_model=AuthStatus)
async def login_with_token(payload: TokenLoginRequest, vk: VKDep) -> AuthStatus:
    """Persist an access_token previously obtained via the Electron OAuth window.

    The desktop client embeds VK's mobile OAuth UI (logins, 2FA, captcha, QR
    code via VK ID — whatever VK supports) and only hands us the resulting
    bearer token. We validate it by calling ``users.get`` and only then write
    it to the on-disk session.
    """
    status_response = await _resolve_user(vk, payload.access_token)
    assert status_response.user_id is not None  # guaranteed by _resolve_user
    session = storage.Session(
        access_token=payload.access_token,
        user_id=status_response.user_id,
    )
    if payload.remember:
        storage.save(session)
    return status_response


@router.post("/logout", response_model=AuthStatus)
async def logout() -> AuthStatus:
    storage.clear()
    return AuthStatus(authenticated=False)
