"""
core/auth.py

FastAPI dependency for Supabase JWT authentication.
Moved out of main.py so any router can import it cleanly.

Usage:
    from core.auth import get_current_user, CurrentUser

    @router.get("/protected")
    async def protected(user: CurrentUser = Depends(get_current_user)):
        return {"user_id": user["sub"]}
"""
from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Any, Dict

import jwt
from fastapi import Depends, Header, HTTPException, status
from jwt import PyJWKClient

from core.config import settings


@lru_cache
def _jwk_client() -> PyJWKClient:
    """Cached JWKS client — fetches Supabase public keys once."""
    return PyJWKClient(settings.supabase_jwks_url)


def get_current_user(
    authorization: str | None = Header(None),
) -> Dict[str, Any]:
    """
    FastAPI dependency. Validates a Supabase JWT from the Authorization header.

    Returns the decoded JWT claims (includes sub, email, role, etc.) on success.
    Raises HTTP 401 on any failure — missing header, expired token, bad signature.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
        )

    token = authorization.split(" ", 1)[1].strip()

    try:
        client = _jwk_client()
        signing_key = client.get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            audience=settings.supabase_jwt_audience,
            options={"verify_exp": True},
            issuer=settings.supabase_issuer,
        )
        return claims
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc


# Annotated shorthand — use this in route signatures for cleaner code:
#   async def my_route(user: CurrentUser = Depends(get_current_user)):
CurrentUser = Annotated[Dict[str, Any], Depends(get_current_user)]
