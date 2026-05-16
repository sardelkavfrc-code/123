"""Audio domain logic: normalises raw VK API responses to our models."""

from __future__ import annotations

from typing import Any

from ..models.audio import (
    Artist,
    RecommendationBlock,
    RecommendationFeed,
    Track,
    TrackArtist,
    TrackList,
)


def _artist(raw: dict[str, Any]) -> TrackArtist:
    return TrackArtist(
        name=str(raw.get("name") or ""),
        id=str(raw["id"]) if raw.get("id") is not None else None,
        domain=str(raw.get("domain")) if raw.get("domain") else None,
    )


def _best_cover(audio: dict[str, Any]) -> str | None:
    album = audio.get("album") or {}
    thumb = album.get("thumb") or {}
    for key in ("photo_1200", "photo_600", "photo_300", "photo_270", "photo_135", "photo_68"):
        if thumb.get(key):
            return str(thumb[key])
    return None


def parse_track(audio: dict[str, Any]) -> Track:
    return Track(
        id=int(audio.get("id", 0)),
        owner_id=int(audio.get("owner_id", 0)),
        title=str(audio.get("title") or "Без названия").strip(),
        artist=str(audio.get("artist") or "Неизвестный").strip(),
        duration=int(audio.get("duration", 0) or 0),
        url=str(audio.get("url") or ""),
        album_cover=_best_cover(audio),
        album_title=str(((audio.get("album") or {}).get("title") or "") or "") or None,
        main_artists=[_artist(a) for a in (audio.get("main_artists") or [])],
        featured_artists=[_artist(a) for a in (audio.get("featured_artists") or [])],
        is_explicit=bool(audio.get("is_explicit") or False),
        lyrics_id=int(audio["lyrics_id"]) if audio.get("lyrics_id") else None,
        date=int(audio.get("date", 0) or 0),
    )


def parse_track_list(response: Any) -> TrackList:
    if isinstance(response, dict):
        items = response.get("items") or []
        count = int(response.get("count", len(items)) or 0)
        next_from = response.get("next_from") or None
    elif isinstance(response, list):
        items = response
        count = len(items)
        next_from = None
    else:
        items = []
        count = 0
        next_from = None
    return TrackList(
        items=[parse_track(audio) for audio in items if isinstance(audio, dict)],
        count=count,
        next_from=str(next_from) if next_from else None,
    )


_ACCENT_PALETTE: list[str] = [
    "linear-gradient(135deg, #1a8cff 0%, #2a4eff 50%, #6d3cff 100%)",
    "linear-gradient(135deg, #c930ff 0%, #ff2fa7 100%)",
    "linear-gradient(135deg, #16d1cf 0%, #1e90ff 100%)",
    "linear-gradient(135deg, #6c5ce7 0%, #a55eea 100%)",
    "linear-gradient(135deg, #ff5e7e 0%, #ff2ea2 100%)",
    "linear-gradient(135deg, #2bc48a 0%, #0090ff 100%)",
]


def parse_recommendation_feed(response: Any) -> RecommendationFeed:
    """Parse audio.getCatalog response into card blocks for the home screen.

    The catalog response is deeply nested. We extract any section that smells
    like "made by algorithms" — sections with subtype 'recoms' / 'editorial'
    that contain playlist blocks. We then build cards out of the inner items.
    """

    blocks: list[RecommendationBlock] = []
    if not isinstance(response, dict):
        return RecommendationFeed(blocks=blocks)

    catalog = response.get("catalog") or response
    sections = catalog.get("sections") or []

    raw_playlists: list[dict[str, Any]] = list(response.get("playlists") or [])
    raw_blocks: list[dict[str, Any]] = list(response.get("blocks") or catalog.get("blocks") or [])

    def push(item: dict[str, Any]) -> None:
        if not isinstance(item, dict):
            return
        pid = item.get("id") or item.get("playlist_id")
        if pid is None:
            return
        owner_id = item.get("owner_id")
        photo = (
            (item.get("photo") or {}).get("photo_600")
            or (item.get("photo") or {}).get("photo_300")
            or (item.get("photo") or {}).get("photo_135")
            or (item.get("thumbs") or [{}])[0].get("photo_600")
            if item.get("thumbs")
            else None
        )
        accent = _ACCENT_PALETTE[len(blocks) % len(_ACCENT_PALETTE)]
        blocks.append(
            RecommendationBlock(
                id=f"{owner_id}_{pid}" if owner_id is not None else str(pid),
                title=str(item.get("title") or "Плейлист"),
                subtitle=str(item.get("subtitle") or item.get("description") or "") or None,
                cover=photo,
                accent=accent,
                playlist_id=str(pid),
                owner_id=int(owner_id) if owner_id is not None else None,
                track_count=int(item.get("count") or 0) or None,
            )
        )

    for pl in raw_playlists:
        push(pl)

    for sec in sections:
        for b in sec.get("blocks") or []:
            if isinstance(b, dict) and b.get("data_type") in {"music_playlists", "music_playlist"}:
                for pid in b.get("playlists_ids") or []:
                    match = next(
                        (
                            p
                            for p in raw_playlists
                            if str(p.get("id")) == str(pid)
                            or f"{p.get('owner_id')}_{p.get('id')}" == str(pid)
                        ),
                        None,
                    )
                    if match:
                        push(match)
        for b in raw_blocks:
            if isinstance(b, dict) and b.get("data_type") in {"music_playlists", "music_playlist"}:
                for pid in b.get("playlists_ids") or []:
                    match = next(
                        (
                            p
                            for p in raw_playlists
                            if str(p.get("id")) == str(pid)
                            or f"{p.get('owner_id')}_{p.get('id')}" == str(pid)
                        ),
                        None,
                    )
                    if match:
                        push(match)

    # Deduplicate while preserving order.
    seen: set[str] = set()
    unique: list[RecommendationBlock] = []
    for block in blocks:
        if block.id in seen:
            continue
        seen.add(block.id)
        unique.append(block)

    return RecommendationFeed(blocks=unique)


def parse_artist(payload: Any) -> Artist | None:
    if not isinstance(payload, dict):
        return None
    artist = payload.get("artist") or payload
    if not isinstance(artist, dict):
        return None
    photo = None
    photos = artist.get("photo") or []
    if isinstance(photos, list) and photos:
        # photos are sorted by size ascending in VK responses
        photo = str(photos[-1].get("url") or photos[0].get("url") or "") or None
    return Artist(
        id=str(artist.get("id") or artist.get("domain") or ""),
        name=str(artist.get("name") or "Артист"),
        domain=str(artist.get("domain") or "") or None,
        photo=photo,
        is_followed=bool(artist.get("is_followed") or False),
    )
