"""Friends domain logic."""

from __future__ import annotations

from typing import Any

from ..models.user import FriendList, User


def _photo(raw: dict[str, Any]) -> str | None:
    for key in ("photo_200", "photo_100", "photo_50"):
        if raw.get(key):
            return str(raw[key])
    return None


def parse_friends(response: Any) -> FriendList:
    if not isinstance(response, dict):
        return FriendList()
    items = response.get("items") or []
    parsed: list[User] = []
    for raw in items:
        if not isinstance(raw, dict):
            continue
        # 'audio' is a binary privacy flag returned via fields=can_see_audio.
        audio_visible = bool(raw.get("can_see_audio", 1))
        parsed.append(
            User(
                id=int(raw.get("id", 0)),
                first_name=str(raw.get("first_name") or "").strip(),
                last_name=str(raw.get("last_name") or "").strip(),
                photo=_photo(raw),
                audio_visible=audio_visible,
            )
        )
    visible = sum(1 for u in parsed if u.audio_visible)
    return FriendList(items=parsed, count=int(response.get("count", len(parsed))), visible_count=visible)


def parse_user(response: Any) -> User | None:
    if not isinstance(response, list) or not response:
        return None
    raw = response[0]
    if not isinstance(raw, dict):
        return None
    return User(
        id=int(raw.get("id", 0)),
        first_name=str(raw.get("first_name") or "").strip(),
        last_name=str(raw.get("last_name") or "").strip(),
        photo=_photo(raw),
        audio_visible=True,
    )
