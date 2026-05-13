"""
scenarios/fthb/assistance.py

Buy with Downpayment Assistance scenario — buy the starter home, but
apply DPA. The DPA mechanic in the spreadsheet has three load-bearing
moving parts and they all need to land in the engine:

    1. Rate premium: Excel adds 0.005 (50 bps) on top of the default
       mortgage rate, applied to BOTH the PMT calculation and the
       future-loan-balance amortization. See `DPA_RATE_PREMIUM` in
       inputs.py.
    2. Cash-to-close benefit: the DPA amount reduces the cash needed
       at closing (lowers `total_cash_required`).
    3. Forced repayment: the DPA principal is subtracted from net
       equity at horizon — Excel models this as a single deduction at
       the end (no amortization of the DPA loan, no DPA interest accrual).
       Audit check #11 enforces this:
         B24 = B22 - B23 - Inputs!B30
       (i.e., FV home value - FV first-mortgage balance - DPA principal)

Mirrors the 'Buy with Assistance' sheet of FTHB_decision map.xlsx.

Note on Excel row numbering: the Assistance sheet has DPA caveats text
between rows 33-39, which pushes residual_savings to B46 and
savings_accumulation to B47 (vs B34/B35 on the other two buy sheets).
The shared helper flattens both into the same dataclass fields, so
callers don't need to care which sheet they came from.
"""
from __future__ import annotations

from ._buy_common import BuyScenarioResult, compute_buy_scenario
from .inputs import DPA_RATE_PREMIUM, FTHBInputs

AssistanceResult = BuyScenarioResult


def compute_buy_with_assistance(inputs: FTHBInputs) -> AssistanceResult:
    """Compute the Buy with Downpayment Assistance scenario."""
    return compute_buy_scenario(
        inputs,
        # B4: =Inputs!$B$12 — Assistance is anchored to STARTER price,
        # not preferred. Audit check #16 enforces this.
        target_price=inputs.starter_home_price,
        # B13/B23: rate is `Inputs!$B$17 + 0.005` for both PMT and FV.
        rate_premium=DPA_RATE_PREMIUM,
        # B7: assistance benefit reduces cash-to-close.
        assistance_benefit=inputs.available_dpa,
        # B24: forced repayment subtracts DPA principal from horizon equity.
        dpa_principal_repaid_at_horizon=inputs.available_dpa,
        # Excel risk IF chain on Buy with Assistance ends in "Moderate".
        cash_flow_tight_label="Moderate",
    )
