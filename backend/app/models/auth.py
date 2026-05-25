from __future__ import annotations

from pydantic import Field

from .common import APIModel


class TokenLoginRequest(APIModel):
    access_token: str = Field(min_length=10)
    user_id: int | None = None
    remember: bool = True


class AuthStatus(APIModel):
    authenticated: bool
    user_id: int | None = None
    first_name: str | None = None
    last_name: str | None = None
    photo: str | None = None
    has_audio: bool = True
