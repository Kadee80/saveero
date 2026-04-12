"""
core/auth.py

FastAPI dependency for Supabase JWT authentication.
Verifies ES256 JWTs using a pre-fetched JWK public key stored in env vars —
no runtime network call to Supabase's JWKS endpoint required.

Usage:
    from core.auth import get_current_user, CurrentUser

    @router.get("/protected")
    async def protected(user: CurrentUser):
        return {"user_id": user["sub"]}
"""
from __future__ import annotations

import json
import logging
from functools import lru_cache
from typing import Annotated, Any, Dict

import jwt
from jwt.algorithms import ECAlgorithm
from fastapi import Depends, Header, HTTPException, status

from core.config import settings

logger = logging.getLogger(__name__)


@lru_cache
def _public_key():
    """Load and cache the EC public key from the JWK stored in env."""
    if not settings.supabase_jwt_jwk:
        raise RuntimeError("SUPABASE_JWT_JWK env var is not set")
    jwk = json.loads(settings.supabase_jwt_jwk)
    return ECAlgorithm.from_jwk(jwk)


def get_current_user(
    authorization: str | None = Header(None),
) -> Dict[str, Any]:
    """
    FastAPI dependency. Validates a Supabase JWT using the pre-fetched
    EC public key. No network calls at request time.

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
        claims = jwt.decode(
            token,
            _public_key(),
            algorithms=["ES256"],
            audience=settings.supabase_jwt_audience,
            options={"verify_exp": True},
        )
        return claims
    except Exception as exc:
        logger.warning("JWT validation failed: %s: %s", type(exc).__name__, exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {type(exc).__name__}: {exc}",
        ) from exc


# Annotated shorthand — use this in route signatures:
#   async def my_route(user: CurrentUser):
CurrentUser = Annotated[Dict[str, Any], Depends(get_current_user)]
