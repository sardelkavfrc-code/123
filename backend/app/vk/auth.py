"""VK direct token grant (Kate Mobile flow).

Hits https://oauth.vk.com/token directly, NOT api.vk.com. The endpoint
returns the same shape regardless of 2FA — we surface 2FA / captcha back
to the client so it can re-call us with the code.
"""

from __future__ import annotations

import time
from typing import Any

import httpx

from ..config import get_settings
from ..storage import Session
from .exceptions import VKAuthError

_OAUTH_URL = "https://oauth.vk.com/token"
_SCOPE = "audio,friends,offline,wall,photos,groups,status"


async def direct_login(
    username: str,
    password: str,
    *,
    code: str | None = None,
    captcha_sid: str | None = None,
    captcha_key: str | None = None,
) -> Session:
    settings = get_settings()
    params: dict[str, Any] = {
        "grant_type": "password",
        "client_id": settings.vk_client_id,
        "client_secret": settings.vk_client_secret,
        "username": username,
        "password": password,
        "v": settings.vk_api_version,
        "scope": _SCOPE,
        "2fa_supported": 1,
        "force_sms": 1,
    }
    if code:
        params["code"] = code
    if captcha_sid:
        params["captcha_sid"] = captcha_sid
    if captcha_key:
        params["captcha_key"] = captcha_key

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(20.0, connect=10.0),
        headers={"User-Agent": settings.vk_user_agent},
    ) as client:
        resp = await client.get(_OAUTH_URL, params=params)
        data = resp.json()

    if "access_token" in data and "user_id" in data:
        expires_in = int(data.get("expires_in", 0) or 0)
        return Session(
            access_token=str(data["access_token"]),
            user_id=int(data["user_id"]),
            expires_at=(int(time.time()) + expires_in) if expires_in else 0,
        )

    error = str(data.get("error", "unknown_error"))
    description = str(data.get("error_description", error))

    if error == "need_validation":
        raise VKAuthError(
            kind="need_validation",
            message=description,
            validation_sid=str(data.get("validation_sid", "")) or None,
            phone_mask=str(data.get("phone_mask", "")) or None,
            raw=data,
        )
    if error == "need_captcha":
        raise VKAuthError(
            kind="need_captcha",
            message=description,
            captcha_sid=str(data.get("captcha_sid", "")) or None,
            captcha_img=str(data.get("captcha_img", "")) or None,
            raw=data,
        )

    raise VKAuthError(kind=error, message=description, raw=data)
