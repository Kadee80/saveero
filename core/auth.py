"""
core/auth.py

FastAPI dependency for Supabase JWT authentication.
Verifies tokens by calling Supabase's auth API (get_user) using the
already-connected Supabase client — no separate JWKS network fetch needed.

Usage:
    from core.auth import get_current_user, CurrentUser

    @router.get("/protected")
    async def protected(user: CurrentUser):
        return {"user_id": user["sub"]}
"""
from __future__ import annotations

import logging
from typing import Annotated, Any, Dict

from fastapi import Depends, Header, HTTPException, status

from core.database import get_db

logger = logging.getLogger(__name__)


def get_current_user(
    authorization: str | None = Header(None),
) -> Dict[str, Any]:
    """
    FastAPI dependency. Validates a Supabase JWT by calling supabase.auth.get_user().
    This works with any JWT algorithm Supabase uses (ES256, HS256, etc.)
    and requires no separate JWKS endpoint fetch.

    Returns a dict of user claims on success.
    Raises HTTP 401 on any failure.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
        )

    token = authorization.split(" ", 1)[1].strip()

    try:
        db = get_db()
        response = db.auth.get_user(token)
        user = response.user
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
            )
        # Return a claims-style dict so the rest of the code stays the same
        return {
            "sub": user.id,
            "email": user.email,
            "role": user.role,
            "user_metadata": user.user_metadata,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Auth failed: %s: %s", type(exc).__name__, exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc


# Annotated shorthand — use this in route signatures:
#   async def my_route(user: CurrentUser):
CurrentUser = Annotated[Dict[str, Any], Depends(get_current_user)]
