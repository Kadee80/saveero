"""
api/listing_wizard_routes.py

FastAPI router for the listing wizard.
Mount this on your main app with:

    from api.listing_wizard_routes import router as wizard_router
    app.include_router(wizard_router, prefix="/api")

Endpoints:
    POST /api/listings/generate     — upload photos, get a structured listing back
    POST /api/listings/save         — save a generated listing to the database
    GET  /api/listings              — list all listings for the current user
    GET  /api/listings/{id}         — get a single listing
    GET  /api/listings/cache        — cache stats (dev/ops use)
    POST /api/listings/cache/clear  — flush the image analysis cache
"""
from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from core.auth import CurrentUser, get_current_user
from core.config import settings
from core.database import get_db
from listing_wizard import ListingGenerator

router = APIRouter(tags=["Listing Wizard"])
security = HTTPBearer()


# ---------------------------------------------------------------------------
# Dependency: authenticated listing generator
# ---------------------------------------------------------------------------

def _get_generator(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> ListingGenerator:
    if not settings.openrouter_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OPENROUTER_API_KEY is not configured on this server.",
        )
    return ListingGenerator(
        api_key=settings.openrouter_api_key,
        bridge_api_key=settings.bridge_server_key,
    )


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
                    detail=f"File '{upload.filename}' is not an image.",
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
# POST /api/listings/save
# ---------------------------------------------------------------------------

class SaveListingRequest(BaseModel):
    address: str
    headline: str
    description: str
    price_min: Optional[float] = None
    price_max: Optional[float] = None
    price_mid: Optional[float] = None
    price_confidence: Optional[float] = None
    beds: Optional[int] = None
    baths: Optional[float] = None
    sqft: Optional[int] = None
    features: List[str] = []
    comps: List[Dict[str, Any]] = []


@router.post("/listings/save")
async def save_listing(
    body: SaveListingRequest,
    user: CurrentUser,
) -> Dict[str, Any]:
    """
    Save a generated listing to the database.
    Creates a user profile row if one doesn't exist yet.
    """
    db = get_db()
    user_id: str = user["sub"]

    # Ensure user profile exists in public.users
    existing = db.table("users").select("id").eq("id", user_id).execute()
    if not existing.data:
        db.table("users").insert({
            "id": user_id,
            "email": user.get("email", ""),
            "role": "seller",
        }).execute()

    # Insert property
    insert_data = {
        "owner_id": user_id,
        "address": body.address,
        "description_ai": body.description,
        "price_min_suggested": body.price_min,
        "price_max_suggested": body.price_max,
        "price_mid": body.price_mid,
        "price_confidence": body.price_confidence,
        "beds": body.beds,
        "baths": int(body.baths) if body.baths else None,
        "status": "draft",
    }

    result = db.table("properties").insert(insert_data).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to save listing.")

    property_id = result.data[0]["id"]

    # Insert comps if provided
    if body.comps:
        comp_rows = [
            {
                "property_id": property_id,
                "source": c.get("source", "llm"),
                "address": c.get("address"),
                "price": c.get("price"),
                "beds": c.get("beds"),
                "sqft": c.get("sqft"),
                "raw_json": c,
            }
            for c in body.comps
        ]
        db.table("comps").insert(comp_rows).execute()

    return {"success": True, "id": property_id}


# ---------------------------------------------------------------------------
# GET /api/listings
# ---------------------------------------------------------------------------

@router.get("/listings")
async def list_listings(
    user: CurrentUser,
) -> List[Dict[str, Any]]:
    """Return all listings for the current user, newest first."""
    db = get_db()
    user_id: str = user["sub"]

    result = (
        db.table("properties")
        .select("id, address, status, price_mid, price_min_suggested, price_max_suggested, beds, baths, description_ai, created_at")
        .eq("owner_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )

    return result.data or []


# ---------------------------------------------------------------------------
# GET /api/listings/{listing_id}
# ---------------------------------------------------------------------------

@router.get("/listings/{listing_id}")
async def get_listing(
    listing_id: str,
    user: CurrentUser,
) -> Dict[str, Any]:
    """Return a single listing with its comps."""
    db = get_db()
    user_id: str = user["sub"]

    result = (
        db.table("properties")
        .select("*, comps(*)")
        .eq("id", listing_id)
        .eq("owner_id", user_id)
        .single()
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Listing not found.")

    return result.data


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
    """Flush the image analysis cache."""
    removed = generator.image_describer.clear_cache()
    return {"removed": removed, "message": f"Cleared {removed} cached results."}
