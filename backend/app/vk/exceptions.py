from __future__ import annotations


class VKError(Exception):
    """Generic VK API error."""

    def __init__(self, code: int, message: str, *, raw: dict | None = None) -> None:
        super().__init__(f"VK error {code}: {message}")
        self.code = code
        self.message = message
        self.raw = raw or {}


class VKAuthError(VKError):
    """Auth-specific error from /token endpoint (direct grant)."""

    def __init__(
        self,
        kind: str,
        message: str,
        *,
        validation_sid: str | None = None,
        captcha_sid: str | None = None,
        captcha_img: str | None = None,
        phone_mask: str | None = None,
        raw: dict | None = None,
    ) -> None:
        super().__init__(code=-1, message=message, raw=raw)
        self.kind = kind
        self.validation_sid = validation_sid
        self.captcha_sid = captcha_sid
        self.captcha_img = captcha_img
        self.phone_mask = phone_mask


class VKNotAuthenticatedError(VKError):
    """No valid token in storage."""

    def __init__(self) -> None:
        super().__init__(code=5, message="No active session. Authenticate first.")
