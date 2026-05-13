"""
scenarios/fthb/preferred.py

Buy Preferred Home scenario — same shape as starter but at the higher
"reach" price.

Mirrors the 'Buy Preferred Home' sheet of FTHB_decision map.xlsx. The
only differences vs Buy Starter Home are:
    1. price comes from `preferred_home_price` (Inputs!B13)
    2. risk IF chain's last label is "Higher" (vs "Moderate")
"""
from __future__ import annotations

from ._buy_common import BuyScenarioResult, compute_buy_scenario
from .inputs import FTHBInputs

PreferredResult = BuyScenarioResult


def compute_buy_preferred(inputs: FTHBInputs) -> PreferredResult:
    """Compute the Buy Preferred Home scenario."""
    return compute_buy_scenario(
        inputs,
        target_price=inputs.preferred_home_price,
        # Excel risk IF chain on Buy Preferred ends in "Higher" rather
        # than "Moderate" — preserve verbatim so the spec strings match.
        cash_flow_tight_label="Higher",
    )
