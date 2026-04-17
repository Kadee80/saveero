"""
scenarios/engine.py

Top-level orchestrator. Takes one MasterInputs, runs all five
scenarios + the Decision Map + the Audit, and returns a single
EngineResult.

This mirrors the Excel workbook's "edit inputs, everything recomputes"
workflow. Clients wanting finer-grained access can call the individual
`compute_*` functions directly (also exposed via per-scenario HTTP endpoints).
"""
from __future__ import annotations

from dataclasses import dataclass

from .audit import AuditReport, run_audit
from .decision_map import DecisionMap, compute_decision_map
from .inputs import MasterInputs
from .refinance import RefinanceResult, compute_refinance
from .rent import RentResult, compute_rent
from .rent_out_buy import RentOutBuyResult, compute_rent_out_buy
from .sell_buy import SellBuyResult, compute_sell_buy
from .stay import StayResult, compute_stay


@dataclass(frozen=True)
class EngineResult:
    inputs: MasterInputs
    stay: StayResult
    refinance: RefinanceResult
    sell_buy: SellBuyResult
    rent: RentResult
    rent_out_buy: RentOutBuyResult
    decision_map: DecisionMap
    audit: AuditReport


def run_all(inputs: MasterInputs) -> EngineResult:
    """
    Run the full Home Decision Model against one set of inputs.

    Validation errors surface as ValueError — the API layer catches these
    and returns a 400. Internally the engine assumes inputs are valid.
    """
    inputs.validate()

    stay = compute_stay(inputs)
    refinance = compute_refinance(inputs)
    sell_buy = compute_sell_buy(inputs, stay.total_monthly_ownership_cost)
    rent = compute_rent(inputs)
    rent_out_buy = compute_rent_out_buy(inputs, stay.total_monthly_ownership_cost)

    decision_map = compute_decision_map(
        inputs, stay, refinance, sell_buy, rent, rent_out_buy
    )

    audit = run_audit(
        inputs, stay, refinance, sell_buy, rent, rent_out_buy, decision_map
    )

    return EngineResult(
        inputs=inputs,
        stay=stay,
        refinance=refinance,
        sell_buy=sell_buy,
        rent=rent,
        rent_out_buy=rent_out_buy,
        decision_map=decision_map,
        audit=audit,
    )
