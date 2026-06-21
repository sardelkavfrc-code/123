from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration loaded from environment / .env."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Kate Mobile defaults — required for VK audio scope.
    vk_client_id: int = Field(default=2685278, alias="VK_CLIENT_ID")
    vk_client_secret: str = Field(default="lxhD8OD7dMsqtXIm5IUY", alias="VK_CLIENT_SECRET")
    vk_api_version: str = Field(default="5.131", alias="VK_API_VERSION")
    vk_user_agent: str = Field(
        default="KateMobileAndroid/113 v1-543 (Android 13; SDK 33; arm64-v8a; unknown Unknown; ru)",
        alias="VK_USER_AGENT",
    )

    bind_host: str = Field(default="127.0.0.1", alias="VKMP_BIND_HOST")
    bind_port: int = Field(default=8765, alias="VKMP_BIND_PORT")

    cors_origins: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173,app://./", alias="VKMP_CORS_ORIGINS"
    )

    session_dir: Path = Field(
        default=Path.home() / ".vk-music-player", alias="VKMP_SESSION_DIR"
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def session_file(self) -> Path:
        return self.session_dir / "session.json"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
