"""Audio domain logic: normalises raw VK API responses to our models."""

from __future__ import annotations

from typing import Any

from ..models.audio import (
    Artist,
    ArtistAlbum,
    ArtistAlbums,
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


def _playlist_cover(item: dict[str, Any]) -> str | None:
    """Pick the largest reasonable cover from a playlist dict.

    VK exposes covers in three shapes depending on the endpoint:
    ``item.photo.photo_{600,300,135}`` (the most common), ``item.thumbs[0].photo_*``
    (newer catalog responses), and ``item.photo.sizes[]`` (audio-search responses).
    """

    photo = item.get("photo")
    if isinstance(photo, dict):
        for key in ("photo_1200", "photo_600", "photo_300", "photo_270", "photo_135", "photo_68"):
            if photo.get(key):
                return str(photo[key])
        sizes = photo.get("sizes")
        if isinstance(sizes, list) and sizes:
            last = sizes[-1]
            if isinstance(last, dict) and last.get("url"):
                return str(last["url"])

    thumbs = item.get("thumbs")
    if isinstance(thumbs, list) and thumbs:
        first = thumbs[0]
        if isinstance(first, dict):
            for key in ("photo_1200", "photo_600", "photo_300", "photo_270", "photo_135", "photo_68"):
                if first.get(key):
                    return str(first[key])

    return None


def _playlist_id_keys(item: dict[str, Any]) -> set[str]:
    """All identifier shapes a playlist might be referenced by elsewhere."""
    pid = item.get("id")
    owner = item.get("owner_id")
    keys: set[str] = set()
    if pid is not None:
        keys.add(str(pid))
    if pid is not None and owner is not None:
        keys.add(f"{owner}_{pid}")
    if item.get("playlist_id") is not None:
        keys.add(str(item["playlist_id"]))
    return keys


_PLAYLIST_BLOCK_TYPES = {
    "music_playlists",
    "music_playlist",
    "catalog_banners",
    "music_recommended_playlists",
    "music_editorial_playlists",
}

_RECOMMENDATIONS_LAYOUTS = {"recomms_slider"}
_MOOD_HEADER_TITLES = {"настроения и занятия", "настроения и\u00a0занятия"}
_ALBUM_BLOCK_HEADERS = {"релизы", "альбомы", "синглы", "ep", "мини-альбомы"}
_ALBUM_TYPES = {"main_only", "collection", "main_feat", "single", "album", "ep"}


def _int_or_none(value: Any) -> int | None:
    try:
        if value is None:
            return None
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed


def _card_from_playlist(item: dict[str, Any], accent_index: int) -> RecommendationBlock | None:
    pid = item.get("id") or item.get("playlist_id")
    if pid is None:
        return None
    owner_id = _int_or_none(item.get("owner_id"))
    track_count = _int_or_none(item.get("count"))
    accent = item.get("main_color")
    if isinstance(accent, str) and accent.startswith("#"):
        accent = f"linear-gradient(135deg, {accent}, rgba(255,255,255,0.18))"
    else:
        accent = _ACCENT_PALETTE[accent_index % len(_ACCENT_PALETTE)]
    return RecommendationBlock(
        id=f"{owner_id}_{pid}" if owner_id is not None else str(pid),
        title=str(item.get("title") or "Плейлист"),
        subtitle=str(item.get("subtitle") or item.get("description") or "") or None,
        cover=_playlist_cover(item),
        accent=accent,
        playlist_id=str(pid),
        owner_id=owner_id,
        access_key=str(item.get("access_key") or "") or None,
        track_count=track_count,
    )


def parse_recommendation_feed(response: Any) -> RecommendationFeed:
    """Parse audio.getCatalog response into card blocks for the home screen.

    The catalog payload is deeply nested and the shape varies across VK API
    versions: sometimes the playlists are pre-listed under ``response.playlists``
    with cards in ``response.catalog.sections[].blocks[].playlists_ids``,
    sometimes they are inlined into ``response.audios``, sometimes ``response``
    *is* the catalog and there is no outer envelope at all. We try all known
    layouts and return whichever yielded the most cards.
    """

    blocks: list[RecommendationBlock] = []
    if not isinstance(response, dict):
        return RecommendationFeed(blocks=blocks)

    catalog = response.get("catalog") if isinstance(response.get("catalog"), dict) else response
    sections = catalog.get("sections") if isinstance(catalog.get("sections"), list) else []

    raw_playlists: list[dict[str, Any]] = []
    for source in (response.get("playlists"), catalog.get("playlists"), response.get("audios")):
        if isinstance(source, list):
            raw_playlists.extend(p for p in source if isinstance(p, dict))

    raw_blocks: list[dict[str, Any]] = []
    for source in (response.get("blocks"), catalog.get("blocks")):
        if isinstance(source, list):
            raw_blocks.extend(b for b in source if isinstance(b, dict))

    def push(item: Any) -> None:
        if not isinstance(item, dict):
            return
        card = _card_from_playlist(item, len(blocks))
        if card is not None:
            blocks.append(card)

    def find_match(pid: Any) -> dict[str, Any] | None:
        needle = str(pid)
        for p in raw_playlists:
            if needle in _playlist_id_keys(p):
                return p
        return None

    # 1. Walk every block in every section and resolve referenced playlists.
    # Prefer VK's daily "Собрано алгоритмами" block instead of unrelated
    # catalog playlist groups such as genres.
    for sec in sections:
        if not isinstance(sec, dict):
            continue
        section_blocks = sec.get("blocks") if isinstance(sec.get("blocks"), list) else []
        for b in section_blocks:
            if not isinstance(b, dict):
                continue
            data_type = str(b.get("data_type") or "")
            layout_name = str((b.get("layout") or {}).get("name") or "")
            if data_type in _PLAYLIST_BLOCK_TYPES and layout_name in _RECOMMENDATIONS_LAYOUTS:
                for pid in b.get("playlists_ids") or []:
                    match = find_match(pid)
                    if match is not None:
                        push(match)
            # Some catalog versions inline the playlist payload directly.
            if layout_name in _RECOMMENDATIONS_LAYOUTS:
                for inline in b.get("playlists") or []:
                    push(inline)

    # 2. Top-level / catalog-level blocks (older shape).
    for b in raw_blocks:
        data_type = str(b.get("data_type") or "")
        layout_name = str((b.get("layout") or {}).get("name") or "")
        if data_type in _PLAYLIST_BLOCK_TYPES and layout_name in _RECOMMENDATIONS_LAYOUTS:
            for pid in b.get("playlists_ids") or []:
                match = find_match(pid)
                if match is not None:
                    push(match)
        if layout_name in _RECOMMENDATIONS_LAYOUTS:
            for inline in b.get("playlists") or []:
                push(inline)

    # 3. Fallback: if no section/block referenced anything, just surface the
    #    flat list of playlists. Better an unsorted set of cards than empty.
    if not blocks:
        for pl in raw_playlists:
            push(pl)

    # Deduplicate while preserving order.
    seen: set[str] = set()
    unique: list[RecommendationBlock] = []
    for block in blocks:
        if block.id in seen:
            continue
        seen.add(block.id)
        unique.append(block)

    return RecommendationFeed(blocks=unique)


def parse_mood_feed(response: Any) -> RecommendationFeed:
    blocks: list[RecommendationBlock] = []
    if not isinstance(response, dict):
        return RecommendationFeed(title="Настроения и занятия", blocks=blocks)

    catalog = response.get("catalog") if isinstance(response.get("catalog"), dict) else response
    sections = catalog.get("sections") if isinstance(catalog.get("sections"), list) else []
    raw_playlists: list[dict[str, Any]] = []
    for source in (response.get("playlists"), catalog.get("playlists")):
        if isinstance(source, list):
            raw_playlists.extend(p for p in source if isinstance(p, dict))

    def find_match(pid: Any) -> dict[str, Any] | None:
        needle = str(pid)
        for p in raw_playlists:
            if needle in _playlist_id_keys(p):
                return p
        return None

    for sec in sections:
        if not isinstance(sec, dict):
            continue
        section_blocks = sec.get("blocks") if isinstance(sec.get("blocks"), list) else []
        mood_header_seen = False
        for b in section_blocks:
            if not isinstance(b, dict):
                continue
            layout = b.get("layout") or {}
            layout_name = str(layout.get("name") or "")
            title = str(layout.get("title") or b.get("title") or "").lower()
            if layout_name == "header":
                mood_header_seen = title in _MOOD_HEADER_TITLES
                continue
            if not mood_header_seen or b.get("data_type") != "music_playlists":
                continue
            for pid in b.get("playlists_ids") or []:
                match = find_match(pid)
                if match is not None:
                    card = _card_from_playlist(match, len(blocks))
                    if card is not None:
                        blocks.append(card)
            for inline in b.get("playlists") or []:
                if isinstance(inline, dict):
                    card = _card_from_playlist(inline, len(blocks))
                    if card is not None:
                        blocks.append(card)
            break

    seen: set[str] = set()
    unique: list[RecommendationBlock] = []
    for block in blocks:
        if block.id in seen:
            continue
        seen.add(block.id)
        unique.append(block)

    return RecommendationFeed(title="Настроения и занятия", blocks=unique)


def parse_artist_albums(response: Any) -> ArtistAlbums:
    if not isinstance(response, dict):
        return ArtistAlbums()

    section = response.get("section") if isinstance(response.get("section"), dict) else {}
    raw_playlists = response.get("playlists") if isinstance(response.get("playlists"), list) else []
    playlists = {key: p for p in raw_playlists if isinstance(p, dict) for key in _playlist_id_keys(p)}

    albums: list[ArtistAlbum] = []
    current_header = ""
    for block in section.get("blocks") or []:
        if not isinstance(block, dict):
            continue
        layout = block.get("layout") or {}
        layout_name = str(layout.get("name") or "")
        if layout_name == "header":
            current_header = str(layout.get("title") or block.get("title") or "").lower()
            continue
        if block.get("data_type") != "music_playlists" or current_header not in _ALBUM_BLOCK_HEADERS:
            continue
        block_playlists = list(block.get("playlists_ids") or [])
        block_playlists.extend(
            f"{p.get('owner_id')}_{p.get('id')}" for p in (block.get("playlists") or []) if isinstance(p, dict)
        )
        if not block_playlists:
            block_playlists = [f"{p.get('owner_id')}_{p.get('id')}" for p in raw_playlists if isinstance(p, dict)]
        for pid in block_playlists:
            playlist = playlists.get(str(pid))
            if not playlist:
                continue
            album_type = str(playlist.get("album_type") or "") or None
            if album_type and album_type not in _ALBUM_TYPES:
                continue
            album_id = _int_or_none(playlist.get("id"))
            owner_id = _int_or_none(playlist.get("owner_id"))
            if album_id is None or owner_id is None:
                continue
            albums.append(
                ArtistAlbum(
                    id=album_id,
                    owner_id=owner_id,
                    title=str(playlist.get("title") or "Альбом"),
                    subtitle=str(playlist.get("subtitle") or playlist.get("description") or "") or None,
                    cover=_playlist_cover(playlist),
                    access_key=str(playlist.get("access_key") or "") or None,
                    track_count=_int_or_none(playlist.get("count")),
                    year=_int_or_none(playlist.get("year")),
                    album_type=album_type,
                )
            )

    seen: set[str] = set()
    unique: list[ArtistAlbum] = []
    for album in albums:
        if album.full_id in seen:
            continue
        seen.add(album.full_id)
        unique.append(album)
    return ArtistAlbums(items=unique, count=len(unique))


def parse_artist(payload: Any) -> Artist | None:
    if not isinstance(payload, dict):
        return None
    artist = payload.get("artist") or payload
    if "catalog" in artist:
        sections = ((artist.get("catalog") or {}).get("sections") or [])
        if sections and isinstance(sections[0], dict):
            artist = {
                "id": sections[0].get("id") or sections[0].get("url") or "",
                "name": sections[0].get("title") or "Артист",
            }
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
