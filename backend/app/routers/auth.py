from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status

from .. import storage
from ..deps import VKDep
from ..models.auth import AuthChallenge, AuthStatus, LoginRequest
from ..services.friends import parse_user
from ..vk.audio_token import refresh_to_audio_token
from ..vk.auth import direct_login
from ..vk.exceptions import VKAuthError, VKError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


async def _probe_audio(vk: VKDep, token: str) -> bool:
    """Return True if the token can call audio.* methods.

    VK closed audio.* for OAuth implicit-flow tokens in 2024+ — every call
    returns error 3 'Unknown method passed'. Only Kate Mobile direct password
    grant against oauth.vk.com/token yields tokens that pass the audio check.
    We probe with a cheap audio.get count=1 once at login time so the
    frontend can warn the user if audio is gated (e.g. a stale session.json
    left over from a prior version of the app).
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


@router.post("/login", response_model=AuthStatus)
async def login(payload: LoginRequest, vk: VKDep) -> AuthStatus:
    """Kate Mobile direct password grant against ``oauth.vk.com/token``.

    The only flow VK still grants audio scope to in 2024+. The implicit
    OAuth flow (``oauth.vk.com/authorize?response_type=token``) was
    confirmed dead for audio.* — even pre-existing tokens stopped working
    after VK's server-side change in 2026.

    Password never leaves this process: it's POSTed directly to VK and we
    keep only the resulting access_token. 2FA / captcha challenges are
    surfaced back to the client as HTTP 401 with the challenge payload.

    After a successful grant we apply ``refresh_to_audio_token`` (FCM
    receipt + ``auth.refreshToken``) as a best-effort upgrade. If it
    fails or returns the same token we keep the raw password-grant
    token — which already carries audio scope.
    """
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
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, detail=challenge.model_dump()
        ) from exc

    refresh_result = await refresh_to_audio_token(session.access_token)
    if refresh_result.ok and refresh_result.refreshed_token:
        logger.info("Kate Mobile receipt blessing succeeded")
        session = storage.Session(
            access_token=refresh_result.refreshed_token,
            user_id=session.user_id,
            expires_at=session.expires_at,
        )
    else:
        logger.info(
            "Kate Mobile receipt blessing skipped (%s); using raw grant token",
            refresh_result.error,
        )

    has_audio = await _probe_audio(vk, session.access_token)
    if not has_audio:
        logger.warning(
            "audio.get probe failed even after direct grant — audio stays gated"
        )

    if payload.remember:
        storage.save(session)
    return await _resolve_user(vk, session.access_token, has_audio=has_audio)


@router.post("/logout", response_model=AuthStatus)
async def logout() -> AuthStatus:
    storage.clear()
    return AuthStatus(authenticated=False)
