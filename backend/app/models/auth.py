from __future__ import annotations

from .common import APIModel


class LoginRequest(APIModel):
    username: str
    password: str
    code: str | None = None
    captcha_sid: str | None = None
    captcha_key: str | None = None
    remember: bool = True


class AuthStatus(APIModel):
    authenticated: bool
    user_id: int | None = None
    first_name: str | None = None
    last_name: str | None = None
    photo: str | None = None
    has_audio: bool = True


class AuthChallenge(APIModel):
    kind: str
    message: str
    validation_sid: str | None = None
    captcha_sid: str | None = None
    captcha_img: str | None = None
    phone_mask: str | None = None
