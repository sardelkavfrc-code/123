from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Query, status

from ..deps import SessionDep, VKDep
from ..models.audio import AlbumList, AlbumSummary, Artist, CatalogSearchResult, Track, TrackList
from ..services.audio import (
    parse_albums,
    parse_artist,
    parse_catalog_search,
    parse_track,
    parse_track_list,
)
from ..vk.exceptions import VKError

router = APIRouter(prefix="/audio", tags=["audio"])


async def _safe_call(vk, method: str, token: str, **params):
    try:
        return await vk.call(method, token, **params)
    except VKError as exc:
        print(f"VK API Error calling {method}: [{exc.code}] {exc.message}")
        detail = {"kind": "vk_error", "code": exc.code, "message": exc.message}
        if exc.code in (14, 17) and exc.raw:
            # Forward captcha-related fields from VK error
            detail["captcha_sid"] = exc.raw.get("captcha_sid")
            detail["redirect_uri"] = exc.raw.get("redirect_uri")
            detail["remixstlid"] = exc.raw.get("remixstlid")
            detail["captcha_type"] = exc.raw.get("captcha_type", "unknown")

            # Keep original redirect_uri for SmartCaptcha so it renders properly in popup/redirect mode
            pass

            params.pop("captcha_mode", None)
            captcha_img = exc.raw.get("captcha_img")
            if captcha_img:
                img_data = None
                content_type = None

                remixstlid_val = exc.raw.get("remixstlid") or params.get("remixstlid")
                
                # Get the client's current cookies
                session_cookies = {}
                try:
                    for name, value in vk._client.cookies.items():
                        session_cookies[name] = value
                except Exception:
                    pass
                if remixstlid_val:
                    session_cookies["remixstlid"] = str(remixstlid_val)

                # Get user agents
                desktop_ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

                try:
                    print(f"[Captcha] Attempting to download: {captcha_img}")
                    import httpx as httpx_lib
                    async with httpx_lib.AsyncClient(follow_redirects=True) as client:
                        resp = await client.get(
                            captcha_img,
                            headers={"User-Agent": desktop_ua},
                            cookies=session_cookies,
                        )
                        ct = resp.headers.get("content-type", "")

                        if "image_not_supported" in str(resp.url):
                            print("[Captcha] Download failed (redirected to image_not_supported.png)")
                        elif resp.status_code == 200 and ct.startswith("image/"):
                            print(f"[Captcha] Download Succeeded! content-type: {ct}")
                            img_data = resp.content
                            content_type = ct
                        else:
                            print(f"[Captcha] Download failed. status: {resp.status_code}, content-type: {ct}")
                except Exception as e:
                    print(f"[Captcha] Download exception: {e}")

                if img_data and content_type:
                    import base64
                    encoded = base64.b64encode(img_data).decode("utf-8")
                    detail["captcha_img"] = f"data:{content_type};base64,{encoded}"
                else:
                    print("[Captcha] Download failed or redirected. Falling back to raw URL.")
                    detail["captcha_img"] = captcha_img
            else:
                detail["captcha_img"] = None
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail=detail,
        ) from exc


def _get_playlist_cover(pl: dict) -> str | None:
    thumb = pl.get("thumb") or pl.get("photo") or pl.get("cover")
    if isinstance(thumb, dict):
        for size in ["photo_1200", "photo_600", "photo_300", "photo_274", "photo_135", "photo_68"]:
            if thumb.get(size):
                return thumb[size]
    return None


async def _fill_missing_urls(vk: VKDep, session: SessionDep, items: list[dict]):
    missing = []
    for item in items:
        # If track has no URL, but is NOT explicitly restricted, we retry
        if not item.get("url") and not item.get("content_restricted"):
            missing.append(item)
    
    if not missing:
        return

    # Fetch in chunks of 100 in parallel
    chunks = [missing[i:i+100] for i in range(0, len(missing), 100)]
    tasks = []
    for chunk in chunks:
        audios_param = ",".join(f"{t.get('owner_id')}_{t.get('id')}" for t in chunk)
        tasks.append(_safe_call(vk, "audio.getById", session.access_token, audios=audios_param))
        
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    for chunk, resp in zip(chunks, results, strict=False):
        if isinstance(resp, Exception) or not resp:
            continue
        resp_map = {f"{t.get('owner_id')}_{t.get('id')}": t for t in resp}
        for item in chunk:
            key = f"{item.get('owner_id')}_{item.get('id')}"
            if key in resp_map and resp_map[key].get("url"):
                item["url"] = resp_map[key]["url"]


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
    if response and response.get("items"):
        await _fill_missing_urls(vk, session, response["items"])
    return parse_track_list(response)


@router.get("/my/all", response_model=TrackList)
async def my_music_all(
    vk: VKDep,
    session: SessionDep,
) -> TrackList:
    # First, run a quick call to get the total count
    try:
        first_resp = await _safe_call(vk, "audio.get", session.access_token, owner_id=session.user_id, count=1)
        total_count = first_resp.get("count", 0) if first_resp else 0
    except Exception:
        total_count = 0

    if total_count == 0:
        return parse_track_list({"count": 0, "items": []})

    chunk_size = 200
    total_chunks = (total_count + chunk_size - 1) // chunk_size
    
    # Run up to 6 concurrent execute tasks max
    num_partitions = min(6, total_chunks)
    chunks_per_partition = (total_chunks + num_partitions - 1) // num_partitions
    
    code = """
    var offset = parseInt(Args.offset);
    var owner_id = parseInt(Args.owner_id);
    var count = parseInt(Args.count);
    var num_chunks = parseInt(Args.num_chunks);
    var chunks = [];
    var i = 0;
    while (i < num_chunks) {
        var res = API.audio.get({"owner_id": owner_id, "offset": offset + i * count, "count": count});
        if (!!res) {
            if (!!res.items) {
                chunks.push(res.items);
            }
        }
        i = i + 1;
    }
    return chunks;
    """
    
    tasks = []
    for p in range(num_partitions):
        chunk_offset = p * chunks_per_partition
        if chunk_offset >= total_chunks:
            break
        actual_chunks = min(chunks_per_partition, total_chunks - chunk_offset)
        offset = chunk_offset * chunk_size
        tasks.append(
            _safe_call(
                vk,
                "execute",
                session.access_token,
                code=code,
                offset=offset,
                owner_id=session.user_id,
                count=chunk_size,
                num_chunks=actual_chunks,
            )
        )
        
    results = await asyncio.gather(*tasks)
    
    all_items = []
    for res in results:
        if res:
            for chunk in res:
                if chunk:
                    all_items.extend(chunk)
                    
    await _fill_missing_urls(vk, session, all_items)
    return parse_track_list({"count": total_count, "items": all_items})


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
    captcha_sid: str | None = Query(None),
    captcha_key: str | None = Query(None),
    remixstlid: str | None = Query(None),
    captcha_mode: str | None = Query(None),
    vk_cookies: str | None = Query(None),
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
        captcha_sid=captcha_sid,
        captcha_key=captcha_key,
        remixstlid=remixstlid,
        captcha_mode=captcha_mode,
        vk_cookies=vk_cookies,
    )
    return parse_track_list(response)


@router.get("/search/catalog", response_model=CatalogSearchResult)
async def search_catalog(
    vk: VKDep,
    session: SessionDep,
    q: str = Query(min_length=1),
) -> CatalogSearchResult:
    response = await _safe_call(
        vk,
        "catalog.getAudioSearch",
        session.access_token,
        query=q,
        need_blocks=1,
    )
    
    raw_audios = response.get("audios") or []
    if isinstance(raw_audios, list) and raw_audios:
        await _fill_missing_urls(vk, session, raw_audios)
        
    return parse_catalog_search(response)


@router.get("/my/catalog", response_model=TrackList)
async def my_catalog(
    vk: VKDep,
    session: SessionDep,
) -> TrackList:
    catalog = await vk.call("catalog.getAudio", session.access_token)
    sections = catalog.get("catalog", {}).get("sections", [])
    
    my_music_sec_id = None
    for sec in sections:
        if sec.get("title") == "Моя музыка":
            my_music_sec_id = sec.get("id")
            break
            
    if not my_music_sec_id:
        my_music_sec_id = "PUldVA8FR0RzSVNUWE1JSmRSS0wEGEleZFFcRA0NWVd2U1oL"
        
    section_data = await vk.call(
        "catalog.getSection",
        session.access_token,
        section_id=my_music_sec_id,
        need_blocks=1,
    )
    
    response_obj = section_data.get("section", {})
    blocks = response_obj.get("blocks", [])
    
    recent_block = None
    for b in blocks:
        if b.get("data_type") != "music_audios":
            continue
        is_recent = False
        url_val = b.get("url") or ""
        title_val = b.get("title") or ""
        layout_title = (b.get("layout") or {}).get("title") or ""
        
        if "block=recent" in url_val:
            is_recent = True
        elif title_val == "Недавно прослушанные":
            is_recent = True
        elif layout_title == "Недавно прослушанные":
            is_recent = True
            
        if is_recent:
            recent_block = b
            break
            
    if not recent_block:
        return parse_track_list({"count": 0, "items": []})
        
    audios_ids = recent_block.get("audios_ids") or []
    raw_audios = section_data.get("audios") or []
    
    audios_map = {}
    for a in raw_audios:
        if isinstance(a, dict):
            full_id = f"{a.get('owner_id')}_{a.get('id')}"
            audios_map[full_id] = a
            
    resolved_tracks = []
    for aid in audios_ids:
        if aid in audios_map:
            resolved_tracks.append(audios_map[aid])
            
    if resolved_tracks:
        await _fill_missing_urls(vk, session, resolved_tracks)
        
    track_list = parse_track_list({"count": len(resolved_tracks), "items": resolved_tracks})
    track_list.next_from = recent_block.get("next_from")
    track_list.block_id = recent_block.get("id")
    return track_list


@router.get("/catalog/block/items", response_model=TrackList)
async def catalog_block_items(
    vk: VKDep,
    session: SessionDep,
    block_id: str = Query(..., description="ID блока каталога"),
    start_from: str = Query(..., description="Курсор для следующей порции"),
    count: int = Query(20, ge=1, le=100),
) -> TrackList:
    response = await vk.call(
        "catalog.getBlockItems",
        session.access_token,
        block_id=block_id,
        start_from=start_from,
        count=count,
    )
    
    block_obj = response.get("block") or {}
    next_from = block_obj.get("next_from")
    audios_ids = block_obj.get("audios_ids") or []
    
    raw_audios = response.get("audios") or []
    audios_map = {}
    for a in raw_audios:
        if isinstance(a, dict):
            full_id = f"{a.get('owner_id')}_{a.get('id')}"
            audios_map[full_id] = a
            
    resolved_tracks = []
    for aid in audios_ids:
        if aid in audios_map:
            resolved_tracks.append(audios_map[aid])
            
    if resolved_tracks:
        await _fill_missing_urls(vk, session, resolved_tracks)
        
    track_list = parse_track_list({"count": len(resolved_tracks), "items": resolved_tracks})
    track_list.next_from = next_from
    track_list.block_id = block_id
    return track_list


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
    kwargs = {
        "target_audio": target_audio,
        "user_id": user_id or session.user_id,
        "offset": offset,
        "count": count,
        "shuffle": shuffle,
    }

    response = await _safe_call(
        vk,
        "audio.getRecommendations",
        session.access_token,
        **kwargs
    )
    return parse_track_list(response)


@router.get("/mix", response_model=TrackList)
async def mix(
    vk: VKDep,
    session: SessionDep,
    vibes: str | None = Query(None),
    recognitions: str | None = Query(None),
    langs: str | None = Query(None),
) -> TrackList:
    import json
    options = {}
    if vibes and vibes != 'any':
        options["vibes"] = [vibes]
    if recognitions and recognitions != 'any':
        options["recognitions"] = [recognitions]
    if langs and langs != 'any':
        options["langs"] = [langs]
        
    response = await _safe_call(
        vk,
        "audio.getStreamMixAudios",
        session.access_token,
        mix_id="common",
        options=json.dumps(options)
    )
    
    # audio.getStreamMixAudios returns array directly
    if isinstance(response, list):
        await _fill_missing_urls(vk, session, response)
        return parse_track_list({"count": len(response), "items": response})
    
    return parse_track_list({"count": 0, "items": []})


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
            items.append(AlbumSummary(
                id=str(pl.get("id")),
                owner_id=pl.get("owner_id"),
                title=pl.get("title", ""),
                subtitle=pl.get("description") or pl.get("subtitle") or "",
                cover=_get_playlist_cover(pl),
                year=pl.get("year"),
                track_count=pl.get("count", 0),
                type=pl.get("type"),
                main_color=pl.get("main_color"),
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
            # Fallback to title matching since anchor can change
            title = b.get("title", "")
            if b.get("data_type") == "music_playlists" and ("Настроени" in title or b.get("meta", {}).get("anchor") == "vibes"):
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
                        cover=_get_playlist_cover(pl),
                        track_count=pl.get("count", 0),
                        type=pl.get("type"),
                        main_color=pl.get("main_color"),
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


@router.post("/dislike")
async def dislike(
    audio_id: int,
    owner_id: int,
    vk: VKDep,
    session: SessionDep,
) -> dict[str, bool]:
    """VK's "не нравится": tells the algorithm to hide this track (and similar
    ones) from recommendations / the mix. One-way — VK has no un-dislike."""
    result = await _safe_call(
        vk,
        "audio.addDislike",
        session.access_token,
        audio_ids=f"{owner_id}_{audio_id}",
    )
    return {"ok": bool(result)}


def _slug_to_name(slug: str) -> str:
    """Best-effort fallback: turn VK artist slug ('linkin-park') into a name."""
    return slug.replace("-", " ").replace("_", " ").strip().title() or slug


@router.get("/artist_albums/{artist_id}")
async def artist_albums(
    artist_id: str,
    vk: VKDep,
    session: SessionDep,
):
    """Albums for a VK artist via catalog."""
    try:
        # Get artist catalog
        catalog_raw = await vk.call("catalog.getAudioArtist", session.access_token, artist_id=artist_id)
        sections = catalog_raw.get("catalog", {}).get("sections", [])
        if not sections:
            return {"blocks": []}
            
        section_id = sections[0].get("id")
        if not section_id:
            return {"blocks": []}
            
        # Get section
        section_raw = await vk.call("catalog.getSection", session.access_token, section_id=section_id)
        blocks = section_raw.get("section", {}).get("blocks", [])
        playlists_data = section_raw.get("playlists", [])
        
        result_blocks = []
        block_titles = ["Релизы", "Участие в релизах"]
        block_idx = 0
        
        for b in blocks:
            if b.get("data_type") == "music_playlists":
                title = b.get("layout", {}).get("title") or b.get("title")
                if not title or title == "Альбомы":
                    title = block_titles[block_idx] if block_idx < len(block_titles) else "Альбомы"
                
                playlists_ids = b.get("playlists_ids", [])
                
                albums = []
                for pl in playlists_data:
                    pl_id = f"{pl.get('owner_id')}_{pl.get('id')}"
                    if pl_id in playlists_ids:
                        albums.append({
                            "id": str(pl["id"]),
                            "owner_id": pl["owner_id"],
                            "title": pl["title"],
                            "subtitle": pl.get("description") or pl.get("subtitle") or "",
                            "cover": _get_playlist_cover(pl),
                            "year": pl.get("year"),
                            "track_count": pl.get("count", 0),
                        })
                
                if albums:
                    # Deduplicate while preserving order
                    seen = set()
                    unique_albums = []
                    for a in albums:
                        key = f"{a['owner_id']}_{a['id']}"
                        if key not in seen:
                            seen.add(key)
                            unique_albums.append(a)
                    
                    result_blocks.append({
                        "title": title,
                        "albums": unique_albums
                    })
                    block_idx += 1
                    
                    if len(result_blocks) >= 2:
                        break
                    
        return {"blocks": result_blocks}
    except VKError:
        return {"blocks": []}


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
    
    Tries audio.getArtistById (works for Kate Mobile). If it fails, falls back
    to catalog.getAudioArtist -> catalog.getSection to get the banner/photo,
    which works for web tokens (vk1.a...).
    """
    try:
        response = await vk.call(
            "audio.getArtistById",
            session.access_token,
            artist_id=artist_id,
            extended=1,
        )
        parsed = parse_artist(response)
        if parsed:
            return parsed
    except VKError as exc:
        if exc.code not in (3, 4, 15, 100):
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                detail={"kind": "vk_error", "code": exc.code, "message": exc.message},
            ) from exc

    # Fallback to catalog
    try:
        cat = await vk.call("catalog.getAudioArtist", session.access_token, artist_id=artist_id)
        sections = cat.get("catalog", {}).get("sections", [])
        if sections and sections[0].get("id"):
            sec_id = sections[0]["id"]
            sec = await vk.call("catalog.getSection", session.access_token, section_id=sec_id)
            artists = sec.get("artists", [])
            if artists:
                # find exact match or just use the first one
                artist_data = next((a for a in artists if str(a.get("id")) == artist_id), artists[0])
                parsed = parse_artist(artist_data)
                if parsed:
                    return parsed
    except VKError:
        pass

    # Complete fallback stub
    return Artist(
        id=artist_id,
        name=name or _slug_to_name(artist_id),
        domain=None,
        photo=None,
        banner=None,
        is_followed=False,
    )


@router.post("/track-play")
async def track_play(
    vk: VKDep,
    session: SessionDep,
    audio_id: int = Query(..., description="ID аудиозаписи"),
    owner_id: int = Query(..., description="ID владельца аудиозаписи"),
    duration: int = Query(..., description="Длительность в секундах"),
) -> dict[str, bool]:
    """Регистрирует проигрывание трека в статистике ВК для недавних и рекомендаций."""
    import json
    import time
    import random

    uuid_val = random.randint(0, 2**63 - 1)
    event = {
        "e": "audio_play",
        "audio_id": f"{owner_id}_{audio_id}",
        "source": "my",
        "uuid": uuid_val,
        "duration": duration,
        "start_time": int(time.time()),
    }
    events_json = json.dumps([event])

    await _safe_call(
        vk,
        "stats.trackEvents",
        session.access_token,
        events=events_json
    )
    return {"ok": True}

