"""
saveero/main.py

Application entry point.

Run locally:
    python3 -m uvicorn main:app --reload
"""
from __future__ import annotations

import logging
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import FileResponse
from starlette.staticfiles import StaticFiles

from core.config import settings
from api.listing_wizard_routes import router as wizard_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Saveero API",
    version="0.1.0",
    description="Home decision platform API",
)

# ---------------------------------------------------------------------------
# CORS — allow the Vercel frontend (and localhost for dev) to call the API
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",       # Vite dev server
        "http://localhost:4173",       # Vite preview
        "https://*.vercel.app",        # all Vercel preview deployments
        settings.frontend_origin,      # production domain (set in env)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers — registered BEFORE the static catch-all so FastAPI matches
# /api/... routes first (routes are evaluated in registration order).
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
# Static frontend — catch-all LAST so API routes always win
# ---------------------------------------------------------------------------

if os.path.isdir(f"{settings.frontend_dist}/assets"):
    app.mount(
        "/assets",
        StaticFiles(directory=f"{settings.frontend_dist}/assets"),
        name="assets",
    )


@app.get("/", include_in_schema=False)
async def root():
    return FileResponse(f"{settings.frontend_dist}/index.html", media_type="text/html")


@app.get("/{full_path:path}", include_in_schema=False)
async def catch_all(full_path: str):
    if full_path.startswith(("api/", "assets/")):
        raise HTTPException(status_code=404)
    return FileResponse(f"{settings.frontend_dist}/index.html", media_type="text/html")


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
