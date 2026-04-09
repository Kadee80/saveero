"""
listing_wizard/image_describer.py

Async vision AI client. Sends property photos to a multimodal model via
OpenRouter and returns structured JSON descriptions.

Supported input methods:
  - Local file path  →  describe_image_file()
  - Public URL       →  describe_image()
  - Raw base64       →  describe_image_base64()
  - Batch (all together in one request)  →  describe_images_batch()

Results are cached to disk by content hash so repeat runs on the same photos
don't burn API tokens.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import logging
import mimetypes
import pickle
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import httpx
from langchain.schema import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

# Fast, cheap, vision-capable. Override via env OPENROUTER_IMAGE_MODEL.
DEFAULT_IMAGE_MODEL = "google/gemini-2.5-flash"

# Prompt used for per-image analysis
_SINGLE_IMAGE_SYSTEM = """\
You are a real estate agent writing objective image descriptions for a property listing.
Avoid empty adjectives (inviting, elegant, welcoming). Describe only what you see.

If the image is a floor plan, extract all text visible on the plan — room names,
dimensions, area sizes. Do not infer or invent values not written on the plan.

Floor plan extracted text format:
  Level: Upper | Lower
  Rooms:
    - Room Name: dimensions / area

Return a JSON object with exactly these keys:
{
  "photo_type": "Inside | Outside | Aerial | Plan | Useless",
  "description": "concise paragraph — room type, materials, major items, notable features",
  "text": "extracted text from the image, or empty string"
}"""

# Prompt used for whole-property batch analysis
_BATCH_IMAGE_SYSTEM = """\
You are a real estate agent. Look at all images together and describe the property as a whole.
Use floor plan images to determine room names, dimensions, and areas — prefer plan data over visual guesses.
Note the architectural style (modern, traditional, craftsman, etc.) and estimate year built.
Avoid empty adjectives. Focus on observable facts.

Return a valid JSON object:
{
  "beds": <integer>,
  "total_baths": <integer>,
  "half_baths": <integer>,
  "year_built_estimate": <integer or null>,
  "bedrooms": ["Master Bedroom (10'11\\" x 24'1\\")", ...],
  "bathrooms": ["Full Bathroom (5'11\\" x 8'1\\")", ...],
  "areas": ["Living Room (10'2\\" x 21'1\\")", ...],
  "description": "2-3 paragraph property overview"
}"""


# ---------------------------------------------------------------------------
# Result model
# ---------------------------------------------------------------------------

class ImageDescriptionResult(BaseModel):
    model: str
    description: str
    raw: Dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class ImageDescriberError(Exception):
    pass


# ---------------------------------------------------------------------------
# Core class
# ---------------------------------------------------------------------------

class AsyncImageDescriber:
    """
    Thin async wrapper around an OpenRouter vision model.

    Usage:
        describer = AsyncImageDescriber(api_key="sk-or-...")
        result = await describer.describe_image_file("kitchen.jpg")
        print(result.description)   # JSON string
    """

    def __init__(
        self,
        api_key: str,
        model: str = DEFAULT_IMAGE_MODEL,
        cache_dir: Optional[str] = ".image_cache",
        enable_cache: bool = True,
    ):
        if not api_key:
            raise ImageDescriberError("api_key is required.")

        self.api_key = api_key
        self.model = model
        self.enable_cache = enable_cache
        self.cache_dir = Path(cache_dir) if cache_dir else None

        if self.enable_cache and self.cache_dir:
            self.cache_dir.mkdir(parents=True, exist_ok=True)

        self._llm = ChatOpenAI(
            model=self.model,
            openai_api_key=self.api_key,
            openai_api_base=OPENROUTER_BASE_URL,
            temperature=0.4,
            max_tokens=10_000,
            streaming=False,
        )

    # ------------------------------------------------------------------
    # Cache helpers
    # ------------------------------------------------------------------

    def _cache_key(self, content: bytes) -> str:
        return hashlib.md5(content + self.model.encode()).hexdigest()

    def _cache_path(self, key: str) -> Optional[Path]:
        return (self.cache_dir / f"{key}.pkl") if self.cache_dir else None

    def _read_cache(self, key: str) -> Optional[ImageDescriptionResult]:
        if not self.enable_cache:
            return None
        path = self._cache_path(key)
        if path and path.exists():
            try:
                return pickle.loads(path.read_bytes())
            except Exception:
                path.unlink(missing_ok=True)
        return None

    def _write_cache(self, key: str, result: ImageDescriptionResult) -> None:
        if not self.enable_cache:
            return
        path = self._cache_path(key)
        if path:
            try:
                path.write_bytes(pickle.dumps(result))
            except Exception as exc:
                logger.warning("Cache write failed: %s", exc)

    # ------------------------------------------------------------------
    # Internal LLM call
    # ------------------------------------------------------------------

    async def _invoke(self, system: str, content: List[Dict]) -> ImageDescriptionResult:
        messages = [
            SystemMessage(content=system),
            HumanMessage(content=content),
        ]
        response = await self._llm.ainvoke(messages)
        description = response.content if hasattr(response, "content") else str(response)
        return ImageDescriptionResult(model=self.model, description=description)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def describe_image(self, image_url: str) -> ImageDescriptionResult:
        """Describe a single image from a public URL or data URL."""
        content: List[Dict] = [{"type": "image_url", "image_url": {"url": image_url}}]
        return await self._invoke(_SINGLE_IMAGE_SYSTEM, content)

    async def describe_image_file(self, path: Union[str, Path]) -> ImageDescriptionResult:
        """Read a local image file and describe it (with caching)."""
        p = Path(path)
        data = p.read_bytes()
        cache_key = self._cache_key(data)

        cached = self._read_cache(cache_key)
        if cached:
            logger.debug("Cache hit: %s", p.name)
            return cached

        mime, _ = mimetypes.guess_type(p.name)
        mime = mime or "image/jpeg"
        data_url = f"data:{mime};base64,{base64.b64encode(data).decode()}"
        result = await self.describe_image(data_url)

        self._write_cache(cache_key, result)
        return result

    async def describe_image_base64(
        self, image_b64: str, mime: str = "image/jpeg"
    ) -> ImageDescriptionResult:
        """Describe an image from a raw base64 string."""
        data = base64.b64decode(image_b64)
        cache_key = self._cache_key(data)

        cached = self._read_cache(cache_key)
        if cached:
            return cached

        data_url = f"data:{mime};base64,{image_b64}"
        result = await self.describe_image(data_url)
        self._write_cache(cache_key, result)
        return result

    async def describe_images_batch(
        self,
        image_urls: List[str],
        user_description: str = "",
    ) -> ImageDescriptionResult:
        """Send all images in a single request for whole-property analysis."""
        content: List[Dict] = [
            {"type": "image_url", "image_url": {"url": url}} for url in image_urls
        ]
        if user_description:
            content.append({"type": "text", "text": f"Agent notes: {user_description}"})

        return await self._invoke(_BATCH_IMAGE_SYSTEM, content)

    # ------------------------------------------------------------------
    # Cache management
    # ------------------------------------------------------------------

    def clear_cache(self) -> int:
        """Delete all cached results. Returns number of files removed."""
        if not self.cache_dir or not self.cache_dir.exists():
            return 0
        removed = 0
        for f in self.cache_dir.glob("*.pkl"):
            try:
                f.unlink()
                removed += 1
            except Exception:
                pass
        return removed

    def cache_stats(self) -> Dict[str, Any]:
        if not self.cache_dir or not self.cache_dir.exists():
            return {"enabled": self.enable_cache, "files": 0, "size_mb": 0.0}
        files = list(self.cache_dir.glob("*.pkl"))
        size = sum(f.stat().st_size for f in files if f.exists())
        return {
            "enabled": self.enable_cache,
            "cache_dir": str(self.cache_dir),
            "files": len(files),
            "size_mb": round(size / (1024 * 1024), 2),
        }
