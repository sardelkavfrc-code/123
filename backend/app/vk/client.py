"""Thin async VK API client built on httpx."""

from __future__ import annotations

from typing import Any

import httpx

from ..config import Settings, get_settings
from .exceptions import VKError


class VKClient:
    """Reusable httpx-based VK API client.

    Lifecycle is managed by FastAPI lifespan — a single client is shared across
    all requests so we benefit from connection pooling.
    """

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._client = httpx.AsyncClient(
            base_url="https://api.vk.com",
            timeout=httpx.Timeout(20.0, connect=10.0),
            headers={"User-Agent": self._settings.vk_user_agent},
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def call(self, method: str, token: str, **params: Any) -> Any:
        remixstlid = params.pop("remixstlid", None)
        payload: dict[str, Any] = {
            "v": self._settings.vk_api_version,
            "access_token": token,
        }
        for key, value in params.items():
            if value is None:
                continue
            if isinstance(value, bool):
                payload[key] = int(value)
            elif isinstance(value, list | tuple | set):
                payload[key] = ",".join(str(v) for v in value)
            else:
                payload[key] = value

        cookies = {}
        if remixstlid:
            cookies["remixstlid"] = str(remixstlid)

        try:
            resp = await self._client.post(f"/method/{method}", data=payload, cookies=cookies)
            resp.raise_for_status()
        except httpx.RequestError as exc:
            raise VKError(code=-2, message=f"Network error: {str(exc)}") from exc
        
        data = resp.json()

        if "error" in data:
            err = data["error"]
            remixstlid_val = resp.cookies.get("remixstlid") or self._client.cookies.get("remixstlid")
            if remixstlid_val:
                err["remixstlid"] = remixstlid_val
            raise VKError(
                code=int(err.get("error_code", -1)),
                message=str(err.get("error_msg", "Unknown VK error")),
                raw=err,
            )
        return data.get("response")

    async def raw_get(self, url: str, params: dict[str, Any] | None = None) -> httpx.Response:
        """Used by the auth flow which hits oauth.vk.com directly."""
        return await self._client.get(url, params=params)
