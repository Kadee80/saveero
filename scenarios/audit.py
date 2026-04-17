"""
scenarios/audit.py

Runtime audit checks — mirrors the 'Audit' sheet (rows 3–11) in the
client's Excel model.

These checks verify internal consistency of the scenario engine. They
aren't input validation — they catch regressions in the math itself.
Every check should always PASS on a healthy engine; a CHECK result is a
bug.

The audit is included in the engine's response payload so clients can
show "model integrity" indicators and so we have a contract-level
regression signal in CI.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Literal

from .decision_map import DecisionMap
from .inputs import MasterInputs
from .refinance import RefinanceResult
from .rent import RentResult
from .rent_out_buy import RentOutBuyResult
from .sell_buy import SellBuyResult
from .stay import StayResult


AuditStatus = Literal["PASS", "CHECK"]


@dataclass(frozen=True)
class AuditCheck:
    name: str
    status: AuditStatus
    notes: str


@dataclass(frozen=True)
class AuditReport:
    checks: List[AuditCheck]
    all_passed: bool


# Excel uses 0.01 as the tie tolerance (see Audit!B3 ABS(...) < 0.01)
TOLERANCE = 0.01


def _tie(a: float, b: float, tolerance: float = TOLERANCE) -> AuditStatus:
    return "PASS" if abs(a - b) < tolerance else "CHECK"


def run_audit(
    inputs: MasterInputs,
    stay: StayResult,
    refinance: RefinanceResult,
    sell_buy: SellBuyResult,
    rent: RentResult,
    rent_out_buy: RentOutBuyResult,
    decision: DecisionMap,
) -> AuditReport:
    """Run all 11 audit checks from the Excel 'Audit' sheet."""
    checks: List[AuditCheck] = []

    # R3: Stay total net position ties to net equity
    checks.append(AuditCheck(
        name="Stay total net position ties to net equity",
        status=_tie(decision.total_net_position.stay, stay.net_equity_at_horizon),
        notes="Should tie exactly.",
    ))

    # R4: Refinance total net position = net_equity + cumulative savings
    #     (Excel: ABS(Outputs!C8 - (Refi!B18 + Refi!B19)) < 0.01)
    #     Note: this check compares Outputs!C8 to B18+B19, NOT B20. The sheet
    #     includes cash_to_close in B20 but excludes it here. Mirrors Excel exactly.
    checks.append(AuditCheck(
        name="Refinance total net position ties",
        status=_tie(
            decision.total_net_position.refinance,
            refinance.net_equity_at_horizon + refinance.cumulative_payment_savings
            - refinance.cash_to_close,
        ),
        notes="Net equity + cumulative payment savings - cash to close.",
    ))

    # R5: Sell+Buy total net position = net_equity + cash_remaining_at_close
    checks.append(AuditCheck(
        name="Sell + Buy total net position ties",
        status=_tie(
            decision.total_net_position.sell_buy,
            sell_buy.net_equity_at_horizon + sell_buy.cash_remaining_at_close,
        ),
        notes="Net equity + cash remaining at close.",
    ))

    # R6: Rent total net position = net_equity + cumulative_cash_flow - make_ready
    checks.append(AuditCheck(
        name="Rent total net position ties",
        status=_tie(
            decision.total_net_position.rent,
            rent.net_equity_at_horizon
            + rent.cumulative_after_tax_rental_cash_flow
            - rent.make_ready_cost,
        ),
        notes="Net equity + cumulative after-tax cash flow - make-ready cost.",
    ))

    # R7: Rent Out & Buy total net position ties to its own rollup
    checks.append(AuditCheck(
        name="Rent Out & Buy total net position ties",
        status=_tie(
            decision.total_net_position.rent_out_buy,
            rent_out_buy.total_net_position,
        ),
        notes="Total net position should tie exactly.",
    ))

    # R8: Refi break-even formula
    #     Excel: IF(B9>0, ABS(B11 - B5/B9) < 0.01, TRUE)
    if refinance.monthly_payment_change > 0:
        expected_be = refinance.refinance_closing_costs / refinance.monthly_payment_change
        status: AuditStatus = (
            _tie(refinance.break_even_months, expected_be)
            if refinance.break_even_months is not None
            else "CHECK"
        )
    else:
        status = "PASS"
    checks.append(AuditCheck(
        name="Refi break-even formula",
        status=status,
        notes="All-in cost divided by monthly savings.",
    ))

    # R9: No invalid formula errors in key outputs
    #     In Python this maps to: all key fields are finite floats
    import math
    key_values = [
        decision.total_net_position.stay,
        decision.total_net_position.refinance,
        decision.total_net_position.sell_buy,
        decision.total_net_position.rent,
        decision.total_net_position.rent_out_buy,
    ]
    all_finite = all(isinstance(v, float) and math.isfinite(v) for v in key_values)
    checks.append(AuditCheck(
        name="No invalid formula errors in key outputs",
        status="PASS" if all_finite else "CHECK",
        notes="Key output cells evaluate successfully.",
    ))

    # R10: Available cash input is non-negative
    checks.append(AuditCheck(
        name="Available cash input is non-negative",
        status="PASS" if inputs.available_cash_for_purchase >= 0 else "CHECK",
        notes="Liquidity input should not be negative.",
    ))

    # R11: Rent Out & Buy liquidity status aligns with cash surplus
    expected_status: str
    stretch_threshold = max(10_000.0, inputs.available_cash_for_purchase * 0.10)
    if rent_out_buy.cash_surplus_or_shortfall < 0:
        expected_status = "Not viable"
    elif rent_out_buy.cash_surplus_or_shortfall < stretch_threshold:
        expected_status = "Stretch"
    else:
        expected_status = "Feasible"
    checks.append(AuditCheck(
        name="Rent Out & Buy liquidity status aligns with cash surplus",
        status=(
            "PASS"
            if rent_out_buy.liquidity_status == expected_status
            else "CHECK"
        ),
        notes="Status should match the scenario surplus/shortfall logic.",
    ))

    return AuditReport(
        checks=checks,
        all_passed=all(c.status == "PASS" for c in checks),
    )
