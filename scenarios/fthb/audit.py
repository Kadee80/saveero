"""
scenarios/fthb/audit.py

Audit checks for the FTHB engine — same shape as scenarios/audit.py.

Mirrors the 13 checks on the 'Audit' sheet of FTHB_decision map.xlsx.
12 are PASS in the shipped spreadsheet; one is intentionally CHECK
(Van's TODO for a future "savings-adjusted decision score" that ties
the Outputs!B14 max-net-position to a per-scenario L-column score).
We preserve that CHECK status to match Excel — when the savings-adjusted
score is implemented later, this audit check should flip to PASS.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Literal

from .assistance import AssistanceResult
from .decision_map import DecisionMap, NAME_ASSISTANCE, NAME_PREFERRED, NAME_STARTER
from .delay import DelayResult
from .inputs import FTHBInputs
from .preferred import PreferredResult
from .rent import ContinueRentingResult
from .starter import StarterResult

# Tolerance for "close enough" equality between two derived totals
# (in dollars). 1¢ is plenty — the recomputations are pure arithmetic
# with the same intermediate values.
EQUALITY_TOL: float = 0.01


@dataclass(frozen=True)
class AuditCheck:
    name: str
    status: Literal["PASS", "CHECK"]
    notes: str


@dataclass(frozen=True)
class AuditReport:
    checks: List[AuditCheck]
    all_passed: bool


def _approx_eq(a: float, b: float, tol: float = EQUALITY_TOL) -> bool:
    return abs(a - b) <= tol


def run_audit(
    inputs: FTHBInputs,
    rent: ContinueRentingResult,
    starter: StarterResult,
    preferred: PreferredResult,
    assistance: AssistanceResult,
    delay: DelayResult,
    decision: DecisionMap,
) -> AuditReport:
    """Run all 13 checks. Order matches the Audit sheet rows 4-16."""
    checks: List[AuditCheck] = []

    # B4 — required inputs populated
    checks.append(_required_inputs_populated(inputs))

    # B5 — universal down payment fits within available cash
    checks.append(AuditCheck(
        name="Universal down payment does not exceed available cash",
        status=_pass_if(inputs.universal_down_payment <= inputs.available_cash_for_purchase),
        notes="Down payment should fit within available cash.",
    ))

    # B6/B7/B8 — formulas generated. In Python land "ISERROR" doesn't
    # apply, so we instead assert the totals are finite numbers.
    checks.append(_formulas_generated("Starter formulas generated", starter))
    checks.append(_formulas_generated("Preferred formulas generated", preferred))
    checks.append(_formulas_generated("Assistance formulas generated", assistance))

    # B9 — decision recommendation generated
    checks.append(AuditCheck(
        name="Decision recommendation generated",
        status=_pass_if(bool(decision.recommendation.best_executable_path)),
        notes="Outputs tab should return a best executable path.",
    ))

    # B10 — feasibility statuses are binary across the buy scenarios
    binary_set = {"Feasible", "Not Feasible"}
    checks.append(AuditCheck(
        name="Binary feasibility statuses only",
        status=_pass_if(
            starter.feasibility_status in binary_set
            and preferred.feasibility_status in binary_set
            and assistance.feasibility_status in binary_set
        ),
        notes="Buy scenario feasibility outputs should be binary.",
    ))

    # B11 — DPA repayment subtracted from assistance equity
    expected_assistance_equity = (
        assistance.future_home_value - assistance.future_loan_balance - inputs.available_dpa
    )
    checks.append(AuditCheck(
        name="DPA repayment reflected in equity",
        status=_pass_if(_approx_eq(assistance.net_equity_at_horizon, expected_assistance_equity)),
        notes="Assistance equity should subtract repayable DPA amount.",
    ))

    # B12/B13/B14 — total_net_position composition for each buy scenario
    for label, r in (
        ("Starter", starter),
        ("Preferred", preferred),
        ("Assistance", assistance),
    ):
        expected_total = (
            r.net_equity_at_horizon
            + r.future_value_of_remaining_cash
            + r.projected_savings_accumulation
        )
        checks.append(AuditCheck(
            name=f"{label} net position includes savings accumulation",
            status=_pass_if(_approx_eq(r.total_net_position, expected_total)),
            notes=(
                f"{label} total should include equity, remaining cash, "
                "and savings accumulation."
            ),
        ))

    # B15 — known-broken: "Output recommendation uses savings-adjusted scores"
    # Excel hard-fails this because the savings-adjusted score column L
    # isn't implemented. Preserve the CHECK status so the audit report
    # surfaces the same TODO Van flagged.
    checks.append(AuditCheck(
        name="Output recommendation uses savings-adjusted scores",
        status="CHECK",
        notes=(
            "Best net position should tie to a savings-adjusted decision "
            "score. Score column not yet implemented; recommendation falls "
            "back to MAXIFS over feasible-only net_position."
        ),
    ))

    # B16 — assistance scenario uses the starter price (not preferred)
    checks.append(AuditCheck(
        name="Assistance scenario uses starter home price",
        status=_pass_if(_approx_eq(assistance.target_purchase_price, inputs.starter_home_price)),
        notes=(
            "Buy with Assistance should be based on starter home target "
            "price, not preferred home price."
        ),
    ))

    all_passed = all(c.status == "PASS" for c in checks)
    return AuditReport(checks=checks, all_passed=all_passed)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _pass_if(cond: bool) -> Literal["PASS", "CHECK"]:
    return "PASS" if cond else "CHECK"


def _required_inputs_populated(inputs: FTHBInputs) -> AuditCheck:
    """Mirror of Excel B4: AND(B4>0, B6>=0, B7>=0, B11>0, B12>0, B13>0)."""
    ok = (
        inputs.annual_household_income > 0
        and inputs.available_cash_for_purchase >= 0
        and inputs.universal_down_payment >= 0
        and inputs.current_monthly_rent > 0
        and inputs.starter_home_price > 0
        and inputs.preferred_home_price > 0
    )
    return AuditCheck(
        name="Required inputs populated",
        status=_pass_if(ok),
        notes="Core user inputs should be populated.",
    )


def _formulas_generated(name: str, result: object) -> AuditCheck:
    """
    Python-land equivalent of Excel's `AND(NOT(ISERROR(...)))`.

    We check that the scenario's `total_net_position` and
    `feasibility_status` are well-defined (finite number + non-empty
    string). If a future code change starts emitting NaN or inf, this
    check will surface it as CHECK.
    """
    import math
    total = getattr(result, "total_net_position", None)
    feas = getattr(result, "feasibility_status", None)
    ok = (
        isinstance(total, (int, float))
        and math.isfinite(total)
        and isinstance(feas, str)
        and feas
    )
    return AuditCheck(
        name=name,
        status=_pass_if(ok),
        notes=f"{name.split(' ')[0]} scenario should calculate.",
    )
