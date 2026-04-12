"""
core/auth.py

FastAPI dependency for Supabase JWT authentication.
Uses the Supabase JWT secret directly (HS256) — no outbound JWKS fetch needed.

Usage:
    from core.auth import get_current_user, CurrentUser

    @router.get("/protected")
    async def protected(user: CurrentUser):
        return {"user_id": user["sub"]}
"""
from __future__ import annotations

import logging
from typing import Annotated, Any, Dict

import jwt
from fastapi import Depends, Header, HTTPException, status

from core.config import settings

logger = logging.getLogger(__name__)


def get_current_user(
    authorization: str | None = Header(None),
) -> Dict[str, Any]:
    """
    FastAPI dependency. Validates a Supabase JWT from the Authorization header
    using the Supabase JWT secret (HS256) — no network call required.

    Returns the decoded JWT claims on success.
    Raises HTTP 401 on any failure.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
        )

    token = authorization.split(" ", 1)[1].strip()

    try:
        claims = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience=settings.supabase_jwt_audience,
            options={"verify_exp": True},
        )
        return claims
    except Exception as exc:
        logger.warning("JWT validation failed: %s: %s", type(exc).__name__, exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc


# Annotated shorthand — use this in route signatures for cleaner code:
#   async def my_route(user: CurrentUser):
CurrentUser = Annotated[Dict[str, Any], Depends(get_current_user)]
