"""
api/listing_wizard_routes.py

FastAPI router for the listing wizard.
Mount this on your main app with:

    from saveero.api.listing_wizard_routes import router as wizard_router
    app.include_router(wizard_router, prefix="/api")

Endpoints:
    POST /api/listings/generate  — upload photos, get a structured listing back
    GET  /api/listings/cache     — cache stats (dev/ops use)
    POST /api/listings/cache/clear — flush the image analysis cache
"""
from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from saveero.listing_wizard import ListingGenerator

router = APIRouter(tags=["Listing Wizard"])
security = HTTPBearer()


# ---------------------------------------------------------------------------
# Dependency: authenticated listing generator
# ---------------------------------------------------------------------------

def _get_generator(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> ListingGenerator:
    """
    Resolve a ListingGenerator for the current request.

    Auth is validated upstream (Supabase JWT middleware on the main app).
    This dependency just confirms a bearer token is present and builds
    the generator from environment config.

    TODO: replace env-var lookup with settings object once core/config.py exists.
    """
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OPENROUTER_API_KEY is not configured on this server.",
        )
    bridge_key = os.getenv("BRIDGE_SERVER_KEY")  # optional
    return ListingGenerator(api_key=api_key, bridge_api_key=bridge_key)


# ---------------------------------------------------------------------------
# POST /api/listings/generate
# ---------------------------------------------------------------------------

@router.post("/listings/generate")
async def generate_listing(
    images: List[UploadFile] = File(..., description="Property photos (jpg, png, webp)"),
    address: str = Form(..., description="Full property address"),
    notes: str = Form("", description="Optional agent/seller notes"),
    generator: ListingGenerator = Depends(_get_generator),
) -> Dict[str, Any]:
    """
    Upload property photos and receive a fully structured AI-generated listing.

    The pipeline:
    1. Validates and saves uploaded files to a temp directory
    2. Runs per-image + batch vision analysis (parallel, cached)
    3. Generates a structured listing with Claude Sonnet
    4. Searches for comparable properties and prices the listing
    5. Refines the description with local context

    Returns a JSON object matching the GeneratedListing schema.
    """
    if not images:
        raise HTTPException(status_code=400, detail="At least one image is required.")

    with tempfile.TemporaryDirectory() as tmp:
        image_paths: List[Path] = []

        for i, upload in enumerate(images):
            if not (upload.content_type or "").startswith("image/"):
                raise HTTPException(
                    status_code=400,
                    detail=f"File '{upload.filename}' is not an image (content-type: {upload.content_type}).",
                )
            ext = Path(upload.filename or f"image_{i}").suffix or ".jpg"
            dest = Path(tmp) / f"image_{i}{ext}"
            with dest.open("wb") as f:
                shutil.copyfileobj(upload.file, f)
            image_paths.append(dest)

        try:
            listing = await generator.run(
                image_paths=image_paths,
                address=address,
                notes=notes,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Listing generation failed: {exc}",
            )

    return listing.model_dump()


# ---------------------------------------------------------------------------
# GET /api/listings/cache  (dev/ops)
# ---------------------------------------------------------------------------

@router.get("/listings/cache")
async def cache_stats(
    generator: ListingGenerator = Depends(_get_generator),
) -> Dict[str, Any]:
    """Return image analysis cache statistics."""
    return generator.image_describer.cache_stats()


# ---------------------------------------------------------------------------
# POST /api/listings/cache/clear  (dev/ops)
# ---------------------------------------------------------------------------

@router.post("/listings/cache/clear")
async def clear_cache(
    generator: ListingGenerator = Depends(_get_generator),
) -> Dict[str, Any]:
    """Flush the image analysis cache. Use during development or after model changes."""
    removed = generator.image_describer.clear_cache()
    return {"removed": removed, "message": f"Cleared {removed} cached results."}
