from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Query, status

from ..deps import SessionDep, VKDep
from ..models.audio import AlbumList, AlbumSummary, Artist, CatalogSearchResult, Track, TrackList, HomeSection
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
        ids = []
        for t in chunk:
            key = f"{t.get('owner_id')}_{t.get('id')}"
            if t.get("access_key"):
                key += f"_{t['access_key']}"
            ids.append(key)
        audios_param = ",".join(ids)
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
        first_resp = await _safe_call(vk, "audio.getCount", session.access_token, owner_id=session.user_id)
        total_count = int(first_resp) if first_resp is not None else 0
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
    search_own: bool = Query(False),
    sort: int = Query(2, ge=0, le=2),
    captcha_sid: str | None = Query(None),
    captcha_key: str | None = Query(None),
    remixstlid: str | None = Query(None),
    captcha_mode: str | None = Query(None),
    vk_cookies: str | None = Query(None),
) -> TrackList:
    if search_own:
        response = await _safe_call(
            vk,
            "catalog.getAudioSearch",
            session.access_token,
            query=q,
            need_blocks=1
        )
        
        my_tracks_ids = []
        catalog = response.get("catalog", {}) if isinstance(response, dict) else {}
        sections = catalog.get("sections", [])
        for sec in sections:
            blocks = sec.get("blocks", [])
            for i, block in enumerate(blocks):
                title = block.get("title", "")
                layout_title = block.get("layout", {}).get("title", "")
                if title == "Мои треки" or layout_title == "Мои треки":
                    # Sometimes the title is in the previous 'none' block
                    pass
                # The actual music_audios block might have title='Мои треки' or it might be the next block
                if block.get("data_type") == "music_audios" and (block.get("title") == "Мои треки" or block.get("layout", {}).get("title") == "Мои треки"):
                    my_tracks_ids = block.get("audios_ids", [])
                    break
                elif block.get("data_type") == "none" and (block.get("title") == "Мои треки" or block.get("layout", {}).get("title") == "Мои треки"):
                    if i + 1 < len(blocks) and blocks[i+1].get("data_type") == "music_audios":
                        my_tracks_ids = blocks[i+1].get("audios_ids", [])
                        break
            if my_tracks_ids:
                break
                
        all_audios = response.get("audios", [])
        from app.services.audio import parse_track
        
        parsed_tracks = []
        for audio in all_audios:
            if f"{audio.get('owner_id')}_{audio.get('id')}" in my_tracks_ids:
                parsed = parse_track(audio)
                if parsed:
                    parsed_tracks.append(parsed)
                    
        return TrackList(items=parsed_tracks)
    else:
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
    offset: int = Query(0, ge=0),
    count: int = Query(20, ge=1, le=100),
) -> TrackList:
    try:
        catalog = await _safe_call(vk, "catalog.getAudio", session.access_token, url="https://vk.com/audio?section=recent")
        sections = catalog.get("catalog", {}).get("sections", [])
        sec_id = None
        for sec in sections:
            if "recent" in sec.get("url", ""):
                sec_id = sec.get("id")
                break
                
        if not sec_id:
            return parse_track_list({"count": 0, "items": []})
            
        section_data = await _safe_call(vk, "catalog.getSection", session.access_token, section_id=sec_id, need_blocks=1)
        
        audios = section_data.get("audios", [])
        
        total = len(audios)
        paginated_audios = audios[offset:offset+count]
        
        if paginated_audios:
            await _fill_missing_urls(vk, session, paginated_audios)
            
        next_from = str(offset + count) if offset + count < total else None
        
        track_list = parse_track_list({"count": total, "items": paginated_audios})
        track_list.next_from = next_from
        track_list.block_id = "recent_fake"
        return track_list
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Error fetching recent tracks from VK: {e}")
        return parse_track_list({"count": 0, "items": []})


@router.get("/catalog/block/items", response_model=TrackList)
async def catalog_block_items(
    vk: VKDep,
    session: SessionDep,
    block_id: str = Query(..., description="ID блока каталога"),
    start_from: str = Query(..., description="Курсор для следующей порции"),
    count: int = Query(20, ge=1, le=100),
) -> TrackList:
    if block_id == "recent_fake":
        try:
            offset = int(start_from)
        except ValueError:
            offset = 0
        return await my_catalog(vk, session, offset=offset, count=count)
        
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

    if target_audio:
        response = await _safe_call(vk, "audio.getRecommendations", session.access_token, **kwargs)
        return parse_track_list(response)

    try:
        catalog = await _safe_call(vk, "catalog.getAudio", session.access_token)
        sections = catalog.get("catalog", {}).get("sections", [])
        explore_id = None
        for sec in sections:
            if "explore" in sec.get("url", ""):
                explore_id = sec.get("id")
                break

        if explore_id:
            sec_resp = await _safe_call(vk, "catalog.getSection", session.access_token, section_id=explore_id, need_blocks=1)
            blocks = sec_resp.get("section", {}).get("blocks", [])
            audios_from_section = sec_resp.get("audios", [])
            audio_map = {f"{a.get('owner_id')}_{a.get('id')}": a for a in audios_from_section}

            recom_audios = []
            seen = set()
            for b in blocks:
                if b.get("data_type") == "music_audios":
                    for aid in b.get("audios_ids", []):
                        if aid not in seen and aid in audio_map:
                            seen.add(aid)
                            recom_audios.append(audio_map[aid])

            if recom_audios:
                import random
                if shuffle:
                    random.shuffle(recom_audios)

                paginated = recom_audios[offset:offset+count]
                await _fill_missing_urls(vk, session, paginated)
                track_list = parse_track_list({"count": len(recom_audios), "items": paginated})
                if offset + count < len(recom_audios):
                    track_list.next_from = str(offset + count)
                track_list.block_id = "explore_fake"
                return track_list

    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Failed to fetch explore recommendations: {e}")

    # Fallback to the old method
    response = await _safe_call(vk, "audio.getRecommendations", session.access_token, **kwargs)
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


@router.get("/explore", response_model=list[HomeSection])
async def explore(
    vk: VKDep,
    session: SessionDep,
    show_stream_mixes: bool = True,
    show_recomms: bool = True,
    show_genres: bool = True,
    show_audios: bool = True,
    show_moods: bool = True,
    show_playlists: bool = True,
    show_mixes: bool = True
) -> list[HomeSection]:
    """Returns all dynamic sections from VK catalog (Explore/General)."""
    try:
        # 1. Fetch catalog root to find "Главная" or "Обзор" section id
        catalog_raw = await vk.call("catalog.getAudio", session.access_token)
        sections = catalog_raw.get("catalog", {}).get("sections", [])
        
        target_section_id = None
        # Prefer 'explore', fallback to 'general' or the first one
        for sec in sections:
            url = sec.get("url", "")
            if "explore" in url or "general" in url or sec.get("title") in ["Обзор", "Главная"]:
                target_section_id = sec.get("id")
                break
                
        if not target_section_id and sections:
            target_section_id = sections[0].get("id")
            
        if not target_section_id:
            return []
            
        # 2. Fetch the target section blocks
        section_raw = await vk.call("catalog.getSection", session.access_token, section_id=target_section_id, need_blocks=1)
        blocks = section_raw.get("section", {}).get("blocks", [])
        playlists_data = section_raw.get("playlists", [])
        audios_data = section_raw.get("audios", [])
        
        # Build lookup maps
        pl_map = {f"{p.get('owner_id')}_{p.get('id')}": p for p in playlists_data}
        audio_map = {f"{a.get('owner_id')}_{a.get('id')}": a for a in audios_data}
        
        profiles_data = section_raw.get("profiles", [])
        profile_map = {p.get("id"): p for p in profiles_data}
        
        rec_pl_data = section_raw.get("recommended_playlists", [])
        rec_pl_map = {f"{r.get('owner_id')}_{r.get('id')}": r for r in rec_pl_data}
        
        home_sections = []
        current_title = ""
        current_subtitle = ""
        
        for b in blocks:
            title = b.get("layout", {}).get("title")
            subtitle = b.get("layout", {}).get("subtitle")
            if b.get("data_type") == "none":
                layout_name = b.get("layout", {}).get("name")
                if layout_name in ["header", "header_extended"]:
                    if title:
                        current_title = title
                    if subtitle:
                        current_subtitle = subtitle
                continue
                
            if title:
                current_title = title
            if subtitle:
                current_subtitle = subtitle
                
            b_type = b.get("data_type")
            b_id = b.get("id", "")
            
            skip = False
            layout_style = b.get("layout", {}).get("style")
            layout_name = b.get("layout", {}).get("name")
            if b_type == "action" and layout_style == "artist_mix":
                if not show_mixes:
                    skip = True
            elif b_type == "music_recommended_playlists":
                if not show_playlists:
                    skip = True
            elif b_type == "action" and layout_name == "crop_slider":
                is_genre = "жанр" in (current_title or "").lower()
                is_mood = "настроен" in (current_title or "").lower()
                if is_genre and not show_genres:
                    skip = True
                elif is_mood and not show_moods:
                    skip = True
            elif b_type == "music_playlists":
                if not show_recomms:
                    skip = True
            elif b_type == "music_audios":
                if not show_audios:
                    skip = True
            elif b_type == "audio_stream_mixes":
                if not show_stream_mixes:
                    skip = True
                    
            if skip:
                current_title = ""
                current_subtitle = ""
                continue
            next_from = b.get("next_from")
            
            from ..models.audio import ActionItem
            if b_type in ["music_playlists", "music_recommended_playlists"]:
                pl_ids = b.get("playlists_ids", [])
                
                # Fetch tracks for this block if present (useful for music_recommended_playlists)
                b_audios_ids = b.get("audios_ids", [])
                b_audios_map = {}
                if b_audios_ids:
                    items_a = [audio_map[aid] for aid in b_audios_ids if aid in audio_map]
                    if items_a:
                        await _fill_missing_urls(vk, session, items_a)
                        parsed_a = parse_track_list({"count": len(items_a), "items": items_a}).items
                        b_audios_map = {f"{t.owner_id}_{t.id}": t for t in parsed_a}
                
                items = []
                for i, pid in enumerate(pl_ids):
                    if pid in pl_map:
                        pl = pl_map[pid]
                        # For music_recommended_playlists, tracks are ordered sequentially
                        # 3 tracks per playlist typically
                        pl_tracks = []
                        pl_cover = _get_playlist_cover(pl)
                        pl_subtitle = pl.get("description") or pl.get("subtitle") or ""
                        owner_name = None
                        owner_photo = None
                        
                        if b_type == "music_recommended_playlists":
                            pl_tracks_ids = b_audios_ids[i*3 : (i+1)*3]
                            pl_tracks = [b_audios_map[aid] for aid in pl_tracks_ids if aid in b_audios_map]
                            
                            pl_key = f"{pl.get('owner_id')}_{pl.get('id')}"
                            rec_pl = rec_pl_map.get(pl_key) or {}
                            
                            percentage = rec_pl.get("percentage")
                            if percentage is not None:
                                pl_subtitle = f"{int(percentage*100)}% · {rec_pl.get('percentage_title', 'совпадение с вашим вкусом')}"
                            elif rec_pl.get("percentage_title"):
                                pl_subtitle = rec_pl.get("percentage_title")
                                
                            if rec_pl.get("cover"):
                                pl_cover = rec_pl.get("cover")
                                
                            profile = profile_map.get(pl.get("owner_id"))
                            if profile:
                                owner_name = f"{profile.get('first_name', '')} {profile.get('last_name', '')}".strip()
                                owner_photo = profile.get("photo_base") or profile.get("photo_100") or profile.get("photo_50")
                        
                        items.append(AlbumSummary(
                            id=str(pl.get("id")),
                            owner_id=pl.get("owner_id"),
                            title=pl.get("title", ""),
                            subtitle=pl_subtitle,
                            cover=pl_cover,
                            year=pl.get("year"),
                            track_count=pl.get("count", 0),
                            type=pl.get("type"),
                            main_color=pl.get("main_color"),
                            tracks=pl_tracks,
                            owner_name=owner_name,
                            owner_photo=owner_photo,
                            access_key=pl.get("access_key")
                        ))
                if items:
                    home_sections.append(HomeSection(
                        id=b_id,
                        title=current_title or "Плейлисты",
                        subtitle=current_subtitle,
                        type="playlists",
                        layout=b.get("layout", {}).get("name"),
                        playlists=items,
                        next_from=next_from
                    ))
                current_title = ""
                current_subtitle = ""
                
            elif b_type in ["music_audios", "audio_stream_mixes"]:
                audios_ids = b.get("audios_ids", [])
                items = []
                for aid in audios_ids:
                    if aid in audio_map:
                        items.append(audio_map[aid])
                        
                if next_from:
                    try:
                        more_resp = await vk.call(
                            "catalog.getBlockItems",
                            session.access_token,
                            block_id=b_id,
                            start_from=next_from,
                            count=100,
                        )
                        more_block = more_resp.get("block") or {}
                        more_next_from = more_block.get("next_from")
                        more_audios_ids = more_block.get("audios_ids") or []
                        more_raw_audios = more_resp.get("audios") or []
                        
                        more_audios_map = {}
                        for a in more_raw_audios:
                            if isinstance(a, dict):
                                more_audios_map[f"{a.get('owner_id')}_{a.get('id')}"] = a
                                
                        for aid in more_audios_ids:
                            if aid in more_audios_map:
                                if not any(existing.get("id") == more_audios_map[aid].get("id") and existing.get("owner_id") == more_audios_map[aid].get("owner_id") for existing in items):
                                    items.append(more_audios_map[aid])
                        next_from = more_next_from
                    except Exception as e:
                        logging.getLogger(__name__).error(f"Failed to fetch more block items for explore block {b_id}: {e}")
                        
                if items:
                    await _fill_missing_urls(vk, session, items)
                    parsed_tracks = parse_track_list({"count": len(items), "items": items}).items
                    home_sections.append(HomeSection(
                        id=b_id,
                        title=current_title or "Аудиозаписи",
                        subtitle=current_subtitle,
                        type="audios",
                        layout=b.get("layout", {}).get("name"),
                        audios=parsed_tracks,
                        next_from=next_from
                    ))
                current_title = ""
                current_subtitle = ""
                
            elif b_type == "action":
                if b.get("layout", {}).get("name") == "horizontal_buttons":
                    current_title = ""
                    continue
                actions = b.get("actions", [])
                parsed_actions = []
                import json
                for a in actions:
                    images = a.get("images", [])
                    img_url = images[0].get("url") if images else None
                    
                    fg_images = a.get("foreground_images", [])
                    fg_url = fg_images[0].get("url") if fg_images else None
                    
                    mix_options_str = a.get("mix_options", "{}")
                    try:
                        mix_options = json.loads(mix_options_str)
                    except:
                        mix_options = {}
                    parsed_actions.append(ActionItem(
                        id=str(a.get("id")),
                        title=a.get("title", ""),
                        url=img_url,
                        mix_id=a.get("mix_id"),
                        mix_options=mix_options,
                        description=a.get("description"),
                        foreground_url=fg_url
                    ))
                if parsed_actions:
                    home_sections.append(HomeSection(
                        id=b_id,
                        title=current_title,
                        type="actions",
                        layout=b.get("layout", {}).get("name"),
                        actions=parsed_actions,
                        next_from=next_from
                    ))
                current_title = ""
                
        return home_sections
        
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Error fetching home explore sections: {e}")
        return []


@router.post("/add", response_model=Track)
async def add(
    audio_id: int,
    owner_id: int,
    vk: VKDep,
    session: SessionDep,
    access_key: str | None = None,
) -> Track:
    kwargs = {
        "audio_id": audio_id,
        "owner_id": owner_id,
    }
    if access_key:
        kwargs["access_key"] = access_key

    new_id = await _safe_call(
        vk,
        "audio.add",
        session.access_token,
        **kwargs
    )
    
    real_id = None
    if isinstance(new_id, dict):
        items = new_id.get("items") or []
        if items and isinstance(items[0], dict):
            real_id = items[0].get("new_audio_id") or items[0].get("id")
        if not real_id:
            real_id = new_id.get("id") or new_id.get("new_audio_id")
    else:
        real_id = new_id

    if real_id is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="Failed to parse added audio ID")

    # audio.add returns the new audio_id under the current user.
    fetched = await _safe_call(
        vk,
        "audio.getById",
        session.access_token,
        audios=f"{session.user_id}_{int(real_id)}",
    )
    if isinstance(fetched, list) and fetched:
        return parse_track(fetched[0])
    return parse_track({"id": real_id, "owner_id": session.user_id, "title": "", "artist": ""})


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


@router.post("/playlist/follow")
async def follow_playlist(
    playlist_id: int,
    owner_id: int,
    vk: VKDep,
    session: SessionDep,
    access_key: str | None = None,
) -> dict[str, bool]:
    if playlist_id < 0:
        # Algorithmic mix or dynamic recommendation playlist cannot be followed via VK API.
        # Return success to allow frontend to toggle followed state without throwing 502.
        return {"ok": True}
        
    kwargs = {
        "playlist_id": playlist_id,
        "owner_id": owner_id,
    }
    if access_key:
        kwargs["access_key"] = access_key
    result = await _safe_call(
        vk,
        "audio.followPlaylist",
        session.access_token,
        **kwargs
    )
    return {"ok": bool(result)}


@router.post("/playlist/delete")
async def delete_playlist(
    playlist_id: int,
    owner_id: int,
    vk: VKDep,
    session: SessionDep,
) -> dict[str, bool]:
    if playlist_id < 0:
        # Algorithmic mix or dynamic recommendation playlist cannot be deleted via VK API.
        return {"ok": True}
        
    result = await _safe_call(
        vk,
        "audio.deletePlaylist",
        session.access_token,
        playlist_id=playlist_id,
        owner_id=owner_id,
    )
    return {"ok": bool(result)}


@router.post("/playlist/create", response_model=AlbumSummary)
async def create_playlist(
    title: str,
    vk: VKDep,
    session: SessionDep,
    description: str | None = None,
) -> AlbumSummary:
    result = await _safe_call(
        vk,
        "audio.createPlaylist",
        session.access_token,
        owner_id=session.user_id,
        title=title,
        description=description or "",
    )
    parsed = parse_albums([result])
    if not parsed.items:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to parse created playlist",
        )
    return parsed.items[0]


@router.post("/playlist/add_track")
async def add_track_to_playlist(
    playlist_id: int,
    playlist_owner_id: int,
    audio_id: int,
    audio_owner_id: int,
    vk: VKDep,
    session: SessionDep,
    access_key: str | None = None,
) -> dict[str, bool]:
    audio_id_str = f"{audio_owner_id}_{audio_id}"
    if access_key:
        audio_id_str += f"_{access_key}"
    result = await _safe_call(
        vk,
        "audio.addToPlaylist",
        session.access_token,
        owner_id=playlist_owner_id,
        playlist_id=playlist_id,
        audio_ids=audio_id_str,
    )
    return {"ok": bool(result)}


from pydantic import BaseModel

class AddTracksRequest(BaseModel):
    playlist_id: int
    playlist_owner_id: int
    audio_ids: list[str]


@router.post("/playlist/add_tracks")
async def add_tracks_to_playlist(
    req: AddTracksRequest,
    vk: VKDep,
    session: SessionDep,
) -> dict[str, bool]:
    result = await _safe_call(
        vk,
        "audio.addToPlaylist",
        session.access_token,
        owner_id=req.playlist_owner_id,
        playlist_id=req.playlist_id,
        audio_ids=",".join(req.audio_ids),
    )
    return {"ok": bool(result)}


class RemoveTrackRequest(BaseModel):
    playlist_id: int
    playlist_owner_id: int
    audio_id: int
    audio_owner_id: int


@router.post("/playlist/remove_track")
async def remove_track_from_playlist(
    req: RemoveTrackRequest,
    vk: VKDep,
    session: SessionDep,
) -> dict[str, bool]:
    audio_id_str = f"{req.audio_owner_id}_{req.audio_id}"
    try:
        result = await vk.call(
            "execute.removeAudioFromPlaylist",
            session.access_token,
            owner_id=req.playlist_owner_id,
            playlist_id=req.playlist_id,
            audio_ids=audio_id_str,
        )
        return {"ok": bool(result)}
    except Exception as exc:
        logger.info("execute.removeAudioFromPlaylist failed (%s), trying audio.removeFromPlaylist...", exc)
    
    try:
        result = await vk.call(
            "audio.removeFromPlaylist",
            session.access_token,
            owner_id=req.playlist_owner_id,
            playlist_id=req.playlist_id,
            audio_ids=audio_id_str,
        )
        return {"ok": bool(result)}
    except Exception as exc2:
        logger.error("Failed to remove track from playlist: %s", exc2)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Не удалось удалить трек из плейлиста: {exc2}",
        ) from exc2


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


@router.post("/undislike")
async def undislike(
    audio_id: int,
    owner_id: int,
    vk: VKDep,
    session: SessionDep,
) -> dict[str, bool]:
    """Removes a dislike from a track. Requires api_id=2 (system API)."""
    result = await _safe_call(
        vk,
        "audio.removeDislike",
        session.access_token,
        audio_ids=f"{owner_id}_{audio_id}",
        api_id=2,
    )
    return {"ok": bool(result)}


def _slug_to_name(slug: str) -> str:
    """Best-effort fallback: turn VK artist slug ('linkin-park') into a name."""
    return slug.replace("-", " ").replace("_", " ").strip().title() or slug


async def _find_artist_photo_by_search(vk, token: str, name: str) -> tuple[str | None, str | None]:
    try:
        from ..services.audio import parse_catalog_artist
        search_res = await vk.call(
            "catalog.getAudioSearch",
            token,
            query=name,
            need_blocks=1,
        )
        
        for raw in search_res.get("artists") or []:
            if isinstance(raw, dict) and raw.get("name", "").lower() == name.lower():
                parsed = parse_artist(raw)
                if parsed and (parsed.photo or parsed.banner):
                    return parsed.photo, parsed.banner
                    
        for link in search_res.get("links") or []:
            if isinstance(link, dict) and link.get("title", "").lower() == name.lower():
                parsed = parse_catalog_artist(link)
                if parsed and (parsed.photo or parsed.banner):
                    return parsed.photo, parsed.banner
    except Exception as e:
        print(f"[FallbackSearch] Exception finding photo: {e}")
    return None, None


async def _find_artist_albums_by_search(vk, token: str, name: str) -> list[dict]:
    try:
        search_res = await vk.call(
            "catalog.getAudioSearch",
            token,
            query=name,
            need_blocks=1,
        )
        
        catalog = search_res.get("catalog") or {}
        sections = catalog.get("sections") or []
        playlists_data = search_res.get("playlists") or []
        playlists_map = {f"{p.get('owner_id')}_{p.get('id')}": p for p in playlists_data if isinstance(p, dict)}
        
        result_blocks = []
        if sections:
            sec_id = sections[0].get("id")
            sec_res = await vk.call("catalog.getSection", token, section_id=sec_id)
            blocks = sec_res.get("section", {}).get("blocks", [])
            sec_playlists = sec_res.get("playlists") or []
            for pl in sec_playlists:
                if isinstance(pl, dict):
                    playlists_map[f"{pl.get('owner_id')}_{pl.get('id')}"] = pl
                
            for b in blocks:
                if b.get("data_type") == "music_playlists":
                    title = b.get("layout", {}).get("title") or b.get("title") or "Релизы"
                    pids = b.get("playlists_ids") or []
                    albums = []
                    for pid in pids:
                        pl = playlists_map.get(pid)
                        if pl:
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
                        result_blocks.append({
                            "title": title,
                            "albums": albums
                        })
        if not result_blocks and playlists_data:
            albums = []
            for pl in playlists_data:
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
                result_blocks.append({
                    "title": "Альбомы",
                    "albums": albums
                })
        return result_blocks
    except Exception as e:
        print(f"[FallbackSearch] Exception finding albums: {e}")
        return []


@router.get("/artist_albums/{artist_id}")
async def artist_albums(
    artist_id: str,
    vk: VKDep,
    session: SessionDep,
    name: str | None = Query(None, description="Имя артиста для fallback поиска"),
):
    """Albums for a VK artist via catalog."""
    try:
        catalog_raw = await vk.call("catalog.getAudioArtist", session.access_token, artist_id=artist_id)
        sections = catalog_raw.get("catalog", {}).get("sections", [])
        if sections and sections[0].get("id"):
            section_id = sections[0]["id"]
            section_raw = await vk.call("catalog.getSection", session.access_token, section_id=section_id)
            blocks = section_raw.get("section", {}).get("blocks", [])
            playlists_data = section_raw.get("playlists", [])
            
            has_real_blocks = any(b.get("data_type") == "music_playlists" for b in blocks)
            if has_real_blocks:
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
    except Exception:
        pass

    artist_name = name or _slug_to_name(artist_id)
    if artist_name:
        blocks = await _find_artist_albums_by_search(vk, session.access_token, artist_name)
        return {"blocks": blocks}
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
        parsed = parse_track_list(response)
        if parsed.items or offset > 0:
            return parsed
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
        if parsed and (parsed.photo or parsed.banner):
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
                if parsed and (parsed.photo or parsed.banner):
                    return parsed
    except VKError:
        pass

    # Fallback search by artist name to get photo/banner
    photo, banner = None, None
    artist_name = name or _slug_to_name(artist_id)
    if artist_name:
        photo, banner = await _find_artist_photo_by_search(vk, session.access_token, artist_name)

    return Artist(
        id=artist_id,
        name=artist_name,
        domain=None,
        photo=photo,
        banner=banner,
        is_followed=False,
    )


@router.post("/track-event")
async def track_event(
    vk: VKDep,
    session: SessionDep,
    event_type: str = Query(..., description="Тип события: start, stop, pause, play"),
    audio_id: int = Query(..., description="ID аудиозаписи"),
    owner_id: int = Query(..., description="ID владельца аудиозаписи"),
    uuid: int = Query(..., description="Уникальный ID сессии прослушивания трека"),
    duration: int = Query(0, description="Сколько секунд прослушано (для stop/pause/play)"),
) -> dict[str, bool]:
    """Регистрирует события проигрывания трека в статистике ВК для рекомендаций."""
    import time
    import json
    
    current_time = int(time.time())
    vk_event_type = f"audio_{event_type}" if event_type in ["start", "stop", "pause", "play"] else "audio_play"
    
    event_payload = {
        "e": vk_event_type,
        "audio_id": f"{owner_id}_{audio_id}",
        "source": "my",
        "uuid": uuid,
        "start_time": current_time,
    }
    
    if event_type in ["stop", "pause", "play"]:
        event_payload["duration"] = duration
        
    events_json = json.dumps([event_payload], separators=(',', ':'))

    try:
        response = await _safe_call(
            vk,
            "stats.trackEvents",
            session.access_token,
            events=events_json,
        )
        print(f"[track_event] VK stats.trackEvents ({event_type}): {response}", flush=True)
    except Exception as e:
        print(f"[track_event] VK stats.trackEvents ({event_type}) failed: {e}", flush=True)
        
    return {"success": True}

