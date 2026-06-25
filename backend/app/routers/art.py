"""Cover-art lookup proxy.

VK sometimes returns tracks with ``album.thumb == null`` (especially for older
or community uploads). The frontend can opt into asking us to look up artwork
from a non-VK source — currently iTunes Search API — so the row gets a cover
instead of the gradient placeholder. Responses are cached in-process to keep
the iTunes hit-rate reasonable without us needing a database.
"""

from __future__ import annotations

import asyncio
import hashlib
from typing import Any

import httpx
from fastapi import APIRouter, Query, Response, HTTPException

from ..models.audio import CoverLookup

router = APIRouter(prefix="/art", tags=["art"])


_CACHE: dict[str, CoverLookup] = {}
_LOCKS: dict[str, asyncio.Lock] = {}
_CLIENT: httpx.AsyncClient | None = None
_MAX_ENTRIES = 4096


def _client() -> httpx.AsyncClient:
    global _CLIENT
    if _CLIENT is None:
        _CLIENT = httpx.AsyncClient(
            timeout=httpx.Timeout(8.0, connect=4.0),
            headers={"User-Agent": "VKMusicPlayer/0.1 (+art-lookup)"},
        )
    return _CLIENT


async def aclose() -> None:
    global _CLIENT
    if _CLIENT is not None:
        await _CLIENT.aclose()
        _CLIENT = None


def _normalise(value: str) -> str:
    return " ".join(value.lower().split())


def _cache_key(artist: str, title: str) -> str:
    payload = f"{_normalise(artist)}::{_normalise(title)}"
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()


def _trim_cache() -> None:
    """Bound the in-process cache to avoid unbounded growth."""
    if len(_CACHE) <= _MAX_ENTRIES:
        return
    # Drop ~10% of the oldest entries (dict preserves insertion order).
    drop = max(1, _MAX_ENTRIES // 10)
    for key in list(_CACHE.keys())[:drop]:
        _CACHE.pop(key, None)
        _LOCKS.pop(key, None)


def _hi_res(url: str) -> str:
    """iTunes returns 100x100 by default; rewrite to 600x600 for a sharper cover."""
    return (
        url.replace("100x100bb", "600x600bb")
        .replace("100x100-75", "600x600-75")
        .replace("100x100", "600x600")
    )


def _pick_artwork(results: list[Any]) -> str | None:
    for entry in results:
        if not isinstance(entry, dict):
            continue
        url = entry.get("artworkUrl100") or entry.get("artworkUrl60") or entry.get("artworkUrl30")
        if url:
            return _hi_res(str(url))
    return None


async def _lookup_itunes(artist: str, title: str) -> str | None:
    term = f"{artist} {title}".strip()
    if not term:
        return None
    try:
        resp = await _client().get(
            "https://itunes.apple.com/search",
            params={
                "term": term,
                "entity": "song",
                "limit": 5,
                "media": "music",
            },
        )
    except (httpx.HTTPError, httpx.TimeoutException):
        return None
    if resp.status_code != 200:
        return None
    try:
        payload = resp.json()
    except ValueError:
        return None
    if not isinstance(payload, dict):
        return None
    return _pick_artwork(payload.get("results") or [])


@router.get("/lookup", response_model=CoverLookup)
async def lookup(
    artist: str = Query(min_length=1),
    title: str = Query(min_length=1),
) -> CoverLookup:
    """Fetch a cover URL for the given artist / title from iTunes.

    Always returns a 200 — when no artwork is found the ``cover`` field is
    ``null`` and the frontend keeps its gradient placeholder. This keeps the
    happy path super cheap on the renderer side.
    """
    key = _cache_key(artist, title)
    cached = _CACHE.get(key)
    if cached is not None:
        return cached

    lock = _LOCKS.setdefault(key, asyncio.Lock())
    async with lock:
        cached = _CACHE.get(key)
        if cached is not None:
            return cached
        url = await _lookup_itunes(artist, title)
        result = CoverLookup(
            artist=artist.strip(),
            title=title.strip(),
            cover=url,
            source="itunes" if url else None,
        )
        _CACHE[key] = result
        _trim_cache()
        return result


@router.get("/search", response_model=CoverLookup)
async def search(
    artist: str = Query(min_length=1),
    title: str = Query(min_length=1),
) -> CoverLookup:
    """Scrape cover art from Genius as a fallback."""
    key = _cache_key(artist, title) + "_genius"
    cached = _CACHE.get(key)
    if cached is not None:
        return cached

    lock = _LOCKS.setdefault(key, asyncio.Lock())
    async with lock:
        cached = _CACHE.get(key)
        if cached is not None:
            return cached

        query = f"{artist} {title}"
        url = "https://genius.com/api/search/multi"
        params = {"per_page": 1, "q": query}
        
        try:
            r = await _client().get(url, params=params)
            cover = None
            if r.status_code == 200:
                data = r.json()
                sections = data.get("response", {}).get("sections", [])
                for sec in sections:
                    if sec.get("type") == "song":
                        hits = sec.get("hits", [])
                        if hits:
                            hit = hits[0].get("result", {})
                            cover = hit.get("song_art_image_url")
                            break
        except (httpx.RequestError, ValueError):
            cover = None

        result = CoverLookup(
            artist=artist.strip(),
            title=title.strip(),
            cover=cover,
            source="genius" if cover else None,
        )
        _CACHE[key] = result
        _trim_cache()
        return result


@router.get("/proxy")
async def proxy(url: str = Query(..., min_length=1)) -> Response:
    """Proxy image request to avoid CORS issues in client."""
    try:
        resp = await _client().get(url, timeout=12.0, follow_redirects=True)
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail="Failed to fetch image via proxy")
        
        headers = {}
        content_type = resp.headers.get("content-type")
        if content_type:
            headers["Content-Type"] = content_type
            
        headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return Response(content=resp.content, headers=headers)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"HTTP error from remote server: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
