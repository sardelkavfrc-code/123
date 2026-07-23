"""Thin async VK API client built on httpx."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from ..config import Settings, get_settings
from .exceptions import VKError

logger = logging.getLogger(__name__)



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
        self._refresh_lock = asyncio.Lock()

    async def aclose(self) -> None:
        await self._client.aclose()
    async def call(self, method: str, token: str, **params: Any) -> Any:
        try:
            return await self._call_internal(method, token, **params)
        except VKError as exc:
            if exc.code in (5, 1117):
                logger.info("Token expired/invalid (code %d). Attempting background refresh...", exc.code)
                if await self.refresh_session(old_token=token):
                    from .. import storage
                    new_session = storage.load()
                    if new_session and new_session.access_token:
                        logger.info("Retrying VK request with refreshed token")
                        return await self._call_internal(method, new_session.access_token, **params)
                else:
                    from .. import storage
                    storage.clear()
                    logger.warning("Session token is permanently invalid and refresh failed. Cleared session storage.")
                    from fastapi import HTTPException, status
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail={
                            "kind": "not_authenticated",
                            "message": "Сессия VK устарела или недействительна. Пожалуйста, войдите снова.",
                        },
                    ) from exc
            raise exc

    async def _call_internal(self, method: str, token: str, **params: Any) -> Any:
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

        if remixstlid:
            self._client.cookies.set("remixstlid", str(remixstlid), domain=".vk.com", path="/")

        max_attempts = 3
        for attempt in range(max_attempts):
            try:
                resp = await self._client.post(f"/method/{method}", data=payload)
                resp.raise_for_status()
                break
            except (httpx.RequestError, httpx.HTTPStatusError) as exc:
                if attempt < max_attempts - 1:
                    logger.warning(
                        "VK API connection failed (attempt %d/%d) for method %s: %s. Retrying...",
                        attempt + 1,
                        max_attempts,
                        method,
                        exc,
                    )
                    
                    # Refresh HTTP client to flush poisoned connections
                    old_cookies = self._client.cookies
                    await self._client.aclose()
                    self._client = httpx.AsyncClient(
                        base_url=self._settings.vk_api_url,
                        headers={"User-Agent": self._settings.vk_user_agent},
                        timeout=10.0,
                        cookies=old_cookies,
                    )
                    
                    await asyncio.sleep(0.5 * (attempt + 1))
                    continue
                if isinstance(exc, httpx.HTTPStatusError):
                    raise VKError(code=-2, message=f"HTTP status error {exc.response.status_code}: {str(exc)}") from exc
                raise VKError(code=-2, message=f"Network error: {str(exc)}") from exc
        
        data = resp.json()

        if "error" in data:
            err = data["error"]
            error_code = int(err.get("error_code", -1))
            error_msg = str(err.get("error_msg", "Unknown VK error"))

            try:
                with open("debug_vk.log", "a", encoding="utf-8") as f:
                    f.write(f"Method: {method}\n")
                    f.write(f"VK API Error response cookies: {list(resp.cookies.items())}\n")
                    f.write(f"VK API client cookies: {list(self._client.cookies.items())}\n")
                    f.write(f"VK API Error raw data: {err}\n\n")
            except Exception as log_exc:
                print("Failed to write debug log:", log_exc)

            remixstlid_val = resp.cookies.get("remixstlid") or self._client.cookies.get("remixstlid")
            if remixstlid_val:
                err["remixstlid"] = remixstlid_val
            raise VKError(
                code=int(err.get("error_code", -1)),
                message=str(err.get("error_msg", "Unknown VK error")),
                raw=err,
            )
        return data.get("response")

    def calculate_sig(self, method: str, params: dict[str, Any], client_secret: str) -> str:
        clean_params = {}
        for k, v in params.items():
            if v is None:
                continue
            if isinstance(v, bool):
                clean_params[k] = str(int(v))
            elif isinstance(v, list | tuple | set):
                clean_params[k] = ",".join(str(item) for item in v)
            else:
                clean_params[k] = str(v)
        sorted_query = "&".join(f"{k}={clean_params[k]}" for k in sorted(clean_params.keys()))
        to_hash = f"/method/{method}?{sorted_query}{client_secret}"
        import hashlib
        return hashlib.md5(to_hash.encode("utf-8")).hexdigest()

    async def call_anonymous(self, method: str, params: dict[str, Any], sign: bool = True) -> Any:
        payload: dict[str, Any] = {}
        for key, value in params.items():
            if value is None:
                continue
            if isinstance(value, bool):
                payload[key] = int(value)
            elif isinstance(value, list | tuple | set):
                payload[key] = ",".join(str(v) for v in value)
            else:
                payload[key] = value

        if sign:
            payload["sig"] = self.calculate_sig(method, payload, self._settings.vk_client_secret)

        print(f"VK ANONYMOUS CALL: method={method}, params={payload}", flush=True)

        max_attempts = 3
        for attempt in range(max_attempts):
            try:
                resp = await self._client.post(f"/method/{method}", data=payload)
                resp.raise_for_status()
                break
            except (httpx.RequestError, httpx.HTTPStatusError) as exc:
                if attempt < max_attempts - 1:
                    print(
                        f"VK ANONYMOUS CALL FAILED (attempt {attempt + 1}/{max_attempts}) for method={method}: {exc}. Retrying...",
                        flush=True,
                    )
                    
                    # Refresh HTTP client to flush poisoned connections
                    old_cookies = self._client.cookies
                    await self._client.aclose()
                    self._client = httpx.AsyncClient(
                        base_url=self._settings.vk_api_url,
                        headers={"User-Agent": self._settings.vk_user_agent},
                        timeout=10.0,
                        cookies=old_cookies,
                    )
                    
                    await asyncio.sleep(0.5 * (attempt + 1))
                    continue
                if isinstance(exc, httpx.HTTPStatusError):
                    print(f"VK ANONYMOUS HTTP ERROR: {exc.response.status_code} - {exc.response.text}", flush=True)
                    raise VKError(code=-2, message=f"HTTP status error {exc.response.status_code}: {str(exc)}") from exc
                print(f"VK ANONYMOUS REQUEST ERROR: {str(exc)}", flush=True)
                raise VKError(code=-2, message=f"Network error: {str(exc)}") from exc

        data = resp.json()
        print(f"VK ANONYMOUS RESPONSE: {data}", flush=True)
        if "error" in data:
            err = data["error"]
            raise VKError(
                code=int(err.get("error_code", -1)),
                message=str(err.get("error_msg", "Unknown VK error")),
                raw=err,
            )
        return data.get("response")

    async def refresh_session(self, old_token: str | None = None) -> bool:
        async with self._refresh_lock:
            return await self._do_refresh_session(old_token)

    async def _do_refresh_session(self, old_token: str | None = None) -> bool:
        from .. import storage
        session = storage.load()
        if not session or not session.access_token:
            return False
            
        if old_token and session.access_token != old_token:
            logger.info("Token was already refreshed by another concurrent request.")
            return True
            
        device_id = storage.get_device_id()
        if not session.refresh_token:
            logger.error("Cannot refresh session: no refresh_token available in session")
            return False
            
        exchange_token = session.refresh_token
        
        params = {
            "api_id": self._settings.vk_client_id,
            "client_id": self._settings.vk_client_id,
            "client_secret": self._settings.vk_client_secret,
            "exchange_tokens": exchange_token,
            "active_index": 0,
            "scope": "all",
            "initiator": "expired_token",
            "device_id": device_id,
            "v": self._settings.vk_api_version,
            "lang": "ru",
        }
        
        try:
            response = await self.call_anonymous("auth.refreshTokens", params, sign=True)
            if not response:
                logger.error("Failed to refresh session token: response is empty")
                return False
                
            errors = response.get("errors")
            if errors:
                logger.error("Failed to refresh session token due to API errors: %s", errors)
                return False
                
            success = response.get("success")
            if success and isinstance(success, list) and len(success) > 0:
                token_data = success[0]
                
                # Check for nested access_token dict or direct token field
                new_access_token = None
                expires_in = None
                if "access_token" in token_data and isinstance(token_data["access_token"], dict):
                    new_access_token = token_data["access_token"].get("token")
                    expires_in = token_data["access_token"].get("expires_in")
                elif "token" in token_data:
                    new_access_token = token_data.get("token")
                    expires_in = token_data.get("expires_in")
                    
                if new_access_token:
                    session.access_token = new_access_token
                    if expires_in:
                        import time
                        session.expires_at = int(time.time()) + int(expires_in)
                    
                    # Update refresh token ONLY if VK returns a REAL 'refresh_token' field.
                    # Do NOT extract 'webview_refresh_token' because it is a fake token identical to access_token
                    # and will ruin our valid exchange token for future refreshes.
                    new_refresh_token = token_data.get("refresh_token")
                    if new_refresh_token and isinstance(new_refresh_token, dict):
                        new_refresh_token = new_refresh_token.get("token")
                        
                    if new_refresh_token and isinstance(new_refresh_token, str):
                        session.refresh_token = new_refresh_token
                        
                    storage.save(session)
                    logger.info("Successfully refreshed session token in background")
                    return True
                else:
                    logger.error("Refresh response success list did not contain 'token' field: %s", token_data)
            else:
                logger.error("Refresh response success list is empty or invalid: %s", response)
        except Exception as exc:
            logger.error("Failed to refresh session token: %s", exc)
            
        return False

    async def get_anonymous_token(self) -> str:
        from .. import storage
        token = storage.load_anonym_token()
        if token:
            return token
            
        device_id = storage.get_device_id()
        params = {
            "api_id": self._settings.vk_client_id,
            "client_id": self._settings.vk_client_id,
            "client_secret": self._settings.vk_client_secret,
            "v": self._settings.vk_api_version,
            "https": 1,
            "lang": "ru",
            "device_id": device_id,
        }
        
        response = await self.call_anonymous("auth.getAnonymToken", params, sign=True)
        token = response.get("token")
        if not token:
            raise VKError(code=-1, message="auth.getAnonymToken response did not contain token")
            
        storage.save_anonym_token(token)
        return token

    def clear_anonymous_token(self) -> None:
        from .. import storage
        path = storage._path().parent / "anonym_token.txt"
        path.unlink(missing_ok=True)

    async def raw_get(self, url: str, params: dict[str, Any] | None = None) -> httpx.Response:
        """Used by the auth flow which hits oauth.vk.com directly."""
        return await self._client.get(url, params=params)
