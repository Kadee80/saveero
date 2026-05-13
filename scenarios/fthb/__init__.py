"""
scenarios.fthb — First-Time Homebuyer Decision Engine.

A separate, parallel decision engine to the existing homeowner one in
`scenarios/`. Forks at the user's intake (non-homeowner vs existing
homeowner) per the client's architectural ask:
> "This would be a separate branch from the homeowner branch (so at
>  the start there should be a fork between non-homeowners and existing
>  homeowners)"

The math is deterministic and bit-for-bit golden-tested against the
client's `FTHB_decision map.xlsx` spreadsheet, same compliance bar as
the homeowner engine.

Five scenarios:
    - Continue Renting
    - Buy Starter Home
    - Buy Preferred Home
    - Buy with Downpayment Assistance (DPA)
    - Delay Purchase

Public API:
    FTHBInputs              — dataclass holding all consumer + system inputs
    run_all(inputs)         — run the full engine (5 scenarios + decision map + audit)
    compute_continue_renting
    compute_buy_starter
    compute_buy_preferred
    compute_buy_with_assistance
    compute_delay_purchase
    compute_decision_map
    run_audit

A second-order coupling Van called out in the email is load-bearing:
monthly housing cost feeds residual savings capacity, which compounds
into total net position. So `total_net_position` is NOT just equity at
horizon — it includes future value of remaining cash AND projected
savings accumulation over the comparison horizon.
"""
from .audit import AuditCheck, AuditReport, run_audit
from .assistance import AssistanceResult, compute_buy_with_assistance
from .decision_map import (
    DecisionMap,
    RecommendationSnapshot,
    ScenarioComparisonRow,
    compute_decision_map,
)
from .delay import DelayResult, compute_delay_purchase
from .engine import EngineResult, run_all
from .inputs import FTHBInputs
from .preferred import PreferredResult, compute_buy_preferred
from .rent import ContinueRentingResult, compute_continue_renting
from .starter import StarterResult, compute_buy_starter

__all__ = [
    "FTHBInputs",
    "EngineResult",
    "run_all",
    "ContinueRentingResult",
    "compute_continue_renting",
    "StarterResult",
    "compute_buy_starter",
    "PreferredResult",
    "compute_buy_preferred",
    "AssistanceResult",
    "compute_buy_with_assistance",
    "DelayResult",
    "compute_delay_purchase",
    "DecisionMap",
    "ScenarioComparisonRow",
    "RecommendationSnapshot",
    "compute_decision_map",
    "AuditCheck",
    "AuditReport",
    "run_audit",
]
