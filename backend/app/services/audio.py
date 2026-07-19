"""Audio domain logic: normalises raw VK API responses to our models."""

from __future__ import annotations

from typing import Any

from ..models.audio import (
    AlbumList,
    AlbumSummary,
    Artist,
    CatalogSearchResult,
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


def _cover_small(thumb: dict[str, Any]) -> str | None:
    for key in ("photo_135", "photo_270", "photo_300", "photo_600"):
        if thumb.get(key):
            return str(thumb[key])
    return None

def _cover_medium(thumb: dict[str, Any]) -> str | None:
    for key in ("photo_300", "photo_600", "photo_1200"):
        if thumb.get(key):
            return str(thumb[key])
    return None

def _cover_large(thumb: dict[str, Any]) -> str | None:
    for key in ("photo_600", "photo_1200", "photo_300"):
        if thumb.get(key):
            return str(thumb[key])
    return None

def parse_track(audio: dict[str, Any]) -> Track:
    thumb = (audio.get("album") or {}).get("thumb") or {}
    return Track(
        id=int(audio.get("id", 0)),
        owner_id=int(audio.get("owner_id", 0)),
        title=str(audio.get("title") or "Без названия").strip(),
        subtitle=str(audio.get("subtitle")).strip() if audio.get("subtitle") else None,
        artist=str(audio.get("artist") or "Неизвестный").strip(),
        duration=int(audio.get("duration", 0) or 0),
        url=str(audio.get("url") or ""),
        cover_small=_cover_small(thumb),
        cover_medium=_cover_medium(thumb),
        cover_large=_cover_large(thumb),
        album_title=str(((audio.get("album") or {}).get("title") or "") or "") or None,
        main_artists=[_artist(a) for a in (audio.get("main_artists") or [])],
        featured_artists=[_artist(a) for a in (audio.get("featured_artists") or [])],
        is_explicit=bool(audio.get("is_explicit") or False),
        lyrics_id=int(audio["lyrics_id"]) if audio.get("lyrics_id") else None,
        date=int(audio.get("date", 0) or 0),
        access_key=str(audio["access_key"]) if audio.get("access_key") else None,
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

    def card_from_playlist(item: dict[str, Any]) -> RecommendationBlock | None:
        pid = item.get("id") or item.get("playlist_id")
        if pid is None:
            return None
        owner_id_raw = item.get("owner_id")
        try:
            owner_id = int(owner_id_raw) if owner_id_raw is not None else None
        except (TypeError, ValueError):
            owner_id = None
        accent = _ACCENT_PALETTE[len(blocks) % len(_ACCENT_PALETTE)]
        try:
            track_count: int | None = int(item.get("count") or 0) or None
        except (TypeError, ValueError):
            track_count = None
        return RecommendationBlock(
            id=f"{owner_id}_{pid}" if owner_id is not None else str(pid),
            title=str(item.get("title") or "Плейлист"),
            subtitle=str(item.get("subtitle") or item.get("description") or "") or None,
            cover=_playlist_cover(item),
            accent=accent,
            playlist_id=str(pid),
            owner_id=owner_id,
            track_count=track_count,
        )

    def push(item: Any) -> None:
        if not isinstance(item, dict):
            return
        card = card_from_playlist(item)
        if card is not None:
            blocks.append(card)

    def find_match(pid: Any) -> dict[str, Any] | None:
        needle = str(pid)
        for p in raw_playlists:
            if needle in _playlist_id_keys(p):
                return p
        return None

    # 1. Walk every block in every section and resolve referenced playlists.
    for sec in sections:
        if not isinstance(sec, dict):
            continue
        section_blocks = sec.get("blocks") if isinstance(sec.get("blocks"), list) else []
        for b in section_blocks:
            if not isinstance(b, dict):
                continue
            data_type = str(b.get("data_type") or "")
            if data_type in _PLAYLIST_BLOCK_TYPES:
                for pid in b.get("playlists_ids") or []:
                    match = find_match(pid)
                    if match is not None:
                        push(match)
            # Some catalog versions inline the playlist payload directly.
            for inline in b.get("playlists") or []:
                push(inline)

    # 2. Top-level / catalog-level blocks (older shape).
    for b in raw_blocks:
        data_type = str(b.get("data_type") or "")
        if data_type in _PLAYLIST_BLOCK_TYPES:
            for pid in b.get("playlists_ids") or []:
                match = find_match(pid)
                if match is not None:
                    push(match)
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


_RECO_CARD_TITLES: list[tuple[str, str]] = [
    ("Микс для тебя", "Свежие рекомендации ВК"),
    ("Открытия дня", "Новое для твоего вкуса"),
    ("Под настроение", "Подобрано алгоритмами"),
    ("Можешь зайти", "Близкое тому, что слушаешь"),
    ("Тренды твоего круга", "Что на повторе у похожих слушателей"),
    ("Залипнуть надолго", "Глубокие сеты для фона"),
]


def build_virtual_feed(tracks: list[Track], *, per_block: int = 8) -> RecommendationFeed:
    """Build a RecommendationFeed out of an unsorted track list.

    ``audio.getCatalog`` is blocked for the OAuth client we use, so we slice
    the response of ``audio.getRecommendations`` into fixed-size chunks and
    label them with friendly Russian titles. The cover of the first track in
    each chunk is reused as the card art so the home screen stays visual.
    """

    blocks: list[RecommendationBlock] = []
    if not tracks:
        return RecommendationFeed(blocks=blocks)

    # Filter out tracks without a URL — they can't be played anyway and they
    # don't carry useful metadata.
    playable = [t for t in tracks if t.url]
    if not playable:
        playable = tracks

    palette = _ACCENT_PALETTE
    pool = playable
    seen_ids: set[str] = set()
    idx = 0
    while idx < len(pool) and len(blocks) < len(_RECO_CARD_TITLES):
        chunk: list[Track] = []
        while idx < len(pool) and len(chunk) < per_block:
            t = pool[idx]
            key = f"{t.owner_id}_{t.id}"
            if key not in seen_ids:
                seen_ids.add(key)
                chunk.append(t)
            idx += 1
        if not chunk:
            break
        title, subtitle = _RECO_CARD_TITLES[len(blocks)]
        cover = next((t.album_cover for t in chunk if t.album_cover), None)
        blocks.append(
            RecommendationBlock(
                id=f"reco_{len(blocks)}",
                title=title,
                subtitle=subtitle,
                cover=cover,
                accent=palette[len(blocks) % len(palette)],
                track_count=len(chunk),
                tracks=chunk,
            )
        )
    return RecommendationFeed(blocks=blocks)


def _album_cover(item: dict[str, Any]) -> str | None:
    return _playlist_cover(item)


def _album_year(item: dict[str, Any]) -> int | None:
    for key in ("year", "release_year", "year_released"):
        v = item.get(key)
        if v:
            try:
                return int(v)
            except (TypeError, ValueError):
                continue
    return None


def parse_albums(response: Any) -> AlbumList:
    """Normalise a VK playlists/albums response into AlbumList.

    Works for both ``audio.getAlbums`` (legacy) and ``audio.getPlaylists``
    (current). When neither is available we get a stub list back; the artist
    page degrades gracefully.
    """

    items_raw: list[Any]
    count = 0
    if isinstance(response, dict):
        items_raw = response.get("items") or []
        try:
            count = int(response.get("count") or len(items_raw))
        except (TypeError, ValueError):
            count = len(items_raw)
    elif isinstance(response, list):
        items_raw = response
        count = len(items_raw)
    else:
        items_raw = []

    albums: list[AlbumSummary] = []
    for raw in items_raw:
        if not isinstance(raw, dict):
            continue
        pid = raw.get("id") or raw.get("playlist_id")
        if pid is None:
            continue
        owner_id = raw.get("owner_id")
        try:
            owner_int = int(owner_id) if owner_id is not None else None
        except (TypeError, ValueError):
            owner_int = None
        try:
            track_count = int(raw.get("count") or 0) or None
        except (TypeError, ValueError):
            track_count = None
        albums.append(
            AlbumSummary(
                id=str(pid),
                owner_id=owner_int,
                title=str(raw.get("title") or "Альбом"),
                subtitle=str(raw.get("subtitle") or raw.get("description") or "") or None,
                cover=_album_cover(raw),
                year=_album_year(raw),
                track_count=track_count,
                type=raw.get("type"),
                main_color=raw.get("main_color"),
            )
        )
    return AlbumList(items=albums, count=count or len(albums))


def parse_artist(payload: Any) -> Artist | None:
    if not isinstance(payload, dict):
        return None
    artist = payload.get("artist") or payload
    if not isinstance(artist, dict):
        return None
        
    photo = None
    banner = None
    
    photos = artist.get("photo") or []
    if isinstance(photos, list) and photos:
        banner = str(photos[-1].get("url") or photos[0].get("url") or "") or None
        photo = banner
    elif isinstance(photos, str) and photos.startswith("http"):
        photo = photos
        banner = photos
        
    for k in ("photo_1200", "photo_600", "photo_300", "photo_200", "photo_100", "photo_50"):
        val = artist.get(k)
        if isinstance(val, str) and val.startswith("http"):
            if not photo:
                photo = val
            if not banner:
                banner = val
                
    val = artist.get("banner")
    if isinstance(val, str) and val.startswith("http"):
        banner = val
        if not photo:
            photo = val

    return Artist(
        id=str(artist.get("id") or artist.get("domain") or ""),
        name=str(artist.get("name") or "Артист"),
        domain=str(artist.get("domain") or "") or None,
        photo=photo,
        banner=banner,
        is_followed=bool(artist.get("is_followed") or False),
    )


def parse_catalog_artist(link: dict[str, Any]) -> Artist | None:
    if not isinstance(link, dict):
        return None
    meta = link.get("meta") or {}
    if meta.get("content_type") != "artist" and "artist" not in link.get("url", ""):
        return None
        
    photo = None
    images = link.get("image") or []
    if isinstance(images, list) and images:
        photo = str(images[-1].get("url") or "") or None
        
    domain = None
    url = link.get("url") or ""
    if "artist/" in url:
        domain = url.split("artist/")[-1]
        
    return Artist(
        id=str(link.get("id") or domain or ""),
        name=str(link.get("title") or "Артист"),
        domain=domain,
        photo=photo,
        banner=photo,
    )


def parse_catalog_search(response: Any) -> CatalogSearchResult:
    if not isinstance(response, dict):
        return CatalogSearchResult()
        
    artists_list = []
    seen_artists = set()
    
    raw_artists = response.get("artists") or []
    if isinstance(raw_artists, list):
        for raw in raw_artists:
            parsed = parse_artist(raw)
            if parsed and parsed.id not in seen_artists:
                seen_artists.add(parsed.id)
                artists_list.append(parsed)
                
    raw_links = response.get("links") or []
    if isinstance(raw_links, list):
        for link in raw_links:
            parsed = parse_catalog_artist(link)
            if parsed and parsed.id not in seen_artists:
                seen_artists.add(parsed.id)
                artists_list.append(parsed)
                
    playlists_list = []
    raw_playlists = response.get("playlists") or []
    parsed_albums = parse_albums(raw_playlists)
    playlists_list = parsed_albums.items
    
    tracks_list = []
    raw_audios = response.get("audios") or []
    if isinstance(raw_audios, list):
        tracks_list = [parse_track(a) for a in raw_audios if isinstance(a, dict)]
        
    return CatalogSearchResult(
        artists=artists_list,
        playlists=playlists_list,
        tracks=tracks_list,
    )
