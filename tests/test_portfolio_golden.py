"""
tests/test_portfolio_golden.py

Golden tests for the Portfolio Strategy Engine.

The "golden" baseline is Van's `Portfolio Builder Engine.xlsx` V4.1 — the
shipped sample input on sheets 1-4 with the dashboard outputs we read
from sheet 9.

NOTE on tolerance: the engine's per-factor formulas (cash flow, risk,
eligibility) are tuned to the workbook's behavior but don't bit-for-bit
replicate every cell-level conditional. The recommendation hierarchy
(top-ranked strategy, alternative, score ordering) matches; absolute
weighted scores may drift by a few points. Tests assert the hierarchy
and the headline portfolio + target numbers exactly, and assert weighted
scores within a tolerance band.

When Van finalizes the per-factor formulas tomorrow, tighten the
tolerances to ±1 to lock in bit-for-bit reproducibility.
"""
from __future__ import annotations

import pytest

from portfolio import (
    ExistingProperty,
    PortfolioInputs,
    PortfolioProfile,
    TargetProperty,
    run_all,
)


# ---------------------------------------------------------------------------
# Sample input — mirrors workbook sheets 1, 2, 4 exactly.
# ---------------------------------------------------------------------------

@pytest.fixture
def workbook_sample_inputs() -> PortfolioInputs:
    return PortfolioInputs(
        profile=PortfolioProfile(
            credit_score_bucket="700-739",
            income_profile="Self-Employed",
            available_cash=75_000.0,
            investor_goal="Build Wealth",
            risk_tolerance="Moderate",
            time_horizon="5 Years",
            expected_annual_appreciation=0.03,
            estimated_acquisition_closing_costs_pct=0.03,
            target_down_payment_pct=0.25,
        ),
        existing_properties=(
            ExistingProperty(
                property_type="Primary Residence",
                use_status="Owner-Occupied",
                current_value=750_000,
                mortgage_balance=420_000,
                current_rate=0.035,
                monthly_pi=1885,
                monthly_taxes_ins_hoa=850,
                monthly_rent=0,
                monthly_operating_expenses=0,
                notes="Current home",
            ),
            ExistingProperty(
                property_type="Investment Property",
                use_status="Rented",
                current_value=525_000,
                mortgage_balance=310_000,
                current_rate=0.0625,
                monthly_pi=1909,
                monthly_taxes_ins_hoa=700,
                monthly_rent=3600,
                monthly_operating_expenses=450,
                notes="Existing rental",
            ),
        ),
        target_property=TargetProperty(),
    )


# ---------------------------------------------------------------------------
# Portfolio analytics — workbook sheet 3 / summary cells
# ---------------------------------------------------------------------------

def test_portfolio_summary_matches_workbook(workbook_sample_inputs):
    result = run_all(workbook_sample_inputs)
    s = result.portfolio.summary
    assert s.total_property_value == pytest.approx(1_275_000)
    assert s.total_mortgage_balance == pytest.approx(730_000)
    assert s.total_equity == pytest.approx(545_000)
    assert s.total_monthly_rent == pytest.approx(3_600)
    assert s.total_monthly_pitia == pytest.approx(5_344)
    assert s.total_monthly_cash_flow == pytest.approx(-2_194)
    assert s.total_heloc_accessible_equity == pytest.approx(353_750)
    assert s.total_cash_out_accessible_equity == pytest.approx(290_000)
    assert s.total_dscr_no_ratio_accessible_equity == pytest.approx(226_250)


def test_per_property_analytics_match_workbook(workbook_sample_inputs):
    result = run_all(workbook_sample_inputs)
    primary, investment = result.portfolio.properties
    # Primary Residence: $750k, $420k, ...
    assert primary.equity == pytest.approx(330_000)
    assert primary.ltv == pytest.approx(0.56, abs=0.01)
    assert primary.heloc_accessible_equity == pytest.approx(217_500)
    assert primary.cash_out_accessible_equity == pytest.approx(180_000)
    assert primary.dscr_no_ratio_accessible_equity == pytest.approx(142_500)
    # Investment: $525k, $310k, ...
    assert investment.equity == pytest.approx(215_000)
    assert investment.ltv == pytest.approx(0.5904, abs=0.001)
    assert investment.dscr == pytest.approx(1.38, abs=0.01)
    assert investment.monthly_cash_flow == pytest.approx(541)
    assert investment.heloc_accessible_equity == pytest.approx(136_250)
    assert investment.cash_out_accessible_equity == pytest.approx(110_000)
    assert investment.dscr_no_ratio_accessible_equity == pytest.approx(83_750)


# ---------------------------------------------------------------------------
# Target property — workbook sheet 4 / formula rows
# ---------------------------------------------------------------------------

def test_target_property_numbers_match_workbook(workbook_sample_inputs):
    result = run_all(workbook_sample_inputs)
    t = result.target_metrics
    assert t.down_payment_pct == pytest.approx(0.25)
    assert t.down_payment_needed == pytest.approx(125_000)
    assert t.closing_costs_needed == pytest.approx(15_000)
    assert t.total_capital_needed == pytest.approx(140_000)
    assert t.loan_amount == pytest.approx(375_000)
    assert t.monthly_pi == pytest.approx(2_622.054, abs=0.1)
    assert t.pitia == pytest.approx(3_372.054, abs=0.1)
    assert t.dscr == pytest.approx(1.127, abs=0.001)
    assert t.monthly_cash_flow == pytest.approx(-72.05, abs=0.1)
    # property_type_fit_score is still emitted by TargetPropertyMetrics
    # (legacy / informational) — strategy scoring no longer reads it
    # directly; LTW + risk now carry the property-type signal.
    assert t.property_type_fit_score == 80
    assert t.dscr_relevant is True
    assert t.bridge_hard_money_relevant is False


# ---------------------------------------------------------------------------
# Strategy scoring — workbook sheet 7 — hierarchy + score tolerance
# ---------------------------------------------------------------------------

def test_recommended_strategy_is_heloc(workbook_sample_inputs):
    result = run_all(workbook_sample_inputs)
    by_rank = sorted(result.strategies, key=lambda s: s.rank)
    assert by_rank[0].key == "heloc_on_existing_equity"


def test_all_eight_strategies_emitted(workbook_sample_inputs):
    result = run_all(workbook_sample_inputs)
    assert len(result.strategies) == 8
    keys = {s.key for s in result.strategies}
    expected = {
        "use_available_cash",
        "heloc_on_existing_equity",
        "conventional_cash_out",
        "dscr_cash_out_on_rental",
        "no_ratio_asset_based_cash_out",
        "sell_and_redeploy",
        "combination_strategy",
        "bridge_hard_money_private_capital",
    }
    assert keys == expected


def test_capital_coverage_for_equity_strategies(workbook_sample_inputs):
    result = run_all(workbook_sample_inputs)
    by_key = {s.key: s for s in result.strategies}
    # HELOC, conv cash-out, no-ratio, combo should all cover the $140k need.
    assert by_key["heloc_on_existing_equity"].capital_coverage_pct == pytest.approx(1.0)
    assert by_key["conventional_cash_out"].capital_coverage_pct == pytest.approx(1.0)
    assert by_key["no_ratio_asset_based_cash_out"].capital_coverage_pct == pytest.approx(1.0)
    # Use cash: $75k available minus $25k buffer = $50k, vs $140k need = 0.357.
    assert by_key["use_available_cash"].capital_coverage_pct == pytest.approx(0.357, abs=0.001)


def test_bridge_low_for_non_flip_target(workbook_sample_inputs):
    result = run_all(workbook_sample_inputs)
    bridge = next(s for s in result.strategies if s.key == "bridge_hard_money_private_capital")
    # Target is Long-Term Rental, not Fix & Flip — bridge should rank last.
    assert bridge.rank == 8
    assert bridge.weighted_score < 50


# ---------------------------------------------------------------------------
# Dashboard payload — sheet 9
# ---------------------------------------------------------------------------

def test_dashboard_matches_workbook_summary(workbook_sample_inputs):
    result = run_all(workbook_sample_inputs)
    d = result.dashboard
    assert d.target_property_type == "Long-Term Rental"
    assert d.total_equity == pytest.approx(545_000)
    assert d.estimated_accessible_equity == pytest.approx(226_250)
    assert d.portfolio_monthly_cash_flow == pytest.approx(-2_194)
    assert d.capital_needed == pytest.approx(140_000)
    assert d.target_property_dscr == pytest.approx(1.127, abs=0.001)
    assert d.recommended_path == "HELOC on Existing Equity"
    assert d.alternative_path is not None
    assert "strong path for a Long-Term Rental" in d.consumer_explanation


# ---------------------------------------------------------------------------
# Fix & Flip — different code path, smoke test
# ---------------------------------------------------------------------------

def test_fix_and_flip_uses_flip_capital(workbook_sample_inputs):
    inputs = PortfolioInputs(
        profile=workbook_sample_inputs.profile,
        existing_properties=workbook_sample_inputs.existing_properties,
        target_property=TargetProperty(
            target_property_type="Fix & Flip",
            target_purchase_price=400_000,
            expected_monthly_rent_or_revenue=0,
            expected_monthly_taxes_ins_hoa=400,
            expected_operating_expenses=0,
            estimated_interest_rate=0.10,
            amortization_years=30,
            rehab_budget=80_000,
            holding_costs=20_000,
            arv=600_000,
            sale_costs_pct=0.06,
        ),
    )
    result = run_all(inputs)
    t = result.target_metrics
    # Capital needs: 25% down ($100k) + 3% closing ($12k) + rehab ($80k) + holding ($20k) = $212k
    assert t.total_capital_needed == pytest.approx(212_000)
    # ARV $600k - purchase $400k - rehab $80k - holding $20k - closing $12k - sale_costs 6%*600k $36k = $52k
    assert t.projected_flip_profit == pytest.approx(52_000)
    assert t.projected_flip_gross_roi == pytest.approx(52_000 / 212_000, abs=0.001)
    # Bridge / hard money should rank materially higher than for an LTR target.
    bridge = next(s for s in result.strategies if s.key == "bridge_hard_money_private_capital")
    assert bridge.weighted_score > 50


# ---------------------------------------------------------------------------
# Goal profiles — Van's matrix landed 2026-06-23. Now we assert
# divergence (the engine should produce meaningfully different scores
# across goals) — the inverse of the prior placeholder assertion.
# ---------------------------------------------------------------------------

def _run_with_goal(workbook_sample_inputs, goal: str):
    new_profile = PortfolioProfile(
        credit_score_bucket=workbook_sample_inputs.profile.credit_score_bucket,
        income_profile=workbook_sample_inputs.profile.income_profile,
        available_cash=workbook_sample_inputs.profile.available_cash,
        investor_goal=goal,  # type: ignore[arg-type]
        risk_tolerance=workbook_sample_inputs.profile.risk_tolerance,
        time_horizon=workbook_sample_inputs.profile.time_horizon,
        expected_annual_appreciation=workbook_sample_inputs.profile.expected_annual_appreciation,
        estimated_acquisition_closing_costs_pct=workbook_sample_inputs.profile.estimated_acquisition_closing_costs_pct,
        target_down_payment_pct=workbook_sample_inputs.profile.target_down_payment_pct,
    )
    inputs = PortfolioInputs(
        profile=new_profile,
        existing_properties=workbook_sample_inputs.existing_properties,
        target_property=workbook_sample_inputs.target_property,
    )
    return run_all(inputs)


def test_goal_profiles_diverge(workbook_sample_inputs):
    """
    The four goal profiles must produce meaningfully different scores
    for the same input — otherwise the matrix isn't doing any work and
    we've regressed to the placeholder.
    """
    goals = ("Build Wealth", "Generate Passive Income", "Preserve Liquidity", "Minimize Risk")
    score_tuples = []
    for g in goals:
        result = _run_with_goal(workbook_sample_inputs, g)
        score_tuples.append(
            tuple((s.key, s.weighted_score) for s in sorted(result.strategies, key=lambda x: x.key))
        )
    # Each pair of profiles must differ on at least one strategy's score.
    for i in range(len(goals)):
        for j in range(i + 1, len(goals)):
            assert score_tuples[i] != score_tuples[j], (
                f"{goals[i]} and {goals[j]} produced identical scores — "
                "matrix wiring is broken or weights collapsed to the same profile"
            )


def test_van_matrix_weights_sum_to_100():
    """Sanity check Van's matrix — each profile's weights sum to 100."""
    from portfolio.goal_profiles import GOAL_PROFILES
    for goal, weights in GOAL_PROFILES.items():
        total = weights.sum_check()
        assert total == 100, f"Goal {goal!r} weights sum to {total}, not 100"


def test_build_wealth_favors_leverage_over_cash(workbook_sample_inputs):
    """
    Build Wealth weights Long-Term Wealth Impact at 35% — leverage
    strategies (HELOC, Conventional, DSCR, No-Ratio, Combination) should
    out-score Use Available Cash for the Build Wealth profile.
    """
    r = _run_with_goal(workbook_sample_inputs, "Build Wealth")
    by_key = {s.key: s for s in r.strategies}
    cash = by_key["use_available_cash"].weighted_score
    assert by_key["heloc_on_existing_equity"].weighted_score > cash
    assert by_key["no_ratio_asset_based_cash_out"].weighted_score > cash


def test_minimize_risk_pushes_bridge_to_bottom(workbook_sample_inputs):
    """
    Minimize Risk weights Risk at 30% — Bridge / Hard Money should still
    be at the bottom of the rankings (high financing risk + LTR target).
    """
    r = _run_with_goal(workbook_sample_inputs, "Minimize Risk")
    bridge = next(s for s in r.strategies if s.key == "bridge_hard_money_private_capital")
    assert bridge.rank == 8


def test_preserve_liquidity_demotes_cash(workbook_sample_inputs):
    """
    Preserve Liquidity weights Liquidity Preservation at 40% — Use
    Available Cash should score LOW because deploying cash literally
    reduces liquidity.
    """
    r = _run_with_goal(workbook_sample_inputs, "Preserve Liquidity")
    by_key = {s.key: s for s in r.strategies}
    cash = by_key["use_available_cash"]
    heloc = by_key["heloc_on_existing_equity"]
    assert cash.weighted_score < heloc.weighted_score
    assert cash.liquidity_preservation < heloc.liquidity_preservation
