"""
saveero/main.py

Application entry point. Wires together:
  - FastAPI app
  - Supabase JWT authentication middleware
  - Routers (listing wizard today; mortgage, scenarios to follow)

Run locally:
    python3 -m uvicorn main:app --reload

Or via the CLI helper:
    python3 main.py --port 8000
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

import jwt
from fastapi import Depends, FastAPI, Header, HTTPException, status
from jwt import PyJWKClient
from starlette.responses import FileResponse
from starlette.staticfiles import StaticFiles

from api.listing_wizard_routes import router as wizard_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Saveero API",
    version="0.1.0",
    description="Home decision platform API",
)

# ---------------------------------------------------------------------------
# Supabase JWT auth
# ---------------------------------------------------------------------------

_SUPABASE_URL = os.getenv("SUPABASE_URL")
_JWT_AUDIENCE = os.getenv("SUPABASE_JWT_AUDIENCE", "authenticated")
_jwk_client: Optional[PyJWKClient] = None


def _get_jwk_client() -> PyJWKClient:
    global _jwk_client
    if not _SUPABASE_URL:
        raise RuntimeError("SUPABASE_URL environment variable is not set.")
    jwks_url = f"{_SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"
    if _jwk_client is None:
        _jwk_client = PyJWKClient(jwks_url)
    return _jwk_client


def get_current_user(
    authorization: Optional[str] = Header(None),
) -> Dict[str, Any]:
    """
    Validates a Supabase JWT from the Authorization header.
    Returns decoded claims on success, raises 401 on failure.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid Authorization header")
    token = authorization.split(" ", 1)[1].strip()
    try:
        jwk_client = _get_jwk_client()
        signing_key = jwk_client.get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            audience=_JWT_AUDIENCE,
            options={"verify_exp": True},
            issuer=f"{_SUPABASE_URL.rstrip('/')}/auth/v1",
        )
        return claims
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from exc


# ---------------------------------------------------------------------------
# Static frontend
# ---------------------------------------------------------------------------

FRONTEND_DIST = os.getenv("FRONTEND_DIST", "webapp/dist")

if os.path.isdir(f"{FRONTEND_DIST}/assets"):
    app.mount("/assets", StaticFiles(directory=f"{FRONTEND_DIST}/assets"), name="assets")


@app.get("/", include_in_schema=False)
async def root():
    return FileResponse(f"{FRONTEND_DIST}/index.html", media_type="text/html")


@app.get("/{full_path:path}", include_in_schema=False)
async def catch_all(full_path: str):
    if full_path.startswith(("api/", "assets/")):
        raise HTTPException(status_code=404)
    return FileResponse(f"{FRONTEND_DIST}/index.html", media_type="text/html")


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(wizard_router, prefix="/api")

# Future modules — uncomment as they ship:
# from api.mortgage_routes   import router as mortgage_router
# from api.scenario_routes   import router as scenario_router
# from api.property_routes   import router as property_router
# app.include_router(mortgage_router,  prefix="/api")
# app.include_router(scenario_router,  prefix="/api")
# app.include_router(property_router,  prefix="/api")


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok", "version": app.version}


# ---------------------------------------------------------------------------
# CLI entry
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse
    import uvicorn

    parser = argparse.ArgumentParser(description="Saveero API server")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--reload", action="store_true")
    args = parser.parse_args()

    uvicorn.run("main:app", host=args.host, port=args.port, reload=args.reload)
