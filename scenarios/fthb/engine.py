"""
scenarios/fthb/engine.py

Top-level orchestrator for the First-Time Homebuyer engine.

Takes one FTHBInputs, runs all five scenarios + the Decision Map + the
Audit, and returns a single EngineResult.

Mirrors the Excel workbook's "edit inputs, everything recomputes"
workflow. Clients wanting finer-grained access can call the individual
`compute_*` functions directly (and the per-scenario HTTP endpoints
expose the same).
"""
from __future__ import annotations

from dataclasses import dataclass

from .assistance import AssistanceResult, compute_buy_with_assistance
from .audit import AuditReport, run_audit
from .decision_map import DecisionMap, compute_decision_map
from .delay import DelayResult, compute_delay_purchase
from .inputs import FTHBInputs
from .preferred import PreferredResult, compute_buy_preferred
from .rent import ContinueRentingResult, compute_continue_renting
from .starter import StarterResult, compute_buy_starter


@dataclass(frozen=True)
class EngineResult:
    inputs: FTHBInputs
    continue_renting: ContinueRentingResult
    buy_starter: StarterResult
    buy_preferred: PreferredResult
    buy_with_assistance: AssistanceResult
    delay_purchase: DelayResult
    decision_map: DecisionMap
    audit: AuditReport


def run_all(inputs: FTHBInputs) -> EngineResult:
    """
    Run the full FTHB engine against one set of inputs.

    Validation errors surface as ValueError — the API layer catches
    these and returns a 400. Internally the engine assumes inputs are
    valid.
    """
    inputs.validate()

    rent = compute_continue_renting(inputs)
    starter = compute_buy_starter(inputs)
    preferred = compute_buy_preferred(inputs)
    assistance = compute_buy_with_assistance(inputs)
    delay = compute_delay_purchase(inputs)

    decision = compute_decision_map(inputs, rent, starter, preferred, assistance, delay)
    audit = run_audit(inputs, rent, starter, preferred, assistance, delay, decision)

    return EngineResult(
        inputs=inputs,
        continue_renting=rent,
        buy_starter=starter,
        buy_preferred=preferred,
        buy_with_assistance=assistance,
        delay_purchase=delay,
        decision_map=decision,
        audit=audit,
    )
