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
    # --- Added 2026-06-01 per Van's Landing-edits deck ---
    #
    # hero: replaces the current Landing hero (which reused stay.png — Van
    # flagged the figures as reading too old for the broader audience now
    # that FTHB is first-class). Conveys "younger" through body language
    # and posture rather than facial features, since STYLE flattens faces
    # to color disks.
    #
    # fthb: drops into the new "Buy your first home" scenario card. Leans
    # into SCENARIO_PALETTE.teal (#5a9a8e) on the front door so the card's
    # accent color and illustration agree.
    #
    # IMPORTANT: fthb.png currently exists as a placeholder copy of
    # decision.png. Delete it before running this script or the
    # idempotent guard will skip it: `rm webapp/public/illustrations/fthb.png`
    "hero": (
        # Compositionally richer than the card illustrations because it
        # carries the whole hero — needs to feel inviting, layered, and
        # textured. Mirrors stay.png's foliage-heavy framing but with a
        # younger couple. Calling out specific scene elements rather
        # than leaving them implied — gpt-image-1 at high quality
        # otherwise tends to drop ambient detail.
        #
        # Palette is cool-dominant: dusty sky blue (#6b9bc7) anchors the
        # exterior and sky to match SCENARIO_PALETTE.blue (the hero's
        # accent color in the page). Terracotta appears only as small
        # foreground pops, NOT as a dominant tone — earlier passes
        # overweighted warm tones and the result clashed with the cool
        # accent in the Landing background.
        "A young couple in their late 20s sitting close together on the "
        "front steps of a small cozy cottage, holding mugs, looking out "
        "hopefully — slim body shapes, casual modern clothing in soft "
        "sage green and dusty sky blue. A small friendly dog rests at "
        "their feet. The cottage behind them has dusty sky-blue painted "
        "clapboard siding, white window trim, and a softly glowing "
        "window showing cool cream interior light. Layered foliage: "
        "tall leafy potted plants in pale dusty-blue ceramic planters "
        "flanking the steps, a small garden bed with stylized sage and "
        "ice-blue flowers in front, hanging vines from a roof beam. "
        "Dusty sky-blue background with soft white cloud shapes drifting "
        "in the upper area, a low pale sun sits to the right, ground "
        "band in soft sage with a subtle stone path leading to the "
        "steps. One small terracotta planter as an accent — that is "
        "the only warm pop in the scene. Rich, lived-in, calm-morning "
        "feeling — not minimal, not warm-toned. Primary palette: dusty "
        "sky blue (#6b9bc7) and soft sage. Generous visible canvas "
        "grain and painterly texture throughout. " + STYLE
    ),
    "fthb": (
        # Same enrichment treatment as the hero (2026-06-01 retake) —
        # gpt-image-1 at high quality otherwise stamps out a single
        # figure on a near-bare background. Calling out specific scene
        # elements (multiple plants, glowing window, welcome mat, soft
        # sky detail, ground texture) gives the model enough hooks to
        # build a layered scene that feels lived-in instead of flat.
        #
        # Palette is cool-dominant: dusty seafoam teal (#5a9a8e)
        # matches SCENARIO_PALETTE.teal (the FTHB card's accent color)
        # and anchors the door + bungalow trim. Sky and supporting
        # planters lean dusty sky blue. Terracotta appears only as a
        # single small foreground pop — NOT as the dominant tone.
        # Earlier passes overweighted warm tones and the result
        # clashed with the teal accent in the card.
        "A young first-time home buyer in their late 20s standing on "
        "the front step of a small cozy bungalow, looking down with a "
        "happy expression at a single brass house key cradled in both "
        "hands — slim body shape, casual modern outfit (soft cream "
        "top, dusty teal trousers). The bungalow behind them has "
        "dusty seafoam-teal clapboard siding and a slightly darker "
        "teal front door, white window trim, a small window beside "
        "the door showing a soft cool-cream glow from inside, and "
        "tiny stylized brass house numbers as simple geometric shapes "
        "on the door frame. A small woven welcome mat sits at their "
        "feet. Layered foliage: tall leafy potted plants in pale "
        "dusty-blue ceramic planters flanking the door, a low garden "
        "bed in front with stylized sage and ice-blue flowers, "
        "hanging ivy from the porch beam. Dusty sky-blue background "
        "with soft white cloud shapes drifting in the upper area, a "
        "low pale sun to one side, ground band in soft sage with a "
        "subtle stone path leading up to the step. One small "
        "terracotta planter as the only warm accent in the scene. "
        "Rich, first-keys, threshold-of-a-new-chapter feeling — not "
        "minimal, not warm-toned. Primary palette: dusty seafoam "
        "teal (#5a9a8e) and dusty sky blue. Generous visible canvas "
        "grain and painterly texture throughout. " + STYLE
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
            # `response_format` was removed from the images endpoint
            # sometime between the original generation pass (April 2026)
            # and now — newer API rejects it as Unknown parameter. We
            # take whatever the response gives us (b64 or URL) so the
            # script is forward-compatible either way.
            #
            # Also: dall-e-3 was deprecated (June 2026). gpt-image-1 is
            # the current model. Quality vocabulary changed too —
            # standard/hd -> low/medium/high/auto.
            json={
                "model": "gpt-image-1",
                "prompt": prompt,
                "n": 1,
                "size": "1024x1024",
                # high adds noticeable detail vs. medium — costs more
                # per image but the difference reads strongly on the
                # hero illustration (more foliage, richer texture,
                # better scene depth).
                "quality": "high",
            },
            timeout=180,
        )
        if r.status_code == 200:
            payload = r.json().get("data", [{}])[0]
            if payload.get("b64_json"):
                out.write_bytes(base64.b64decode(payload["b64_json"]))
            elif payload.get("url"):
                img = requests.get(payload["url"], timeout=120)
                img.raise_for_status()
                out.write_bytes(img.content)
            else:
                print(
                    f"  FAIL {name}: response had neither b64_json nor url: "
                    f"keys={list(payload.keys())}"
                )
                return False
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
