"""
tests/test_fthb_golden.py

Bit-for-bit compliance tests against the client's
`FTHB_decision map.xlsx` spreadsheet.

Every golden value in this file was extracted directly from the
shipped Excel workbook with `data_only=True` (i.e. they're the actual
recomputed cell values, not formula strings). With FTHBInputs() at
defaults — which mirror the spreadsheet's default Inputs column B —
the engine must produce numbers that tie to Excel within $0.01.

Compliance bar: same as the homeowner engine — pinned to $0.0001.
If anything in this file fails, the FTHB engine has drifted from
the client's authoritative spec.
"""
from __future__ import annotations

import pytest

from scenarios.fthb import FTHBInputs, run_all
from scenarios.fthb.audit import EQUALITY_TOL  # noqa: F401  (kept for symmetry)


TOL = 1e-4  # $0.0001 — well inside the $0.01 compliance bar


@pytest.fixture(scope="module")
def result():
    """Run the FTHB engine once per test module with default inputs."""
    return run_all(FTHBInputs())


@pytest.fixture(scope="module")
def inputs():
    return FTHBInputs()


# ===========================================================================
# Inputs sheet — derived field B34 (take-home monthly)
# ===========================================================================

class TestInputsDerived:
    def test_B34_monthly_take_home_income(self, inputs):
        # =B4/12*B32 = 185000/12*0.7
        assert inputs.monthly_take_home_income() == pytest.approx(
            10791.666666666666, abs=TOL
        )


# ===========================================================================
# Continue Renting — Excel 'Continue Renting' sheet
# ===========================================================================

class TestContinueRenting:
    def test_B7_cumulative_rent_paid(self, result):
        assert result.continue_renting.cumulative_rent_paid == pytest.approx(
            326735.11531988764, abs=TOL
        )

    def test_B8_future_value_of_available_cash(self, result):
        assert result.continue_renting.future_value_of_available_cash == pytest.approx(
            110688.6478882383, abs=TOL
        )

    def test_B9_total_net_position(self, result):
        assert result.continue_renting.total_net_position == pytest.approx(
            711966.1839701032, abs=TOL
        )

    def test_B10_monthly_housing_cost_today(self, result):
        assert result.continue_renting.monthly_housing_cost_today == pytest.approx(
            3500.0, abs=TOL
        )

    def test_B11_cash_required_now(self, result):
        assert result.continue_renting.cash_required_now == 0.0

    def test_B12_cash_remaining_now(self, result):
        assert result.continue_renting.cash_remaining_now == pytest.approx(
            90000.0, abs=TOL
        )

    def test_B13_feasibility_status(self, result):
        assert result.continue_renting.feasibility_status == "Feasible"

    def test_B14_risk_level(self, result):
        assert result.continue_renting.risk_level == "Low"

    def test_B17_residual_monthly_savings(self, result):
        assert result.continue_renting.residual_monthly_savings == pytest.approx(
            6441.666666666666, abs=TOL
        )

    def test_B18_projected_savings_accumulation(self, result):
        assert result.continue_renting.projected_savings_accumulation == pytest.approx(
            601277.5360818648, abs=TOL
        )


# ===========================================================================
# Buy Starter Home — Excel 'Buy Starter Home' sheet
# ===========================================================================

class TestBuyStarterHome:
    def test_B4_target_purchase_price(self, result):
        assert result.buy_starter.target_purchase_price == 550000.0

    def test_B5_universal_down_payment(self, result):
        assert result.buy_starter.universal_down_payment == 65000.0

    def test_B6_purchase_closing_costs(self, result):
        assert result.buy_starter.purchase_closing_costs == pytest.approx(16500.0, abs=TOL)

    def test_B7_assistance_benefit(self, result):
        assert result.buy_starter.assistance_benefit == 0.0

    def test_B8_total_cash_required_at_close(self, result):
        assert result.buy_starter.total_cash_required_at_close == pytest.approx(81500.0, abs=TOL)

    def test_B9_cash_remaining_after_close(self, result):
        assert result.buy_starter.cash_remaining_after_close == pytest.approx(8500.0, abs=TOL)

    def test_B10_new_loan_amount(self, result):
        assert result.buy_starter.new_loan_amount == pytest.approx(485000.0, abs=TOL)

    def test_B13_monthly_principal_and_interest(self, result):
        assert result.buy_starter.monthly_principal_and_interest == pytest.approx(
            2830.328353751232, abs=TOL
        )

    def test_B14_monthly_property_tax(self, result):
        assert result.buy_starter.monthly_property_tax == pytest.approx(
            458.3333333333333, abs=TOL
        )

    def test_B15_monthly_insurance(self, result):
        assert result.buy_starter.monthly_insurance == pytest.approx(
            114.58333333333333, abs=TOL
        )

    def test_B16_monthly_hoa(self, result):
        assert result.buy_starter.monthly_hoa == 75.0

    def test_B17_monthly_maintenance(self, result):
        assert result.buy_starter.monthly_maintenance == pytest.approx(
            458.3333333333333, abs=TOL
        )

    def test_B18_total_monthly_housing_payment(self, result):
        assert result.buy_starter.total_monthly_housing_payment == pytest.approx(
            3936.5783537512325, abs=TOL
        )

    def test_B19_dti(self, result):
        assert result.buy_starter.dti == pytest.approx(0.31048075808116105, abs=TOL)

    def test_B22_future_home_value(self, result):
        assert result.buy_starter.future_home_value == pytest.approx(
            676430.6259836785, abs=TOL
        )

    def test_B23_future_loan_balance(self, result):
        assert result.buy_starter.future_loan_balance == pytest.approx(
            432782.55938035215, abs=TOL
        )

    def test_B24_net_equity_at_horizon(self, result):
        assert result.buy_starter.net_equity_at_horizon == pytest.approx(
            243648.06660332636, abs=TOL
        )

    def test_B25_future_value_of_remaining_cash(self, result):
        assert result.buy_starter.future_value_of_remaining_cash == pytest.approx(
            10453.927856111395, abs=TOL
        )

    def test_B26_total_net_position(self, result):
        assert result.buy_starter.total_net_position == pytest.approx(
            814628.4686758096, abs=TOL
        )

    def test_B29_liquidity_cushion_threshold(self, result):
        # =MAX(B29_input=5000, B6_input * B28_input=10%) = max(5000, 9000) = 9000
        assert result.buy_starter.liquidity_cushion_threshold == pytest.approx(9000.0, abs=TOL)

    def test_B30_feasibility_status(self, result):
        assert result.buy_starter.feasibility_status == "Feasible"

    def test_B31_risk_level(self, result):
        # cash_remaining (8500) < cushion (9000) → "Thin Liquidity"
        assert result.buy_starter.risk_level == "Thin Liquidity"

    def test_B34_residual_monthly_savings(self, result):
        assert result.buy_starter.residual_monthly_savings == pytest.approx(
            6005.088312915434, abs=TOL
        )

    def test_B35_projected_savings_accumulation(self, result):
        assert result.buy_starter.projected_savings_accumulation == pytest.approx(
            560526.4742163718, abs=TOL
        )


# ===========================================================================
# Buy Preferred Home — Excel 'Buy Preferred Home' sheet
# ===========================================================================

class TestBuyPreferredHome:
    def test_B4_target_purchase_price(self, result):
        assert result.buy_preferred.target_purchase_price == 700000.0

    def test_B6_purchase_closing_costs(self, result):
        assert result.buy_preferred.purchase_closing_costs == pytest.approx(21000.0, abs=TOL)

    def test_B8_total_cash_required_at_close(self, result):
        assert result.buy_preferred.total_cash_required_at_close == pytest.approx(86000.0, abs=TOL)

    def test_B9_cash_remaining_after_close(self, result):
        assert result.buy_preferred.cash_remaining_after_close == pytest.approx(4000.0, abs=TOL)

    def test_B10_new_loan_amount(self, result):
        assert result.buy_preferred.new_loan_amount == pytest.approx(635000.0, abs=TOL)

    def test_B13_monthly_principal_and_interest(self, result):
        assert result.buy_preferred.monthly_principal_and_interest == pytest.approx(
            3705.687638416561, abs=TOL
        )

    def test_B14_monthly_property_tax(self, result):
        assert result.buy_preferred.monthly_property_tax == pytest.approx(
            583.3333333333334, abs=TOL
        )

    def test_B15_monthly_insurance(self, result):
        assert result.buy_preferred.monthly_insurance == pytest.approx(
            145.83333333333334, abs=TOL
        )

    def test_B17_monthly_maintenance(self, result):
        assert result.buy_preferred.monthly_maintenance == pytest.approx(
            583.3333333333334, abs=TOL
        )

    def test_B18_total_monthly_housing_payment(self, result):
        assert result.buy_preferred.total_monthly_housing_payment == pytest.approx(
            5093.187638416561, abs=TOL
        )

    def test_B19_dti(self, result):
        assert result.buy_preferred.dti == pytest.approx(0.38550406303242557, abs=TOL)

    def test_B22_future_home_value(self, result):
        assert result.buy_preferred.future_home_value == pytest.approx(
            860911.7057974089, abs=TOL
        )

    def test_B23_future_loan_balance(self, result):
        assert result.buy_preferred.future_loan_balance == pytest.approx(
            566632.8354773683, abs=TOL
        )

    def test_B24_net_equity_at_horizon(self, result):
        assert result.buy_preferred.net_equity_at_horizon == pytest.approx(
            294278.8703200406, abs=TOL
        )

    def test_B25_future_value_of_remaining_cash(self, result):
        assert result.buy_preferred.future_value_of_remaining_cash == pytest.approx(
            4919.49546169948, abs=TOL
        )

    def test_B26_total_net_position(self, result):
        assert result.buy_preferred.total_net_position == pytest.approx(
            751764.708423523, abs=TOL
        )

    def test_B30_feasibility_status(self, result):
        assert result.buy_preferred.feasibility_status == "Feasible"

    def test_B31_risk_level(self, result):
        # cash_remaining (4000) < cushion (9000) → "Thin Liquidity"
        assert result.buy_preferred.risk_level == "Thin Liquidity"

    def test_B34_residual_monthly_savings(self, result):
        assert result.buy_preferred.residual_monthly_savings == pytest.approx(
            4848.479028250105, abs=TOL
        )

    def test_B35_projected_savings_accumulation(self, result):
        assert result.buy_preferred.projected_savings_accumulation == pytest.approx(
            452566.3426417829, abs=TOL
        )


# ===========================================================================
# Buy with Assistance — Excel 'Buy with Assistance' sheet
# Note Excel row offsets: residual_savings is on B46 and savings_accumulation
# is on B47 here (vs B34/B35 on the other two buy sheets) because of the DPA
# caveats text rows in between.
# ===========================================================================

class TestBuyWithAssistance:
    def test_B4_target_purchase_price_uses_starter(self, result):
        # Audit check #16: assistance always uses starter price
        assert result.buy_with_assistance.target_purchase_price == 550000.0

    def test_B7_assistance_benefit(self, result):
        assert result.buy_with_assistance.assistance_benefit == pytest.approx(15000.0, abs=TOL)

    def test_B8_total_cash_required_at_close(self, result):
        # 65000 down + 16500 closing - 15000 assistance = 66500
        assert result.buy_with_assistance.total_cash_required_at_close == pytest.approx(
            66500.0, abs=TOL
        )

    def test_B9_cash_remaining_after_close(self, result):
        assert result.buy_with_assistance.cash_remaining_after_close == pytest.approx(
            23500.0, abs=TOL
        )

    def test_B10_new_loan_amount(self, result):
        # Loan amount is unchanged from starter (DPA reduces cash, not principal)
        assert result.buy_with_assistance.new_loan_amount == pytest.approx(485000.0, abs=TOL)

    def test_B13_monthly_principal_and_interest_includes_50bps_premium(self, result):
        # Same loan as starter ($485k), but rate = 5.75% + 0.50% = 6.25%
        assert result.buy_with_assistance.monthly_principal_and_interest == pytest.approx(
            2986.2284220679994, abs=TOL
        )

    def test_B18_total_monthly_housing_payment(self, result):
        assert result.buy_with_assistance.total_monthly_housing_payment == pytest.approx(
            4092.478422068, abs=TOL
        )

    def test_B19_dti(self, result):
        assert result.buy_with_assistance.dti == pytest.approx(0.3205931949449513, abs=TOL)

    def test_B22_future_home_value(self, result):
        # Same starter price + appreciation
        assert result.buy_with_assistance.future_home_value == pytest.approx(
            676430.6259836785, abs=TOL
        )

    def test_B23_future_loan_balance_higher_than_starter(self, result):
        # Higher rate → slower paydown → larger remaining balance vs starter
        assert result.buy_with_assistance.future_loan_balance == pytest.approx(
            436662.91548414464, abs=TOL
        )

    def test_B24_net_equity_subtracts_dpa_principal(self, result):
        # =FHV - FV(loan) - DPA = 676430.626 - 436662.915 - 15000
        assert result.buy_with_assistance.net_equity_at_horizon == pytest.approx(
            224767.71049953386, abs=TOL
        )

    def test_B25_future_value_of_remaining_cash(self, result):
        # 23500 cash remaining grown at 3% over 7 years
        assert result.buy_with_assistance.future_value_of_remaining_cash == pytest.approx(
            28902.035837484444, abs=TOL
        )

    def test_B26_total_net_position(self, result):
        assert result.buy_with_assistance.total_net_position == pytest.approx(
            799644.2088143216, abs=TOL
        )

    def test_B30_feasibility_status(self, result):
        assert result.buy_with_assistance.feasibility_status == "Feasible"

    def test_B31_risk_level(self, result):
        # cash_remaining (23500) > cushion (9000) AND residual_savings >= 500
        # → falls through to the "Moderate" branch
        assert result.buy_with_assistance.risk_level == "Moderate"

    def test_B46_residual_monthly_savings(self, result):
        assert result.buy_with_assistance.residual_monthly_savings == pytest.approx(
            5849.188244598667, abs=TOL
        )

    def test_B47_projected_savings_accumulation(self, result):
        assert result.buy_with_assistance.projected_savings_accumulation == pytest.approx(
            545974.4624773032, abs=TOL
        )


# ===========================================================================
# Delay Purchase — Excel 'Delay Purchase' sheet
# ===========================================================================

class TestDelayPurchase:
    def test_B4_recommended_delay_months(self, result):
        assert result.delay_purchase.recommended_delay_months == 12

    def test_B5_projected_additional_savings(self, result):
        # 1500/mo * 12 = 18000
        assert result.delay_purchase.projected_additional_savings == pytest.approx(
            18000.0, abs=TOL
        )

    def test_B6_projected_available_cash_after_delay(self, result):
        assert result.delay_purchase.projected_available_cash_after_delay == pytest.approx(
            108000.0, abs=TOL
        )

    def test_B7_starter_cash_required_today(self, result):
        # = down + starter * close_pct = 65000 + 550000*0.03 = 81500
        assert result.delay_purchase.starter_cash_required_today == pytest.approx(
            81500.0, abs=TOL
        )

    def test_B8_projected_cash_surplus(self, result):
        assert result.delay_purchase.projected_cash_surplus_or_shortfall == pytest.approx(
            26500.0, abs=TOL
        )

    def test_B9_expected_future_feasibility(self, result):
        assert result.delay_purchase.expected_future_feasibility == "Feasible"

    def test_B10_risk_level(self, result):
        assert result.delay_purchase.risk_level == "Low"

    def test_B11_total_net_position(self, result):
        assert result.delay_purchase.total_net_position == pytest.approx(
            636428.199368656, abs=TOL
        )

    def test_B14_residual_monthly_savings_while_renting(self, result):
        assert result.delay_purchase.residual_monthly_savings_while_renting == pytest.approx(
            6441.666666666666, abs=TOL
        )

    def test_B15_projected_remaining_period_savings(self, result):
        assert result.delay_purchase.projected_remaining_period_savings == pytest.approx(
            507470.551343524, abs=TOL
        )


# ===========================================================================
# Decision Map — Outputs sheet
# ===========================================================================

class TestDecisionMapComparison:
    """Outputs sheet rows 5-9 — one row per scenario, ten cols of metrics."""

    def test_row_count(self, result):
        assert len(result.decision_map.comparison) == 5

    def test_row_continue_renting(self, result):
        row = result.decision_map.comparison[0]
        assert row.scenario == "Continue Renting"
        assert row.net_position == pytest.approx(711966.1839701032, abs=TOL)
        assert row.monthly_cost == pytest.approx(3500.0, abs=TOL)
        assert row.residual_monthly_savings == pytest.approx(6441.666666666666, abs=TOL)
        assert row.savings_accumulation == pytest.approx(601277.5360818648, abs=TOL)
        assert row.cash_required == 0.0
        assert row.cash_remaining == pytest.approx(90000.0, abs=TOL)
        assert row.dti is None        # Excel writes "N/A"
        assert row.equity_at_horizon == 0.0
        assert row.feasibility == "Feasible"
        assert row.risk == "Low"

    def test_row_buy_starter_home(self, result):
        row = result.decision_map.comparison[1]
        assert row.scenario == "Buy Starter Home"
        assert row.net_position == pytest.approx(814628.4686758096, abs=TOL)
        assert row.monthly_cost == pytest.approx(3936.5783537512325, abs=TOL)
        assert row.residual_monthly_savings == pytest.approx(6005.088312915434, abs=TOL)
        assert row.savings_accumulation == pytest.approx(560526.4742163718, abs=TOL)
        assert row.cash_required == pytest.approx(81500.0, abs=TOL)
        assert row.cash_remaining == pytest.approx(8500.0, abs=TOL)
        assert row.dti == pytest.approx(0.31048075808116105, abs=TOL)
        assert row.equity_at_horizon == pytest.approx(243648.06660332636, abs=TOL)
        assert row.feasibility == "Feasible"
        assert row.risk == "Thin Liquidity"

    def test_row_buy_preferred_home(self, result):
        row = result.decision_map.comparison[2]
        assert row.scenario == "Buy Preferred Home"
        assert row.net_position == pytest.approx(751764.708423523, abs=TOL)
        assert row.monthly_cost == pytest.approx(5093.187638416561, abs=TOL)
        assert row.residual_monthly_savings == pytest.approx(4848.479028250105, abs=TOL)
        assert row.savings_accumulation == pytest.approx(452566.3426417829, abs=TOL)
        assert row.cash_required == pytest.approx(86000.0, abs=TOL)
        assert row.cash_remaining == pytest.approx(4000.0, abs=TOL)
        assert row.dti == pytest.approx(0.38550406303242557, abs=TOL)
        assert row.equity_at_horizon == pytest.approx(294278.8703200406, abs=TOL)
        assert row.feasibility == "Feasible"
        assert row.risk == "Thin Liquidity"

    def test_row_buy_with_assistance(self, result):
        row = result.decision_map.comparison[3]
        assert row.scenario == "Buy with Assistance"
        assert row.net_position == pytest.approx(799644.2088143216, abs=TOL)
        assert row.monthly_cost == pytest.approx(4092.478422068, abs=TOL)
        assert row.residual_monthly_savings == pytest.approx(5849.188244598667, abs=TOL)
        assert row.savings_accumulation == pytest.approx(545974.4624773032, abs=TOL)
        assert row.cash_required == pytest.approx(66500.0, abs=TOL)
        assert row.cash_remaining == pytest.approx(23500.0, abs=TOL)
        assert row.dti == pytest.approx(0.3205931949449513, abs=TOL)
        assert row.equity_at_horizon == pytest.approx(224767.71049953386, abs=TOL)
        assert row.feasibility == "Feasible"
        assert row.risk == "Moderate"

    def test_row_delay_purchase(self, result):
        row = result.decision_map.comparison[4]
        assert row.scenario == "Delay Purchase"
        assert row.net_position == pytest.approx(636428.199368656, abs=TOL)
        assert row.monthly_cost is None        # Excel writes "N/A"
        assert row.residual_monthly_savings == pytest.approx(6441.666666666666, abs=TOL)
        assert row.savings_accumulation == pytest.approx(507470.551343524, abs=TOL)
        assert row.cash_required == 0.0        # Excel hardcodes 0
        assert row.cash_remaining == pytest.approx(108000.0, abs=TOL)
        assert row.dti is None
        assert row.equity_at_horizon == 0.0
        assert row.feasibility == "Feasible"
        assert row.risk == "Low"


class TestDecisionMapRecommendation:
    """Outputs sheet B13-B18 — Recommendation Snapshot."""

    def test_B13_best_executable_path(self, result):
        # Mirrors Excel result via the *intended* logic (MAXIFS over feasible
        # scenarios), not the broken IF-chain that accidentally lands here.
        assert result.decision_map.recommendation.best_executable_path == "Buy Starter Home"

    def test_B14_best_net_position(self, result):
        assert result.decision_map.recommendation.best_net_position == pytest.approx(
            814628.4686758096, abs=TOL
        )

    def test_B15_best_monthly_affordability(self, result):
        assert result.decision_map.recommendation.best_monthly_affordability == "Continue Renting"

    def test_B16_best_savings_capacity(self, result):
        assert result.decision_map.recommendation.best_savings_capacity == "Continue Renting"

    def test_B17_lowest_cash_required(self, result):
        assert result.decision_map.recommendation.lowest_cash_required == "Continue Renting"

    def test_B18_actionable_insight_text(self, result):
        assert result.decision_map.recommendation.actionable_insight == (
            "Starter home is the best executable ownership path after "
            "accounting for equity, remaining cash, and future savings capacity."
        )


# ===========================================================================
# Audit — Excel 'Audit' sheet
# ===========================================================================

class TestAudit:
    """Mirror of the 13 audit checks. 12 PASS, 1 CHECK."""

    def test_check_count(self, result):
        assert len(result.audit.checks) == 13

    @pytest.mark.parametrize(
        "idx,expected_name,expected_status",
        [
            (0,  "Required inputs populated",                              "PASS"),
            (1,  "Universal down payment does not exceed available cash",  "PASS"),
            (2,  "Starter formulas generated",                             "PASS"),
            (3,  "Preferred formulas generated",                           "PASS"),
            (4,  "Assistance formulas generated",                          "PASS"),
            (5,  "Decision recommendation generated",                      "PASS"),
            (6,  "Binary feasibility statuses only",                       "PASS"),
            (7,  "DPA repayment reflected in equity",                      "PASS"),
            (8,  "Starter net position includes savings accumulation",     "PASS"),
            (9,  "Preferred net position includes savings accumulation",   "PASS"),
            (10, "Assistance net position includes savings accumulation",  "PASS"),
            (11, "Output recommendation uses savings-adjusted scores",     "CHECK"),
            (12, "Assistance scenario uses starter home price",            "PASS"),
        ],
    )
    def test_audit_check(self, result, idx, expected_name, expected_status):
        c = result.audit.checks[idx]
        assert c.name == expected_name
        assert c.status == expected_status

    def test_overall_all_passed_is_false(self, result):
        # The known CHECK on the savings-adjusted score keeps the report
        # from being all-pass — same as the spreadsheet.
        assert result.audit.all_passed is False


# ===========================================================================
# Cross-sheet consistency — these mirror the Outputs/Audit invariants and
# would also catch silent drift between the per-scenario results and the
# rolled-up totals.
# ===========================================================================

class TestCrossSheetInvariants:
    def test_outputs_B23_universal_down_payment_matches_inputs(self, inputs):
        assert inputs.universal_down_payment == 65000.0

    def test_outputs_B24_available_cash_matches_inputs(self, inputs):
        assert inputs.available_cash_for_purchase == 90000.0

    def test_outputs_B25_take_home_matches_derivation(self, inputs):
        assert inputs.monthly_take_home_income() == pytest.approx(
            10791.666666666666, abs=TOL
        )

    def test_outputs_B26_starter_residual_matches(self, result):
        assert result.buy_starter.residual_monthly_savings == pytest.approx(
            6005.088312915434, abs=TOL
        )

    def test_outputs_B27_preferred_residual_matches(self, result):
        assert result.buy_preferred.residual_monthly_savings == pytest.approx(
            4848.479028250105, abs=TOL
        )

    def test_outputs_B28_assistance_residual_matches(self, result):
        assert result.buy_with_assistance.residual_monthly_savings == pytest.approx(
            5849.188244598667, abs=TOL
        )

    def test_outputs_B29_post_close_threshold_matches(self, result):
        assert result.buy_starter.liquidity_cushion_threshold == pytest.approx(9000.0, abs=TOL)


# ===========================================================================
# Edge cases — make sure the engine doesn't blow up at the boundaries.
# These are NOT pinned to the Excel (they're outside the default scenario);
# they're just sanity checks.
# ===========================================================================

class TestEdgeCases:
    def test_zero_rate_savings_path(self):
        """When return_on_unspent_cash == 0, FV-of-annuity collapses to deposit*N."""
        i = FTHBInputs(return_on_unspent_cash=0.0)
        r = run_all(i)
        # Continue Renting savings = residual * horizon_years * 12
        expected = r.continue_renting.residual_monthly_savings * i.horizon_years * 12
        assert r.continue_renting.projected_savings_accumulation == pytest.approx(
            expected, abs=TOL
        )

    def test_zero_rent_inflation_cumulative(self):
        """When rent_inflation == 0, cumulative_rent = monthly_rent * 12 * years."""
        i = FTHBInputs(annual_rent_inflation=0.0)
        r = run_all(i)
        expected = i.current_monthly_rent * 12 * i.horizon_years
        assert r.continue_renting.cumulative_rent_paid == pytest.approx(expected, abs=TOL)

    def test_dpa_principal_subtracted_from_assistance_equity(self):
        """Audit check #11 explicit: equity = FHV - FV(loan) - DPA."""
        i = FTHBInputs()
        r = run_all(i)
        a = r.buy_with_assistance
        expected = a.future_home_value - a.future_loan_balance - i.available_dpa
        assert a.net_equity_at_horizon == pytest.approx(expected, abs=TOL)

    def test_assistance_uses_starter_price_not_preferred(self):
        """Audit check #16: target price for Assistance == starter price."""
        i = FTHBInputs()
        r = run_all(i)
        assert r.buy_with_assistance.target_purchase_price == i.starter_home_price

    def test_buy_scenarios_total_includes_savings_accumulation(self):
        """Audit checks #12-14: total = equity + FV(cash) + savings accumulation."""
        r = run_all(FTHBInputs())
        for s in (r.buy_starter, r.buy_preferred, r.buy_with_assistance):
            expected = (
                s.net_equity_at_horizon
                + s.future_value_of_remaining_cash
                + s.projected_savings_accumulation
            )
            assert s.total_net_position == pytest.approx(expected, abs=TOL)

    def test_validate_rejects_negative_income(self):
        with pytest.raises(ValueError):
            FTHBInputs(annual_household_income=-1).validate()

    def test_validate_rejects_zero_horizon(self):
        with pytest.raises(ValueError):
            FTHBInputs(horizon_years=0).validate()

    def test_validate_rejects_rate_above_100pct(self):
        with pytest.raises(ValueError):
            FTHBInputs(mortgage_rate=1.5).validate()
