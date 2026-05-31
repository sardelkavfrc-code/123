from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status

from ..deps import SessionDep, VKDep
from ..models.audio import AlbumList, AlbumSummary, Artist, RecommendationFeed, Track, TrackList
from ..services.audio import (
    build_virtual_feed,
    parse_albums,
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
    offset: int = Query(0, ge=0),
    count: int = Query(50, ge=1, le=200),
    shuffle: bool = Query(False),
) -> TrackList:
    response = await _safe_call(
        vk,
        "audio.getRecommendations",
        session.access_token,
        target_audio=target_audio,
        user_id=user_id or session.user_id,
        offset=offset,
        count=count,
        shuffle=shuffle,
    )
    return parse_track_list(response)


@router.get("/algorithms", response_model=AlbumList)
async def algorithms(vk: VKDep, session: SessionDep) -> AlbumList:
    # Get Main section
    catalog = await vk.call("catalog.getAudio", session.access_token)
    sections = catalog.get("catalog", {}).get("sections", [])
    
    main_section_id = None
    for sec in sections:
        if sec.get("title") == "Главная":
            main_section_id = sec.get("id")
            break
            
    if not main_section_id:
        return AlbumList()
        
    section_raw = await vk.call("catalog.getSection", session.access_token, section_id=main_section_id)
    blocks = section_raw.get("section", {}).get("blocks", [])
    
    algo_block = None
    # We find the header "Собрано алгоритмами", the next block usually contains the playlists
    found_header = False
    for b in blocks:
        if b.get("layout", {}).get("title") == "Собрано алгоритмами":
            found_header = True
            continue
        if found_header and b.get("data_type") == "music_playlists":
            algo_block = b
            break
            
    if not algo_block:
        return AlbumList()
        
    playlist_ids = algo_block.get("playlists_ids", [])
    playlists_data = section_raw.get("playlists", [])
    
    items = []
    for pl in playlists_data:
        pl_id = f"{pl.get('owner_id')}_{pl.get('id')}"
        if pl_id in playlist_ids:
            cover = None
            if pl.get("photo"):
                cover = pl["photo"].get("photo_600") or pl["photo"].get("photo_300")
            
            items.append(AlbumSummary(
                id=str(pl.get("id")),
                owner_id=pl.get("owner_id"),
                title=pl.get("title", ""),
                subtitle=pl.get("description") or pl.get("subtitle") or "",
                cover=cover,
                year=pl.get("year"),
                track_count=pl.get("count", 0),
            ))
            
    return AlbumList(items=items, count=len(items))

@router.get("/moods", response_model=AlbumList)
async def moods(vk: VKDep, session: SessionDep) -> AlbumList:
    """Returns moods and activities playlists from VK catalog."""
    try:
        # 1. Fetch catalog root to find "Главная" section id
        catalog_raw = await vk.call("catalog.getAudio", session.access_token)
        sections = catalog_raw.get("catalog", {}).get("sections", [])
        
        main_section_id = None
        for sec in sections:
            if sec.get("title") == "Главная":
                main_section_id = sec.get("id")
                break
        
        if not main_section_id:
            # Fallback to the first section if "Главная" is missing
            if sections:
                main_section_id = sections[0].get("id")
            else:
                return AlbumList(items=[], count=0)
        
        # 2. Fetch the section
        section_raw = await vk.call(
            "catalog.getSection", 
            session.access_token, 
            section_id=main_section_id
        )
        
        # 3. Find block with anchor "vibes"
        blocks = section_raw.get("section", {}).get("blocks", [])
        vibes_block = None
        for b in blocks:
            if b.get("data_type") == "music_playlists" and b.get("meta", {}).get("anchor") == "vibes":
                vibes_block = b
                break
        
        if not vibes_block:
            return AlbumList(items=[], count=0)
            
        playlist_ids = vibes_block.get("playlists_ids", [])
        playlists_data = section_raw.get("playlists", [])
        
        # 4. Map to AlbumSummary
        items = []
        for pl in playlists_data:
            pl_id = f"{pl.get('owner_id')}_{pl.get('id')}"
            if pl_id in playlist_ids:
                items.append(
                    AlbumSummary(
                        id=str(pl["id"]),
                        owner_id=pl["owner_id"],
                        title=pl["title"],
                        subtitle=pl.get("description") or pl.get("subtitle") or "",
                        cover=get_playlist_cover(pl),
                        track_count=pl.get("count", 0),
                    )
                )
        
        return AlbumList(items=items, count=len(items))

    except VKError:
        return AlbumList(items=[], count=0)





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


@router.get("/albums/{owner_id}", response_model=AlbumList)
async def albums(
    owner_id: int,
    vk: VKDep,
    session: SessionDep,
    offset: int = Query(0, ge=0),
    count: int = Query(50, ge=1, le=200),
) -> AlbumList:
    """Albums / playlists for a VK owner (artist or user).

    Tries ``audio.getPlaylists`` (the current API) first, falls back to the
    older ``audio.getAlbums``. Both endpoints are sometimes gated on the
    web OAuth token — in that case we return an empty list so the artist
    page degrades gracefully (the "Альбомы" tab will show an empty state).
    """
    last_exc: VKError | None = None
    for method in ("audio.getPlaylists", "audio.getAlbums"):
        try:
            response = await vk.call(
                method,
                session.access_token,
                owner_id=owner_id,
                offset=offset,
                count=count,
            )
        except VKError as exc:
            last_exc = exc
            if exc.code in (3, 4, 15, 100):
                continue
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                detail={"kind": "vk_error", "code": exc.code, "message": exc.message},
            ) from exc
        return parse_albums(response)
    # Both methods rejected — return an empty list rather than 502 so the
    # artist page can show an empty state.
    _ = last_exc
    return AlbumList(items=[], count=0)


@router.get("/playlist/{owner_id}_{playlist_id}", response_model=TrackList)
async def playlist(
    owner_id: int,
    playlist_id: int,
    vk: VKDep,
    session: SessionDep,
    offset: int = Query(0, ge=0),
    count: int = Query(100, ge=1, le=200),
) -> TrackList:
    """Tracks for a single playlist/album."""
    response = await _safe_call(
        vk,
        "audio.get",
        session.access_token,
        owner_id=owner_id,
        album_id=playlist_id,
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
