from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from .. import storage
from ..deps import VKDep
from ..models.auth import AuthChallenge, AuthStatus, LoginRequest, TokenLoginRequest
from ..services.friends import parse_user
from ..vk.auth import direct_login
from ..vk.exceptions import VKAuthError, VKError

router = APIRouter(prefix="/auth", tags=["auth"])


async def _probe_audio(vk: VKDep, token: str) -> bool:
    """Return True if the token can call audio.* methods.

    The OAuth implicit flow returns tokens that work for users.get /
    friends.get but every audio.* call fails with VK error 3 ('Unknown
    method passed'). The direct password grant returns audio-capable
    tokens. We probe with a cheap audio.get count=1 once at login time
    so the frontend can warn the user when audio is gated.
    """
    try:
        await vk.call("audio.get", token, count=1)
    except VKError:
        return False
    return True


async def _resolve_user(
    vk: VKDep,
    token: str,
    *,
    has_audio: bool | None = None,
) -> AuthStatus:
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

    if has_audio is None:
        has_audio = await _probe_audio(vk, token)

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
        return await _resolve_user(vk, session.access_token)
    except HTTPException:
        storage.clear()
        return AuthStatus(authenticated=False)


@router.post("/login", response_model=AuthStatus)
async def login(payload: LoginRequest, vk: VKDep) -> AuthStatus:
    """Direct password grant against ``oauth.vk.com/token`` (Kate Mobile).

    The only flow VK still grants audio scope to. Used as a fallback when
    the OAuth implicit-flow token from /auth/token lacks audio access
    (which is always, in 2024+). 2FA / captcha challenges are surfaced
    back to the client as 401 with the challenge payload.
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

    if payload.remember:
        storage.save(session)
    # Direct grant tokens always have audio access — skip the probe.
    return await _resolve_user(vk, session.access_token, has_audio=True)


@router.post("/token", response_model=AuthStatus)
async def login_with_token(payload: TokenLoginRequest, vk: VKDep) -> AuthStatus:
    """Persist an access_token from the Electron OAuth implicit-flow window.

    These tokens work for users.get / friends.get / etc. but typically do
    NOT have audio scope — VK closed audio for implicit-flow tokens in
    2024. We probe audio.get once and surface ``has_audio`` so the UI
    can prompt the user to add the password-grant flow.
    """
    has_audio = await _probe_audio(vk, payload.access_token)
    status_response = await _resolve_user(
        vk, payload.access_token, has_audio=has_audio
    )
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
