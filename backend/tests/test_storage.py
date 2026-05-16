from __future__ import annotations

import json
from pathlib import Path

from app import storage
from app.config import get_settings


def _use_tmp_session_file(tmp_path: Path) -> Path:
    # session_file is a computed property over session_dir — override the dir.
    get_settings.cache_clear()  # type: ignore[attr-defined]
    settings = get_settings()
    settings.session_dir = tmp_path
    return tmp_path / "session.json"


def test_load_missing_file(tmp_path: Path) -> None:
    path = _use_tmp_session_file(tmp_path)
    assert not path.exists()
    assert storage.load() is None


def test_load_valid_session(tmp_path: Path) -> None:
    path = _use_tmp_session_file(tmp_path)
    path.write_text(json.dumps({"access_token": "tok", "user_id": 42, "expires_at": 100}))
    loaded = storage.load()
    assert loaded is not None
    assert loaded.access_token == "tok"
    assert loaded.user_id == 42
    assert loaded.expires_at == 100


def test_load_null_expires_at_does_not_crash(tmp_path: Path) -> None:
    """T12 regression: planting a session with ``expires_at: null`` used to raise
    TypeError → /auth/status 500. Now we coerce to 0 so /auth/status can call VK,
    discover the token is bad, and clear the file via storage.clear()."""
    path = _use_tmp_session_file(tmp_path)
    path.write_text(json.dumps({"access_token": "x", "user_id": 1, "expires_at": None}))
    loaded = storage.load()
    assert loaded is not None
    assert loaded.access_token == "x"
    assert loaded.user_id == 1
    assert loaded.expires_at == 0


def test_load_garbage_file_is_cleared(tmp_path: Path) -> None:
    path = _use_tmp_session_file(tmp_path)
    path.write_text("{not json")
    assert storage.load() is None
    assert not path.exists()


def test_load_missing_required_fields_is_cleared(tmp_path: Path) -> None:
    path = _use_tmp_session_file(tmp_path)
    path.write_text(json.dumps({"access_token": "x"}))  # no user_id
    assert storage.load() is None
    assert not path.exists()


def test_save_then_load_roundtrip(tmp_path: Path) -> None:
    _use_tmp_session_file(tmp_path)
    storage.save(storage.Session(access_token="t", user_id=7, expires_at=0))
    loaded = storage.load()
    assert loaded is not None
    assert loaded.access_token == "t"
    assert loaded.user_id == 7
    assert loaded.expires_at == 0
