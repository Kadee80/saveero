"""
core/database.py

Supabase client singleton for backend use.

Uses the service_role key so it can bypass RLS when needed (e.g. admin
operations). Individual user operations should pass the user's JWT via
the Authorization header — Supabase enforces RLS automatically.

Usage:
    from core.database import get_db
    db = get_db()
    result = db.table("listings").select("*").execute()
"""
from __future__ import annotations

from functools import lru_cache

from supabase import create_client, Client
from core.config import settings


@lru_cache
def get_db() -> Client:
    """
    Returns a cached Supabase client using the service role key.
    Initialised once per process.
    """
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def get_user_db(jwt: str) -> Client:
    """
    Returns a Supabase client scoped to a specific user's JWT.
    Row-level security policies apply automatically — the user can only
    see and modify their own rows.
    """
    client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    client.auth.set_session(access_token=jwt, refresh_token="")
    return client
