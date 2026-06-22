"""
portfolio/product_rules.py

Editable strategy rules — NOT lender guidelines.

Mirrors sheet 5 (`Product_Rules`) of the workbook. These are advisory
thresholds the engine uses to estimate strategy fit; they are not loan
approval criteria and are explicitly framed that way in the consumer
output ("appears to be a strong path… review with a licensed mortgage
professional").

Surfaced as a dataclass so future sessions can override defaults per
test, or so an admin can A/B different rule sets without redeploying.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ProductRules:
    # Credit floor — buckets below this read as low-fit / review.
    minimum_credit_score_bucket: str = "660-699"
    # DSCR threshold for the DSCR strategy.
    minimum_dscr: float = 1.0
    # Conventional cash-out max LTV — drives `cash_out_accessible_equity`
    # on every existing property regardless of use status.
    conventional_cash_out_max_ltv: float = 0.80
    # DSCR cash-out max LTV — applies to investment properties' DSCR
    # accessible equity.
    dscr_cash_out_max_ltv: float = 0.75
    # No-ratio / asset-based max LTV — applies to primary residences for
    # the "no income docs" strategy variant.
    no_ratio_max_ltv: float = 0.75
    # HELOC max CLTV — drives `heloc_accessible_equity`.
    heloc_max_cltv: float = 0.85
    # Cash to hold back for liquidity preservation. Subtracted from
    # available_cash when scoring the "Use Cash" strategy.
    cash_reserve_buffer: float = 25_000.0
    # Fix & flip capital availability proxy (LTV against ARV at acquisition).
    bridge_hard_money_advance_pct: float = 0.80
    # Flip strategy ROI threshold.
    target_flip_minimum_gross_roi: float = 0.15
    # STR revenue haircut for risk scoring.
    str_revenue_risk_haircut: float = 0.85
    # Vacation home risk penalty (personal-use uncertainty).
    vacation_home_risk_penalty: float = 0.75
    # Commercial multifamily (5+) default down payment.
    commercial_multifamily_default_down_payment_pct: float = 0.30
    # Reserved for when commercial-other comes back in scope.
    other_commercial_default_down_payment_pct: float = 0.35


DEFAULT_PRODUCT_RULES = ProductRules()
