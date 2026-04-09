"""
listing_wizard/listing_generator.py

Orchestrates the full photo → listing pipeline.

Steps:
  1. Analyze each photo individually (parallel, cached)
  2. Analyze all photos together in one batch request
  3. Filter out irrelevant images (aerial, useless)
  4. Generate a structured listing with Claude Sonnet
  5. Search for comparable properties (RESO API → Perplexity fallback)
  6. Price the listing against the comps
  7. Refine the description with location context

Entry point:
    generator = ListingGenerator(api_key="sk-or-...", bridge_api_key="...")
    listing   = await generator.run(image_paths, address, notes)
"""
from __future__ import annotations

import asyncio
import json
import json_repair
import logging
import re
import traceback
from pathlib import Path
from typing import Any, Dict, List, Optional

from langchain.schema import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langchain_core.output_parsers import PydanticOutputParser

from .image_describer import AsyncImageDescriber
from .models import GeneratedListing, PropertyFeature, SimilarProperties, SimilarProperty

logger = logging.getLogger(__name__)

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
LISTING_MODEL   = "anthropic/claude-sonnet-4"
PRICING_MODEL   = "anthropic/claude-sonnet-4"
SEARCH_MODEL    = "perplexity/sonar-pro"

_IRRELEVANT_PHOTO_TYPES = {"Unknown", "Useless", "Aerial"}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _extract_json(text: str) -> Any:
    """Pull the first JSON object or array out of an LLM response."""
    first_brace   = text.find("{")
    last_brace    = text.rfind("}")
    first_bracket = text.find("[")
    last_bracket  = text.rfind("]")

    first_brace   = first_brace   if first_brace   != -1 else len(text)
    first_bracket = first_bracket if first_bracket != -1 else len(text)

    start = min(first_brace, first_bracket)
    end   = max(last_brace, last_bracket) + 1
    return json_repair.loads(text[start:end])


def _strip_house_number(address: str) -> str:
    """Remove house numbers and zip codes so a search stays at neighbourhood level."""
    parts = []
    for part in address.split(","):
        part = re.sub(r"^\d+\s*", "", part.strip())
        part = re.sub(r"\b\d{5}(?:-\d{4})?\b$", "", part)
        part = re.sub(r"\b\d+\b", "", part).strip()
        if part:
            parts.append(part)
    return ", ".join(parts)


# ---------------------------------------------------------------------------
# Main class
# ---------------------------------------------------------------------------

class ListingGenerator:
    """
    Full listing pipeline.

    Args:
        api_key:        OpenRouter API key (required)
        bridge_api_key: Bridge RESO API key (optional — falls back to Perplexity)
        image_cache_dir: Directory for caching image analysis results
    """

    def __init__(
        self,
        api_key: str,
        bridge_api_key: Optional[str] = None,
        image_cache_dir: str = ".image_cache",
    ):
        if not api_key:
            raise ValueError("api_key is required")

        self.api_key = api_key
        self.bridge_api_key = bridge_api_key

        # Image vision client
        self.image_describer = AsyncImageDescriber(
            api_key=api_key,
            cache_dir=image_cache_dir,
        )

        # Listing generation LLM (creative, higher temperature)
        self._listing_llm = ChatOpenAI(
            model=LISTING_MODEL,
            openai_api_key=api_key,
            openai_api_base=OPENROUTER_BASE_URL,
            temperature=0.6,
            max_tokens=20_000,
            streaming=False,
        )

        # Pricing LLM (analytical, low temperature)
        self._pricing_llm = ChatOpenAI(
            model=PRICING_MODEL,
            openai_api_key=api_key,
            openai_api_base=OPENROUTER_BASE_URL,
            temperature=0.1,
            max_tokens=10_000,
            streaming=False,
        )

        # Web search LLM for comparable properties
        self._search_llm = ChatOpenAI(
            model=SEARCH_MODEL,
            openai_api_key=api_key,
            openai_api_base=OPENROUTER_BASE_URL,
            temperature=0.1,
            max_tokens=40_000,
            streaming=False,
        ).with_structured_output(SimilarProperties.model_json_schema())

        # Optional Bridge RESO client
        self._reso_client = None
        if bridge_api_key:
            try:
                from reso_client_2 import BridgeRESOClient
                self._reso_client = BridgeRESOClient(api_key=bridge_api_key)
                logger.info("Bridge RESO client initialised")
            except Exception as exc:
                logger.warning("Bridge RESO client failed to init: %s — using Perplexity fallback", exc)

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    async def run(
        self,
        image_paths: List[Path],
        address: str,
        notes: str = "",
    ) -> GeneratedListing:
        """
        Run the full pipeline and return a GeneratedListing.

        Args:
            image_paths: List of local image file paths
            address:     Property address string
            notes:       Optional agent/seller notes about the property
        """
        if not image_paths:
            raise ValueError("At least one image is required")

        logger.info("Starting listing pipeline for %s (%d images)", address, len(image_paths))

        # Step 1 — individual + batch analysis in parallel
        individual_task = self._analyze_individually(image_paths)
        batch_task      = self._analyze_batch(image_paths, notes)

        individual_descriptions, batch_analysis = await asyncio.gather(
            individual_task, batch_task, return_exceptions=True
        )

        if isinstance(individual_descriptions, Exception):
            raise individual_descriptions
        if isinstance(batch_analysis, Exception):
            logger.warning("Batch analysis failed: %s — continuing without it", batch_analysis)
            batch_analysis = {}

        # Step 2 — filter
        relevant = self._filter_relevant(individual_descriptions)
        if not relevant:
            raise ValueError("No relevant property images found. Please upload clear interior or exterior photos.")

        # Step 3 — generate listing (up to 3 retries)
        listing = await self._generate_listing_with_retry(relevant, address, notes)

        # Step 4 — attach batch analysis
        listing.wide_image_analysis = batch_analysis

        # Step 5 — comp search
        comps = await self._find_comps(listing)
        if comps:
            listing.similar_properties = comps
            price = await self._price_from_comps(listing, comps)
            if price:
                listing.recommended_price = price.get("price", 0.0)
                listing.price_range = (
                    f"${price.get('min_price', 0):,.0f} – ${price.get('max_price', 0):,.0f}"
                )

        # Step 6 — location-aware description refinement
        if listing.location_features:
            refined = await self._refine_description(listing)
            if refined:
                listing.description = refined

        return listing

    # ------------------------------------------------------------------
    # Step 1 — image analysis
    # ------------------------------------------------------------------

    async def _analyze_individually(self, paths: List[Path]) -> List[Dict[str, Any]]:
        """Analyse each image independently (fully parallel, cached)."""
        async def _process(path: Path) -> Dict[str, Any]:
            try:
                result = await self.image_describer.describe_image_file(path)
                parsed = _extract_json(result.description)
                parsed["filename"] = path.name
                return parsed
            except Exception as exc:
                logger.warning("Failed to analyse %s: %s", path.name, exc)
                return {"photo_type": "Error", "description": str(exc), "text": "", "filename": path.name}

        return list(await asyncio.gather(*[_process(p) for p in paths]))

    async def _analyze_batch(self, paths: List[Path], notes: str) -> Dict[str, Any]:
        """Send all images together for a whole-property summary."""
        import base64, mimetypes as mt
        image_urls = []
        for p in paths:
            try:
                data = p.read_bytes()
                mime, _ = mt.guess_type(p.name)
                mime = mime or "image/jpeg"
                image_urls.append(f"data:{mime};base64,{base64.b64encode(data).decode()}")
            except Exception as exc:
                logger.warning("Skipping %s in batch: %s", p.name, exc)

        if not image_urls:
            return {}

        result = await self.image_describer.describe_images_batch(image_urls, user_description=notes)
        try:
            return _extract_json(result.description)
        except Exception:
            return {"description": result.description}

    # ------------------------------------------------------------------
    # Step 2 — filter
    # ------------------------------------------------------------------

    def _filter_relevant(self, descriptions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        relevant = [d for d in descriptions if d.get("photo_type") not in _IRRELEVANT_PHOTO_TYPES]
        logger.info(
            "Filtered images: %d relevant, %d excluded",
            len(relevant), len(descriptions) - len(relevant)
        )
        return relevant

    # ------------------------------------------------------------------
    # Step 3 — listing generation
    # ------------------------------------------------------------------

    async def _generate_listing_with_retry(
        self,
        descriptions: List[Dict[str, Any]],
        address: str,
        notes: str,
        max_attempts: int = 3,
    ) -> GeneratedListing:
        for attempt in range(max_attempts):
            try:
                return await self._generate_listing(descriptions, address, notes)
            except Exception as exc:
                logger.warning("Listing generation attempt %d/%d failed: %s", attempt + 1, max_attempts, exc)
                if attempt == max_attempts - 1:
                    raise
        raise RuntimeError("Listing generation failed after all retries")

    async def _generate_listing(
        self,
        descriptions: List[Dict[str, Any]],
        address: str,
        notes: str,
    ) -> GeneratedListing:
        system = self._listing_system_prompt()
        user   = self._listing_user_prompt(descriptions, address, notes)

        response = await self._listing_llm.ainvoke([
            SystemMessage(content=system),
            HumanMessage(content=user),
        ])

        data = _extract_json(response.content)

        # Hydrate features
        raw_features = data.pop("features", data.pop("areas", []))
        data["features"] = [PropertyFeature(**f) for f in raw_features if isinstance(f, dict)]
        data["image_descriptions"] = descriptions

        return GeneratedListing(**data)

    def _listing_system_prompt(self) -> str:
        return f"""\
You are a professional real estate agent creating a compelling property listing.
Generate a detailed listing in JSON format that matches this schema:

{PydanticOutputParser(pydantic_object=GeneratedListing).get_format_instructions()}

Information priority (highest to lowest):
1. Agent/seller notes — treat these as ground truth
2. Floor plan images — use for accurate room counts and dimensions
3. Photo descriptions — supplement with visual detail

Rules:
- Do not invent information not supported by the sources
- Do not use AI-sounding superlatives ("stunning", "incredible versatility", "nestled")
- Write as a human real estate agent would: specific, honest, conversational
- Include concrete details (materials, finishes, dimensions where known)
- Highlight real selling points without hyperbole

Good description examples (for tone guidance):

Example A:
Cross the threshold into a home filled with warmth, light and possibilities. Sunlight pours through
front, side and rear windows, reflecting across gleaming hardwood floors. The three-level bump-out
provides additional space for entertaining, telecommuting, or unwinding in quiet nooks. An oversized
two-car garage adds convenience. Morning coffee is better on the deck, especially with the view of
the tree-lined common area.

Example B:
Bright, fresh, and move-in ready. The main level features refinished hardwood floors, modern fixtures,
and a dramatic two-story foyer filled with natural light. The kitchen has quartz counters, upgraded
stainless appliances, a farmhouse sink with instant hot water, glass backsplash, recessed lighting,
and a walk-in pantry.
"""

    def _listing_user_prompt(
        self,
        descriptions: List[Dict[str, Any]],
        address: str,
        notes: str,
    ) -> str:
        desc_text = "\n\n".join(
            f"[{d.get('photo_type', 'Unknown')} — {d.get('filename', '')}]\n"
            f"{d.get('description', '')}"
            + (f"\nExtracted text: {d['text']}" if d.get("text") else "")
            for d in descriptions
        )
        return f"""\
Address: {address}

Agent/seller notes:
{notes or '(none provided)'}

Image descriptions:
{desc_text}

Generate the complete JSON listing now.
"""

    # ------------------------------------------------------------------
    # Step 5 — comp search
    # ------------------------------------------------------------------

    async def _find_comps(self, listing: GeneratedListing) -> List[SimilarProperty]:
        comps: List[SimilarProperty] = []

        # Try RESO first
        if self._reso_client:
            comps = await self._reso_search(listing)

        # Perplexity fallback (or supplement)
        perplexity_comps = await self._perplexity_search(listing)
        comps.extend(perplexity_comps)

        if listing.location_features:
            logger.info("Location features found: %d", len(listing.location_features))

        return comps

    async def _reso_search(self, listing: GeneratedListing) -> List[SimilarProperty]:
        """Search RESO/MLS for comparable properties."""
        try:
            results = await self._reso_client.search_properties(
                city=listing.city,
                state=listing.region,
                zip_code=listing.zip_code or None,
                min_beds=max(1, listing.bedrooms - 1),
                max_beds=listing.bedrooms + 2,
                min_baths=max(1, listing.bathrooms - 1),
                max_baths=listing.bathrooms + 3,
                limit=5,
            )
            comps = []
            for p in results:
                if not p.ListPrice:
                    continue
                comps.append(SimilarProperty(
                    address=p.UnparsedAddress or f"{p.City}, {p.StateOrProvince}",
                    price=int(p.ListPrice),
                    bedrooms=p.BedroomsTotal or 0,
                    bathrooms=float(p.BathroomsTotalInteger or 0),
                    property_type=p.PropertyType or "",
                    description=p.PublicRemarks or "",
                    square_feet=p.LivingArea,
                ))
            logger.info("RESO returned %d comps", len(comps))
            return comps
        except Exception as exc:
            logger.warning("RESO search failed: %s", exc)
            return []

    async def _perplexity_search(self, listing: GeneratedListing) -> List[SimilarProperty]:
        """Use Perplexity Sonar to find comparable listings on Zillow."""
        neighbourhood = _strip_house_number(listing.address)
        query = (
            f"{listing.bedrooms}bd {listing.bathrooms}ba {listing.property_type}"
            + (f" {listing.square_feet}sqft" if listing.square_feet else "")
            + f" near {neighbourhood} for sale recent listings"
        )

        system = (
            "You are a real estate agent. Find 5 comparable properties for sale near the target address. "
            "Search only on zillow.com. Include sqft and price — omit any result without a price. "
            "Do not include rentals. Do not fabricate listings."
        )

        for attempt in range(3):
            try:
                response = await self._search_llm.ainvoke([
                    SystemMessage(content=system),
                    HumanMessage(content=query),
                ])

                # Enrich listing with location data returned by Perplexity
                if isinstance(response, dict):
                    loc_features = response.get("location_features", [])
                    if loc_features:
                        listing.location_features.extend(loc_features)
                    if not listing.latitude and response.get("latitude"):
                        listing.latitude = float(response["latitude"])
                    if not listing.longitude and response.get("longitude"):
                        listing.longitude = float(response["longitude"])

                    comps = [SimilarProperty(**p) for p in response.get("content", [])]
                    logger.info("Perplexity returned %d comps", len(comps))
                    return comps

            except Exception as exc:
                logger.warning("Perplexity search attempt %d/3 failed: %s", attempt + 1, exc)
                if attempt == 2:
                    return []
        return []

    # ------------------------------------------------------------------
    # Step 6 — pricing
    # ------------------------------------------------------------------

    async def _price_from_comps(
        self, listing: GeneratedListing, comps: List[SimilarProperty]
    ) -> Optional[Dict[str, Any]]:
        """Ask the pricing LLM to estimate value from comps."""
        comp_data = [
            {"price": c.price, "bedrooms": c.bedrooms, "bathrooms": c.bathrooms,
             "square_feet": c.square_feet, "address": c.address}
            for c in comps if c.price
        ]
        if not comp_data:
            return None

        prompt = f"""\
Based on these comparable properties, recommend a list price for:
- {listing.bedrooms}bd / {listing.bathrooms}ba {listing.property_type}
- {listing.square_feet or 'unknown'} sq ft
- {listing.address}
- Highlights: {', '.join(listing.highlights[:5]) if listing.highlights else 'none listed'}

Comparables:
{json.dumps(comp_data, indent=2)}

Consider: price per sqft, bedroom/bathroom count, property type, and local market.
Return JSON only:
{{"min_price": 0, "max_price": 0, "price": 0}}
"""
        try:
            response = await self._pricing_llm.ainvoke([HumanMessage(content=prompt)])
            return _extract_json(response.content)
        except Exception as exc:
            logger.warning("Price estimation failed: %s", exc)
            return None

    # ------------------------------------------------------------------
    # Step 7 — description refinement
    # ------------------------------------------------------------------

    async def _refine_description(self, listing: GeneratedListing) -> Optional[str]:
        """Weave location context into the listing description."""
        prompt = f"""\
You are a real estate copywriter. Enhance the description below by naturally incorporating
the nearby location features. Add 1-2 sentences about location benefits. Be specific —
name actual places rather than vague categories like "dining and entertainment".
Do not repeat what is already in the description. Do not use AI superlatives.

CURRENT DESCRIPTION:
{listing.description}

LOCATION FEATURES:
{', '.join(listing.location_features)}

PROPERTY: {listing.bedrooms}bd/{listing.bathrooms}ba {listing.property_type} at {listing.address}

Return only the enhanced description text.
"""
        try:
            response = await self._listing_llm.ainvoke([HumanMessage(content=prompt)])
            refined = response.content.strip()
            if len(refined) > 100:
                return refined
        except Exception as exc:
            logger.warning("Description refinement failed: %s", exc)
        return None
