from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from .. import storage
from ..deps import VKDep
from ..models.auth import AuthChallenge, AuthStatus, LoginRequest, TokenLoginRequest
from ..services.friends import parse_user
from ..vk.auth import direct_login
from ..vk.exceptions import VKAuthError, VKError

router = APIRouter(prefix="/auth", tags=["auth"])


async def _resolve_user(vk: VKDep, token: str, *, fallback_id: int | None = None) -> AuthStatus:
    try:
        response = await vk.call("users.get", token, fields="photo_200")
        user = parse_user(response)
    except VKError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail={"kind": "vk_error", "message": exc.message}) from exc

    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail={"kind": "vk_error", "message": "Не удалось получить профиль"})

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
        return await _resolve_user(vk, session.access_token, fallback_id=session.user_id)
    except HTTPException:
        storage.clear()
        return AuthStatus(authenticated=False)


@router.post("/login", response_model=AuthStatus)
async def login(payload: LoginRequest, vk: VKDep) -> AuthStatus:
    try:
        session = await direct_login(
            payload.username,
            payload.password,
            code=payload.code,
            captcha_sid=payload.captcha_sid,
            captcha_key=payload.captcha_key,
        )
    except VKAuthError as exc:
        challenge = AuthChallenge(
            kind=exc.kind,
            message=exc.message,
            validation_sid=exc.validation_sid,
            captcha_sid=exc.captcha_sid,
            captcha_img=exc.captcha_img,
            phone_mask=exc.phone_mask,
        )
        # 401 for auth challenges keeps the contract uniform on the frontend.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=challenge.model_dump()) from exc

    storage.save(session)
    return await _resolve_user(vk, session.access_token, fallback_id=session.user_id)


@router.post("/token", response_model=AuthStatus)
async def login_with_token(payload: TokenLoginRequest, vk: VKDep) -> AuthStatus:
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
