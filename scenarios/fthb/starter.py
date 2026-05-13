"""
scenarios/fthb/starter.py

Buy Starter Home scenario — purchase the lower-priced "starter" home at
the universal down payment, default mortgage rate, no DPA assistance.

Mirrors the 'Buy Starter Home' sheet of FTHB_decision map.xlsx.

Almost all of the math lives in `_buy_common.compute_buy_scenario`.
This file just types the result + binds the per-scenario knobs.
"""
from __future__ import annotations

from ._buy_common import BuyScenarioResult, compute_buy_scenario
from .inputs import FTHBInputs

# Starter aliases the shared dataclass — keeps the public type name
# scenario-specific without forking the schema.
StarterResult = BuyScenarioResult


def compute_buy_starter(inputs: FTHBInputs) -> StarterResult:
    """Compute the Buy Starter Home scenario."""
    return compute_buy_scenario(
        inputs,
        target_price=inputs.starter_home_price,
        # Excel risk IF chain on Buy Starter ends in "Moderate" — the
        # default for the shared helper, kept explicit here so the
        # diff-vs-Preferred is visible at the call site.
        cash_flow_tight_label="Moderate",
    )
