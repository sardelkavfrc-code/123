"""Refresh OAuth implicit-flow tokens into audio-capable Kate Mobile tokens.

VK's OAuth implicit flow (oauth.vk.com/authorize) returns tokens that work for
users.get / friends.get but every audio.* call returns error code 3 ("Unknown
method passed") because VK requires audio.* requests to come from a "blessed"
Kate Mobile install.

The vk-audio-token trick (Python port:
https://github.com/vodka2/vkaudiotoken-python) is:

  1. Register a synthetic Kate Mobile install against Google services:
       * ``android.clients.google.com/checkin`` → returns a Google AID id+token
       * ``android.clients.google.com/c2dm/register3`` → returns a
         FCM/GCM "receipt" string that proves to VK that this is a real
         Kate Mobile install.
  2. Call ``api.vk.com/method/auth.refreshToken`` with
     ``(access_token, receipt)`` → VK returns a refreshed token that has the
     Kate Mobile blessing baked in; ``audio.*`` then works.

This module wraps that flow in an async helper that never raises — on any
failure (network, Google API change, VK rejection) we return the original
token unchanged with an error message so the UI can surface ``has_audio=false``
and the user can keep going (the rest of the player still works).
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Hard upper bound on the entire refresh flow. The Google FCM step opens a
# raw TCP socket to mtalk.google.com:5228 without its own timeout, so we
# wrap the whole call to keep a stuck handshake from blocking auth forever.
_REFRESH_TIMEOUT_SECONDS = 25.0


@dataclass
class AudioRefreshResult:
    """Outcome of an attempt to refresh an OAuth token to an audio-capable one."""

    refreshed_token: str | None
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.refreshed_token is not None


def _refresh_blocking(oauth_token: str) -> AudioRefreshResult:
    """Run the full Kate Mobile receipt + auth.refreshToken flow synchronously."""
    try:
        from vkaudiotoken import get_kate_token  # type: ignore[import-untyped]
    except Exception as exc:  # pragma: no cover - import guard
        return AudioRefreshResult(None, f"vkaudiotoken unavailable: {exc!r}")

    try:
        # Empty login/password are unused when ``non_refreshed_token`` is set —
        # the library only does the Google receipt step + auth.refreshToken.
        result = get_kate_token("", "", auth_code=None, non_refreshed_token=oauth_token)
    except Exception as exc:  # noqa: BLE001 - network / parser / VK errors
        logger.warning("Audio-token refresh failed: %s", exc)
        return AudioRefreshResult(None, f"refresh failed: {exc!r}")

    new_token = result.get("token") if isinstance(result, dict) else None
    if not new_token or new_token == oauth_token:
        return AudioRefreshResult(None, "refresh returned same/empty token")
    return AudioRefreshResult(new_token)


async def refresh_to_audio_token(oauth_token: str) -> AudioRefreshResult:
    """Refresh an OAuth implicit-flow token to one that works with audio.* methods.

    Returns ``AudioRefreshResult(refreshed_token=...)`` on success or
    ``AudioRefreshResult(None, error=...)`` on any failure. Never raises.
    """
    if not oauth_token:
        return AudioRefreshResult(None, "empty token")
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(_refresh_blocking, oauth_token),
            timeout=_REFRESH_TIMEOUT_SECONDS,
        )
    except TimeoutError:
        return AudioRefreshResult(None, "refresh timed out")
