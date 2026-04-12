"""
core/config.py

Centralised settings pulled from environment variables.
All other modules import from here — never from os.getenv() directly.

Usage:
    from core.config import settings
    print(settings.supabase_url)
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve .env relative to this file (core/config.py), not CWD.
# This means the backend finds .env regardless of which directory
# uvicorn is launched from.
_ENV_FILE = Path(__file__).parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Supabase
    supabase_url: str
    supabase_jwt_audience: str = "authenticated"
    supabase_service_role_key: str  # backend only — never expose to frontend

    # AI
    openrouter_api_key: str

    # MLS (optional — Perplexity used as fallback)
    bridge_server_key: Optional[str] = None

    # Frontend static files
    frontend_dist: str = "webapp/dist"

    @property
    def supabase_jwks_url(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"

    @property
    def supabase_issuer(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1"


@lru_cache
def get_settings() -> Settings:
    """Cached settings — loaded once, reused everywhere."""
    return Settings()


# Convenient module-level singleton
settings = get_settings()
