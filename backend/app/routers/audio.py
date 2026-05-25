from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status

from ..config import get_settings
from ..deps import SessionDep, VKDep
from ..models.audio import Artist, ArtistAlbums, RecommendationFeed, Track, TrackList
from ..services.audio import (
    parse_artist,
    parse_artist_albums,
    parse_mood_feed,
    parse_recommendation_feed,
    parse_track,
    parse_track_list,
)
from ..vk.exceptions import VKError

router = APIRouter(prefix="/audio", tags=["audio"])


async def _safe_call(vk, method: str, token: str, **params):
    try:
        return await vk.call(method, token, **params)
    except VKError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail={"kind": "vk_error", "code": exc.code, "message": exc.message},
        ) from exc


def _replace_artwork_size(url: str) -> str:
    return (
        url.replace("100x100bb.jpg", "600x600bb.jpg")
        .replace("100x100bb.png", "600x600bb.png")
        .replace("100x100-999.jpg", "600x600-999.jpg")
        .replace("100x100-999.png", "600x600-999.png")
    )


async def _find_itunes_cover(vk, track: Track) -> str | None:
    query = f"{track.artist} {track.title}".strip()
    if not query:
        return None
    try:
        response = await vk.external_get(
            "https://itunes.apple.com/search",
            params={"term": query, "entity": "song", "limit": 1, "country": "US"},
        )
        response.raise_for_status()
        payload = response.json()
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    results = payload.get("results")
    if not isinstance(results, list) or not results:
        return None
    first = results[0]
    if not isinstance(first, dict):
        return None
    cover = first.get("artworkUrl100")
    return _replace_artwork_size(str(cover)) if cover else None


def _cover_from_genius_hit(track: Track, hit: dict) -> str | None:
    result = hit.get("result")
    if not isinstance(result, dict):
        return None
    title = str(result.get("title") or result.get("full_title") or "").lower()
    primary_artist = result.get("primary_artist")
    artist_name = ""
    if isinstance(primary_artist, dict):
        artist_name = str(primary_artist.get("name") or "").lower()
    query_title = track.title.lower()
    query_artist = track.artist.lower()
    if query_title and query_title not in title:
        return None
    if artist_name and query_artist and artist_name not in query_artist and query_artist not in artist_name:
        return None
    cover = result.get("song_art_image_url") or result.get("header_image_url")
    return str(cover) if cover else None


async def _find_genius_cover(vk, track: Track) -> str | None:
    token = get_settings().genius_access_token
    if not token:
        return None
    query = f"{track.artist} {track.title}".strip()
    if not query:
        return None
    try:
        response = await vk.external_get(
            "https://api.genius.com/search",
            params={"q": query},
            headers={"Authorization": f"Bearer {token}"},
        )
        response.raise_for_status()
        payload = response.json()
    except Exception:
        return None
    hits = ((payload.get("response") or {}).get("hits") or []) if isinstance(payload, dict) else []
    for hit in hits:
        if not isinstance(hit, dict):
            continue
        cover = _cover_from_genius_hit(track, hit)
        if cover:
            return cover
    return None


async def _enrich_missing_covers(vk, tracks: list[Track]) -> list[Track]:
    for track in tracks:
        if track.album_cover:
            continue
        track.album_cover = await _find_itunes_cover(vk, track)
        if not track.album_cover:
            track.album_cover = await _find_genius_cover(vk, track)
    return tracks


async def _parse_track_list_with_covers(vk, response) -> TrackList:
    parsed = parse_track_list(response)
    await _enrich_missing_covers(vk, parsed.items)
    return parsed


@router.get("/my", response_model=TrackList)
async def my_music(
    vk: VKDep,
    session: SessionDep,
    offset: int = Query(0, ge=0),
    count: int = Query(100, ge=1, le=200),
) -> TrackList:
    response = await _safe_call(
        vk, "audio.get", session.access_token, owner_id=session.user_id, offset=offset, count=count
    )
    return await _parse_track_list_with_covers(vk, response)


@router.get("/by_owner/{owner_id}", response_model=TrackList)
async def audio_by_owner(
    owner_id: int,
    vk: VKDep,
    session: SessionDep,
    offset: int = Query(0, ge=0),
    count: int = Query(100, ge=1, le=200),
) -> TrackList:
    response = await _safe_call(
        vk, "audio.get", session.access_token, owner_id=owner_id, offset=offset, count=count
    )
    return await _parse_track_list_with_covers(vk, response)


@router.get("/search", response_model=TrackList)
async def search(
    vk: VKDep,
    session: SessionDep,
    q: str = Query(min_length=1),
    offset: int = Query(0, ge=0),
    count: int = Query(50, ge=1, le=200),
    auto_complete: bool = Query(True),
    performer_only: bool = Query(False),
    sort: int = Query(2, ge=0, le=2),
) -> TrackList:
    response = await _safe_call(
        vk,
        "audio.search",
        session.access_token,
        q=q,
        offset=offset,
        count=count,
        auto_complete=auto_complete,
        performer_only=performer_only,
        sort=sort,
    )
    return await _parse_track_list_with_covers(vk, response)


@router.get("/recommendations", response_model=TrackList)
async def recommendations(
    vk: VKDep,
    session: SessionDep,
    target_audio: str | None = Query(None, description="owner_id_audio_id для похожих треков"),
    user_id: int | None = Query(None),
    count: int = Query(50, ge=1, le=200),
    shuffle: bool = Query(False),
) -> TrackList:
    response = await _safe_call(
        vk,
        "audio.getRecommendations",
        session.access_token,
        target_audio=target_audio,
        user_id=user_id or session.user_id,
        count=count,
        shuffle=shuffle,
    )
    return await _parse_track_list_with_covers(vk, response)


@router.get("/feed", response_model=RecommendationFeed)
async def feed(vk: VKDep, session: SessionDep) -> RecommendationFeed:
    """Home-screen 'Собрано алгоритмами' feed.

    audio.getCatalog returns the same data the official ВК клиент использует.
    If catalog is unavailable, fall back to recommended playlists.
    """
    try:
        response = await vk.call("catalog.getAudio", session.access_token, need_blocks=1, lang="ru")
        return parse_recommendation_feed(response)
    except VKError:
        # Fallback to a simpler list — wrap recommended audios into a single "card".
        return RecommendationFeed(blocks=[])


@router.get("/moods", response_model=RecommendationFeed)
async def moods(vk: VKDep, session: SessionDep) -> RecommendationFeed:
    try:
        response = await vk.call("catalog.getAudio", session.access_token, need_blocks=1, lang="ru")
        return parse_mood_feed(response)
    except VKError:
        return RecommendationFeed(title="Настроения и занятия", blocks=[])


@router.get("/playlist", response_model=TrackList)
async def playlist_tracks(
    vk: VKDep,
    session: SessionDep,
    owner_id: int = Query(...),
    playlist_id: int = Query(...),
    access_key: str | None = Query(None),
    offset: int = Query(0, ge=0),
    count: int = Query(100, ge=1, le=200),
) -> TrackList:
    response = await _safe_call(
        vk,
        "audio.get",
        session.access_token,
        owner_id=owner_id,
        album_id=playlist_id,
        access_key=access_key,
        offset=offset,
        count=count,
    )
    return await _parse_track_list_with_covers(vk, response)


@router.post("/add", response_model=Track)
async def add(
    audio_id: int,
    owner_id: int,
    vk: VKDep,
    session: SessionDep,
) -> Track:
    new_id = await _safe_call(
        vk,
        "audio.add",
        session.access_token,
        audio_id=audio_id,
        owner_id=owner_id,
    )
    # audio.add returns the new audio_id under the current user.
    fetched = await _safe_call(
        vk,
        "audio.getById",
        session.access_token,
        audios=f"{session.user_id}_{int(new_id)}",
    )
    if isinstance(fetched, list) and fetched:
        parsed = parse_track(fetched[0])
        await _enrich_missing_covers(vk, [parsed])
        return parsed
    return parse_track({"id": new_id, "owner_id": session.user_id, "title": "", "artist": ""})


@router.post("/delete")
async def delete(
    audio_id: int,
    owner_id: int,
    vk: VKDep,
    session: SessionDep,
) -> dict[str, bool]:
    result = await _safe_call(
        vk,
        "audio.delete",
        session.access_token,
        audio_id=audio_id,
        owner_id=owner_id,
    )
    return {"ok": bool(result)}


@router.get("/by_artist/{artist_id}", response_model=TrackList)
async def by_artist(
    artist_id: str,
    vk: VKDep,
    session: SessionDep,
    offset: int = Query(0, ge=0),
    count: int = Query(50, ge=1, le=200),
) -> TrackList:
    response = await _safe_call(
        vk,
        "audio.getAudiosByArtist",
        session.access_token,
        artist_id=artist_id,
        offset=offset,
        count=count,
    )
    return await _parse_track_list_with_covers(vk, response)


@router.get("/artist/{artist_id}/albums", response_model=ArtistAlbums)
async def artist_albums(
    artist_id: str,
    vk: VKDep,
    session: SessionDep,
) -> ArtistAlbums:
    catalog_response = await _safe_call(
        vk,
        "catalog.getAudioArtist",
        session.access_token,
        artist_id=artist_id,
    )
    sections = ((catalog_response or {}).get("catalog") or {}).get("sections") or []
    if not sections:
        return ArtistAlbums()
    section = sections[0]
    if not isinstance(section, dict) or not section.get("id"):
        return ArtistAlbums()
    section_response = await _safe_call(
        vk,
        "catalog.getSection",
        session.access_token,
        section_id=section["id"],
    )
    albums = parse_artist_albums(section_response)
    if albums.items:
        return albums

    search_response = await _safe_call(
        vk,
        "audio.searchAlbums",
        session.access_token,
        q=artist_id,
        count=20,
    )
    items = search_response.get("items") if isinstance(search_response, dict) else []
    return parse_artist_albums(
        {
            "section": {
                "blocks": [
                    {
                        "data_type": "none",
                        "layout": {"name": "header", "title": "Релизы"},
                    },
                    {
                        "data_type": "music_playlists",
                        "layout": {"name": "large_slider"},
                        "playlists_ids": [f"{p.get('owner_id')}_{p.get('id')}" for p in items if isinstance(p, dict)],
                    },
                ]
            },
            "playlists": items,
        }
    )


@router.get("/artist/{artist_id}", response_model=Artist)
async def artist_info(
    artist_id: str,
    vk: VKDep,
    session: SessionDep,
) -> Artist:
    try:
        response = await vk.call(
            "audio.getArtistById",
            session.access_token,
            artist_id=artist_id,
            extended=1,
        )
    except VKError:
        response = await _safe_call(
            vk,
            "catalog.getAudioArtist",
            session.access_token,
            artist_id=artist_id,
        )
    artist = parse_artist(response)
    if artist is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Артист не найден")
    return artist
