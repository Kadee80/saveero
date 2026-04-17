"""
scenarios — Home Decision Model engine.

Public API:
    MasterInputs        — dataclass holding all 45 client inputs
    run_all(inputs)     — run the full engine (all 5 scenarios + Decision Map + Audit)
    compute_stay        — Stay scenario only
    compute_refinance   — Refinance scenario only
    compute_sell_buy    — Sell + Buy scenario only (needs Stay for monthly-delta ref)
    compute_rent        — Rent (investment-view) scenario only
    compute_rent_out_buy — Rent Out & Buy scenario only (needs Stay)
    compute_decision_map — Decision Map only (takes all 5 scenario results)

The scenarios module intentionally decouples Python domain types
(dataclasses) from HTTP surface (Pydantic). See scenarios.schemas for
the wire-format models.
"""
from .audit import AuditCheck, AuditReport, run_audit
from .decision_map import (
    ComparisonRow,
    DecisionMap,
    FeasibilityFlags,
    PriorityRankings,
    RecommendationSnapshot,
    RentDriverBreakdown,
    compute_decision_map,
)
from .engine import EngineResult, run_all
from .inputs import MasterInputs
from .refinance import RefinanceResult, compute_refinance
from .rent import RentMonthlyFlow, RentResult, RentTaxView, compute_rent
from .rent_out_buy import RentOutBuyResult, compute_rent_out_buy
from .sell_buy import SellBuyResult, compute_sell_buy
from .stay import StayResult, compute_stay

__all__ = [
    "MasterInputs",
    "EngineResult",
    "run_all",
    "StayResult",
    "compute_stay",
    "RefinanceResult",
    "compute_refinance",
    "SellBuyResult",
    "compute_sell_buy",
    "RentMonthlyFlow",
    "RentTaxView",
    "RentResult",
    "compute_rent",
    "RentOutBuyResult",
    "compute_rent_out_buy",
    "DecisionMap",
    "ComparisonRow",
    "RentDriverBreakdown",
    "RecommendationSnapshot",
    "PriorityRankings",
    "FeasibilityFlags",
    "compute_decision_map",
    "AuditCheck",
    "AuditReport",
    "run_audit",
]
