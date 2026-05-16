"""Persistent token storage (json file in user home).

We intentionally don't encrypt the file — desktop OS userspace permissions are
the trust boundary here, same as for any browser keychain-less app. The user
can also opt to store the token only for the current session from the UI.
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path

from .config import get_settings


@dataclass
class Session:
    access_token: str
    user_id: int
    expires_at: int = 0  # unix seconds; 0 = no expiry known


def _path() -> Path:
    return get_settings().session_file


def load() -> Session | None:
    path = _path()
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict) or "access_token" not in data or "user_id" not in data:
        return None
    return Session(
        access_token=str(data["access_token"]),
        user_id=int(data["user_id"]),
        expires_at=int(data.get("expires_at", 0)),
    )


def save(session: Session) -> None:
    path = _path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(asdict(session), ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass  # Windows or restricted FS


def clear() -> None:
    path = _path()
    if path.exists():
        path.unlink(missing_ok=True)
