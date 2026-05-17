from __future__ import annotations

from pydantic import Field

from .common import APIModel


class User(APIModel):
    id: int
    first_name: str
    last_name: str
    photo: str | None = None
    audio_visible: bool = True  # only true means we can fetch the friend's music


class FriendList(APIModel):
    items: list[User] = Field(default_factory=list)
    count: int = 0
    visible_count: int = 0
