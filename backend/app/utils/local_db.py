import sqlite3
import time
from pathlib import Path

from ..config import get_settings


def _get_db_path() -> Path:
    settings = get_settings()
    return settings.session_dir / "local_tracks.db"

def init_db():
    db_path = _get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS local_tracks (
                path TEXT PRIMARY KEY,
                id INTEGER NOT NULL UNIQUE,
                title TEXT,
                artist TEXT,
                album TEXT,
                duration INTEGER NOT NULL,
                has_cover INTEGER NOT NULL DEFAULT 0,
                added_at REAL NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_local_tracks_id ON local_tracks(id)")
        conn.commit()

def clear_tracks():
    db_path = _get_db_path()
    init_db()
    with sqlite3.connect(db_path) as conn:
        conn.execute("DELETE FROM local_tracks")
        conn.commit()

def add_tracks(tracks: list[dict]):
    db_path = _get_db_path()
    init_db()
    with sqlite3.connect(db_path) as conn:
        conn.executemany("""
            INSERT OR REPLACE INTO local_tracks 
            (path, id, title, artist, album, duration, has_cover, added_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, [
            (
                t["path"],
                t["id"],
                t["title"],
                t["artist"],
                t["album"],
                t["duration"],
                t["has_cover"],
                t.get("added_at", time.time())
            )
            for t in tracks
        ])
        conn.commit()

def get_all_tracks() -> list[dict]:
    db_path = _get_db_path()
    init_db()
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.execute("SELECT * FROM local_tracks ORDER BY added_at DESC, path ASC")
        return [dict(row) for row in cursor.fetchall()]

def get_track_by_id(track_id: int) -> dict | None:
    db_path = _get_db_path()
    init_db()
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.execute("SELECT * FROM local_tracks WHERE id = ?", (track_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def delete_track(track_id: int):
    db_path = _get_db_path()
    init_db()
    with sqlite3.connect(db_path) as conn:
        conn.execute("DELETE FROM local_tracks WHERE id = ?", (track_id,))
        conn.commit()
