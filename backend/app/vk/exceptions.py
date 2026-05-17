from __future__ import annotations


class VKError(Exception):
    """Generic VK API error."""

    def __init__(self, code: int, message: str, *, raw: dict | None = None) -> None:
        super().__init__(f"VK error {code}: {message}")
        self.code = code
        self.message = message
        self.raw = raw or {}


class VKNotAuthenticatedError(VKError):
    """No valid token in storage."""

    def __init__(self) -> None:
        super().__init__(code=5, message="No active session. Authenticate first.")
