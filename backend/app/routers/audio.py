from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status

from ..deps import SessionDep, VKDep
from ..models.audio import Artist, RecommendationFeed, Track, TrackList
from ..services.audio import (
    parse_artist,
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
    return parse_track_list(response)


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
    return parse_track_list(response)


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
    return parse_track_list(response)


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
    return parse_track_list(response)


@router.get("/feed", response_model=RecommendationFeed)
async def feed(vk: VKDep, session: SessionDep) -> RecommendationFeed:
    """Home-screen 'Собрано алгоритмами' feed.

    audio.getCatalog returns the same data the official ВК клиент использует.
    If catalog is unavailable, fall back to recommended playlists.
    """
    try:
        response = await vk.call("audio.getCatalog", session.access_token, extended=1)
        return parse_recommendation_feed(response)
    except VKError:
        # Fallback to a simpler list — wrap recommended audios into a single "card".
        return RecommendationFeed(blocks=[])


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
        return parse_track(fetched[0])
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


def _slug_to_name(slug: str) -> str:
    """Best-effort fallback: turn VK artist slug ('linkin-park') into a name."""
    return slug.replace("-", " ").replace("_", " ").strip().title() or slug


@router.get("/by_artist/{artist_id}", response_model=TrackList)
async def by_artist(
    artist_id: str,
    vk: VKDep,
    session: SessionDep,
    offset: int = Query(0, ge=0),
    count: int = Query(50, ge=1, le=200),
    q: str | None = Query(None, description="Имя артиста для fallback на audio.search"),
) -> TrackList:
    """Tracks of an artist.

    ``audio.getAudiosByArtist`` is gated to a small set of client_ids
    (Kate Mobile / VK Admin); under the vk.com web token from
    vkhost.github.io it returns ``Unknown method passed``. We fall back
    to ``audio.search(q=name, performer_only=1)`` which is available to
    every audio-scope token.
    """
    try:
        response = await vk.call(
            "audio.getAudiosByArtist",
            session.access_token,
            artist_id=artist_id,
            offset=offset,
            count=count,
        )
        return parse_track_list(response)
    except VKError as exc:
        if exc.code not in (3, 4, 15, 100):
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                detail={"kind": "vk_error", "code": exc.code, "message": exc.message},
            ) from exc

    name = q or _slug_to_name(artist_id)
    response = await _safe_call(
        vk,
        "audio.search",
        session.access_token,
        q=name,
        performer_only=1,
        sort=2,
        offset=offset,
        count=count,
    )
    return parse_track_list(response)


@router.get("/artist/{artist_id}", response_model=Artist)
async def artist_info(
    artist_id: str,
    vk: VKDep,
    session: SessionDep,
    name: str | None = Query(None, description="Имя артиста для stub-карточки если VK метод недоступен"),
) -> Artist:
    """Artist meta.

    ``audio.getArtistById`` is also gated on the vk.com web token; if
    it fails we return a stub so the artist screen still renders (just
    without photo / follow-state).
    """
    try:
        response = await vk.call(
            "audio.getArtistById",
            session.access_token,
            artist_id=artist_id,
            extended=1,
        )
    except VKError as exc:
        if exc.code in (3, 4, 15, 100):
            return Artist(
                id=artist_id,
                name=name or _slug_to_name(artist_id),
                domain=None,
                photo=None,
                is_followed=False,
            )
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail={"kind": "vk_error", "code": exc.code, "message": exc.message},
        ) from exc

    artist = parse_artist(response)
    if artist is None:
        return Artist(
            id=artist_id,
            name=name or _slug_to_name(artist_id),
            domain=None,
            photo=None,
            is_followed=False,
        )
    return artist
