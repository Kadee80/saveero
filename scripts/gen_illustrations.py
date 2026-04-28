"""
Generate scenario illustrations via DALL-E 3.

Reads VITE_OPEN_AI_KEY from saveero/webapp/.env and writes 1024x1024
PNGs to saveero/webapp/public/illustrations/.

Idempotent — skips files that already exist. Delete a file to regenerate.
"""
from __future__ import annotations

import base64
import os
import sys
import time
from pathlib import Path

import requests

# OpenAI Tier 1 caps DALL-E 3 at 1 image/min. Sleep this many seconds
# between successful generations to stay under the rate limit. Bump
# down if your account is on a higher tier.
SLEEP_BETWEEN_CALLS_SEC = 65

# Repo root is the parent of this script's directory.
ROOT = Path(__file__).resolve().parent.parent
WEBAPP_ENV = ROOT / "webapp" / ".env"
OUT_DIR = ROOT / "webapp" / "public" / "illustrations"


def load_key() -> str:
    for line in WEBAPP_ENV.read_text().splitlines():
        line = line.strip()
        if line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        if k.strip() in ("VITE_OPEN_AI_KEY", "OPENAI_API_KEY"):
            return v.strip().strip('"').strip("'")
    sys.exit("No VITE_OPEN_AI_KEY / OPENAI_API_KEY found in webapp/.env")


STYLE = (
    "Modern editorial flat vector illustration in the style of Stripe or "
    "Notion marketing pages. Strictly flat 2D — no realistic 3D shading, "
    "no photographic depth, no soft volumetric shadows; only subtle flat "
    "color blocks with at most a single gentle gradient to indicate light. "
    "Soft pastel palette: warm cream backgrounds, sage green ground, "
    "dusty sky blue, warm sunshine yellow accents, muted terracotta. "
    "Clean rounded shapes, generous negative space. "
    "CHARACTERS: draw all human figures as 2D flat-color pictograms. "
    "Heads are FLAT 2D CIRCLES — solid single-color disks, NOT 3D "
    "spheres, NOT shaded balls, NOT volumetric — same flat-shading "
    "treatment as the houses and props in the scene. Bodies are flat "
    "solid-color rectangles or simple rounded shapes. NO hair, NO "
    "facial features, NO eyes, NO mouth, NO accessories on the head, "
    "NO hats, NO head coverings, NO scarves, NO turbans, NO hijabs, "
    "NO veils, NO religious or cultural attire of any kind. The "
    "characters should look like icons cut from colored paper, in the "
    "exact same illustration style as the rest of the scene — if the "
    "house has flat color, the figure has flat color; if the house has "
    "a single subtle gradient, the figure may have one too. Treat "
    "figures as iconic placeholders, not portraits. "
    "No text, no logos, no signs with words. Square composition, soft "
    "sky and ground band, centered scene with clear focal point."
)

PROMPTS: dict[str, str] = {
    "stay": (
        "A relaxed couple sitting on the porch of their cozy cottage home, "
        "holding warm mugs, a friendly dog resting at their feet, small "
        "flower garden in front, soft afternoon sun. Settled, content, "
        "lived-in feeling. " + STYLE
    ),
    "refinance": (
        "A person sitting at a sunlit desk reviewing a fresh stack of "
        "mortgage paperwork with a fountain pen, a tiny house icon visible "
        "on the top page, a coffee cup beside them, soft sunlight from a "
        "window, satisfied smile. Fresh start, paperwork-renewal vibe. "
        + STYLE
    ),
    "sell_buy": (
        "A young couple holding a moving box between them on the front lawn "
        "of their small home, a SOLD sign with no text staked in the grass "
        "(use only a red rectangle and a wooden post — no letters), a small "
        "moving truck parked nearby, and a slightly larger new home visible "
        "in the background. Hopeful, transitional. " + STYLE
    ),
    "rent": (
        "Two simple stylized figures shaking hands on the front steps of a "
        "small three-story walk-up apartment building, one figure passing a "
        "single brass key to the other, a potted plant beside the door. "
        "Calm welcoming moment, minimal detail. " + STYLE
    ),
    "rent_out_buy": (
        "Two stylized homes side by side on a flat green lawn separated by "
        "a small path: a smaller cream cottage on the left with a coin "
        "symbol floating gently above it to suggest rental income, and a "
        "slightly larger cream cottage on the right with one simple "
        "stylized figure standing in front holding a single key. Soft sky "
        "behind. Minimal detail, clean shapes. " + STYLE
    ),
}


def generate(api_key: str, name: str, prompt: str) -> bool:
    """Generate one image. Returns True if a new file was written.

    Retries on 429 (rate limit) up to MAX_RETRIES times, sleeping 70s
    between attempts. Other errors fail fast.
    """
    out = OUT_DIR / f"{name}.png"
    if out.exists():
        print(f"  skip {name} (already exists)")
        return False
    print(f"  generating {name}...")

    MAX_RETRIES = 4
    RETRY_SLEEP_SEC = 70

    for attempt in range(1, MAX_RETRIES + 1):
        r = requests.post(
            "https://api.openai.com/v1/images/generations",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "dall-e-3",
                "prompt": prompt,
                "n": 1,
                "size": "1024x1024",
                "quality": "standard",
                "response_format": "b64_json",
            },
            timeout=180,
        )
        if r.status_code == 200:
            b64 = r.json()["data"][0]["b64_json"]
            out.write_bytes(base64.b64decode(b64))
            print(f"  saved {out.relative_to(ROOT)} ({out.stat().st_size // 1024} KB)")
            return True
        if r.status_code == 429 and attempt < MAX_RETRIES:
            print(
                f"  429 rate-limited (attempt {attempt}/{MAX_RETRIES}), "
                f"sleeping {RETRY_SLEEP_SEC}s and retrying..."
            )
            time.sleep(RETRY_SLEEP_SEC)
            continue
        print(f"  FAIL {name}: {r.status_code} {r.text[:300]}")
        return False
    return False


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    api_key = load_key()
    print(f"key loaded ({len(api_key)} chars)")
    print(f"output: {OUT_DIR}")
    items = list(PROMPTS.items())
    for idx, (name, prompt) in enumerate(items):
        wrote = generate(api_key, name, prompt)
        # Throttle only between actual API calls — skip sleep after a
        # cached file or after the last item.
        if wrote and idx < len(items) - 1:
            # Look ahead — if every remaining file already exists, no
            # need to wait.
            remaining = [n for n, _ in items[idx + 1 :] if not (OUT_DIR / f"{n}.png").exists()]
            if remaining:
                print(f"  ...sleeping {SLEEP_BETWEEN_CALLS_SEC}s (rate limit, {len(remaining)} left)")
                time.sleep(SLEEP_BETWEEN_CALLS_SEC)
    print("done.")


if __name__ == "__main__":
    main()
