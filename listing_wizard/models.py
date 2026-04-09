"""
listing_wizard/models.py

Pydantic models for the listing wizard output.
These are the data contracts between the AI pipeline and the rest of the app.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class PropertyFeature(BaseModel):
    """A single room or feature area within the property."""
    feature_type: str = Field(default="", description="Room type, e.g. 'kitchen', 'master_bedroom'")
    count: Optional[int] = None
    description: str = Field(default="")
    square_feet: Optional[int] = None
    features: List[str] = Field(default_factory=list)
    dimensions: Optional[str] = None


class SimilarProperty(BaseModel):
    """A comparable property returned by the comp search."""
    address: str = Field(default="")
    price: int = Field(default=0)
    bedrooms: int = Field(default=0)
    bathrooms: float = Field(default=0.0)
    property_type: str = Field(default="")
    description: str = Field(default="")
    square_feet: Optional[int] = None
    distance: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class SimilarProperties(BaseModel):
    content: List[SimilarProperty] = Field(default_factory=list)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_features: List[str] = Field(default_factory=list)


class GeneratedListing(BaseModel):
    """
    The full structured output of the listing wizard.
    All fields are optional — the AI fills what it can infer from the photos.
    """
    # Identity
    title: str = Field(default="", description="Compelling listing title, max 60 chars")
    address: str = Field(default="")
    address_line1: str = Field(default="")
    address_line2: str = Field(default="")
    city: str = Field(default="")
    region: str = Field(default="", description="State or province")
    zip_code: str = Field(default="")
    country: str = Field(default="USA")

    # Property basics
    property_type: str = Field(default="")
    bedrooms: int = Field(default=0)
    bathrooms: int = Field(default=0)
    bathrooms_full: int = Field(default=0)
    bathrooms_half: int = Field(default=0)
    square_feet: Optional[int] = None
    living_area: Optional[int] = None
    living_area_unit: str = Field(default="sqft")
    lot_size_value: Optional[int] = None
    lot_size_unit: str = Field(default="sqft")
    year_built: Optional[int] = None

    # Parking
    parking_total: float = Field(default=0.0)
    parking_garage: int = Field(default=0)
    parking_covered: int = Field(default=0)
    parking_open: int = Field(default=0)
    parking_carport: int = Field(default=0)
    parking_other: int = Field(default=0)
    parking_other_description: str = Field(default="")

    # Systems
    heating_type: List[str] = Field(default_factory=list)
    cooling_type: List[str] = Field(default_factory=list)
    water_type: List[str] = Field(default_factory=list)
    sewer_type: List[str] = Field(default_factory=list)
    foundation_type: List[str] = Field(default_factory=list)
    roof_type: List[str] = Field(default_factory=list)
    exterior_material: List[str] = Field(default_factory=list)
    interior_material: List[str] = Field(default_factory=list)
    flooring_type: List[str] = Field(default_factory=list)

    # Pricing (populated by pricing engine, not the wizard)
    price_range: str = Field(default="")
    recommended_price: float = Field(default=0.0)

    # Content
    description: str = Field(default="", description="3-4 paragraph listing description")
    features: List[PropertyFeature] = Field(default_factory=list)
    amenities: List[str] = Field(default_factory=list)
    highlights: List[str] = Field(default_factory=list)
    neighborhood_info: str = Field(default="")
    location_features: List[str] = Field(default_factory=list)

    # Location
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    # Supporting data attached by the pipeline
    similar_properties: List[SimilarProperty] = Field(default_factory=list)
    image_descriptions: List[Dict[str, Any]] = Field(default_factory=list)

    # Comprehensive analysis blob from batch image pass
    wide_image_analysis: Optional[Dict[str, Any]] = None
