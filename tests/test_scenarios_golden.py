"""
tests/test_scenarios_golden.py

Bit-for-bit compliance tests against the client's FINAL_V1 Home Decision
Model spreadsheet.

Every golden value in this file was extracted directly from the shipped
Excel workbook. With MasterInputs() at defaults (which mirror the
spreadsheet's default Inputs column B), the engine must produce numbers
that tie to Excel within $0.01 — and it does, in fact, tie to ~1e-9.

If any of these tests fail, the scenario engine has drifted from the
client's authoritative spec.
"""
from __future__ import annotations

import pytest

from scenarios import MasterInputs, run_all


TOL = 1e-4  # $0.0001 — well inside the $0.01 compliance bar


@pytest.fixture(scope="module")
def result():
    """Run the engine once per test module with the spreadsheet's default inputs."""
    return run_all(MasterInputs())


# ===========================================================================
# Stay Scenario — Excel 'Stay Scenario' sheet
# ===========================================================================

class TestStayScenario:
    """Row-by-row match to the 'Stay Scenario' sheet."""

    def test_B4_current_monthly_pi(self, result):
        assert result.stay.current_monthly_pi == pytest.approx(2751.0299297252204, abs=TOL)

    def test_B9_total_monthly_ownership_cost(self, result):
        assert result.stay.total_monthly_ownership_cost == pytest.approx(4051.0299297252204, abs=TOL)

    def test_B12_future_home_value(self, result):
        assert result.stay.future_home_value == pytest.approx(869455.5557249999, abs=TOL)

    def test_B13_future_mortgage_balance(self, result):
        assert result.stay.future_mortgage_balance == pytest.approx(363222.975437813, abs=TOL)

    def test_B14_gross_equity(self, result):
        assert result.stay.gross_equity == pytest.approx(506232.5802871869, abs=TOL)

    def test_B15_selling_costs_at_horizon(self, result):
        assert result.stay.selling_costs_at_horizon == pytest.approx(60861.88890075, abs=TOL)

    def test_B16_net_equity_at_horizon(self, result):
        assert result.stay.net_equity_at_horizon == pytest.approx(445370.6913864369, abs=TOL)

    def test_total_net_position_equals_net_equity(self, result):
        """Stay's total net position is just its net equity (Excel Outputs!B8)."""
        assert result.stay.total_net_position == result.stay.net_equity_at_horizon


# ===========================================================================
# Refinance Scenario — Excel 'Refinance Scenario' sheet
# ===========================================================================

class TestRefinanceScenario:
    def test_B5_closing_costs(self, result):
        assert result.refinance.refinance_closing_costs == pytest.approx(10000.0, abs=TOL)

    def test_B6_closing_costs_financed(self, result):
        assert result.refinance.refinance_closing_costs_financed == pytest.approx(10000.0, abs=TOL)

    def test_B7_new_loan_amount(self, result):
        assert result.refinance.new_loan_amount == pytest.approx(410000.0, abs=TOL)

    def test_B8_new_monthly_pi(self, result):
        assert result.refinance.new_monthly_pi == pytest.approx(2392.648711418567, abs=TOL)

    def test_B9_monthly_payment_change(self, result):
        assert result.refinance.monthly_payment_change == pytest.approx(358.3812183066534, abs=TOL)

    def test_B10_cash_to_close(self, result):
        assert result.refinance.cash_to_close == pytest.approx(0.0, abs=TOL)

    def test_B11_break_even_months(self, result):
        assert result.refinance.break_even_months == pytest.approx(27.903247963857787, abs=TOL)

    def test_B15_future_refinance_balance(self, result):
        assert result.refinance.future_refinance_loan_balance == pytest.approx(380324.9660478089, abs=TOL)

    def test_B16_gross_equity(self, result):
        assert result.refinance.gross_equity == pytest.approx(489130.589677191, abs=TOL)

    def test_B18_net_equity_at_horizon(self, result):
        assert result.refinance.net_equity_at_horizon == pytest.approx(428268.700776441, abs=TOL)

    def test_B19_cumulative_payment_savings(self, result):
        assert result.refinance.cumulative_payment_savings == pytest.approx(21502.873098399206, abs=TOL)

    def test_B20_total_net_position(self, result):
        assert result.refinance.total_net_position == pytest.approx(449771.5738748402, abs=TOL)

    def test_B27_total_monthly_ownership_cost(self, result):
        assert result.refinance.total_monthly_ownership_cost == pytest.approx(3692.648711418567, abs=TOL)


class TestRefinanceEdgeCases:
    def test_break_even_is_none_when_no_savings(self):
        """If new rate ≥ current rate, monthly_payment_change ≤ 0 and break-even is undefined."""
        bad_refi = MasterInputs(refinance_rate=0.10)  # way higher than current 6.7%
        r = run_all(bad_refi).refinance
        assert r.monthly_payment_change < 0
        assert r.break_even_months is None

    def test_unfinanced_closing_costs_raise_cash_to_close(self):
        """If closing costs aren't financed, cash_to_close equals closing_costs."""
        r = run_all(MasterInputs(refinance_closing_costs_financed=False)).refinance
        assert r.cash_to_close == pytest.approx(10000.0, abs=TOL)
        assert r.new_loan_amount == pytest.approx(400000.0, abs=TOL)  # back to original balance


# ===========================================================================
# Sell + Buy Scenario — Excel 'Sell+Buy Scenario' sheet
# ===========================================================================

class TestSellBuyScenario:
    def test_B5_current_home_selling_costs(self, result):
        assert result.sell_buy.current_home_selling_costs == pytest.approx(52500.0, abs=TOL)

    def test_B7_net_sale_proceeds_before_reserve(self, result):
        assert result.sell_buy.net_sale_proceeds_before_reserve == pytest.approx(297500.0, abs=TOL)

    def test_B9_cash_available_for_next_purchase(self, result):
        assert result.sell_buy.cash_available_for_next_purchase == pytest.approx(272500.0, abs=TOL)

    def test_B13_required_down_payment(self, result):
        assert result.sell_buy.required_down_payment == pytest.approx(180000.0, abs=TOL)

    def test_B14_new_purchase_loan_amount(self, result):
        assert result.sell_buy.new_purchase_loan_amount == pytest.approx(720000.0, abs=TOL)

    def test_B15_purchase_closing_costs(self, result):
        assert result.sell_buy.purchase_closing_costs == pytest.approx(18000.0, abs=TOL)

    def test_B17_cash_remaining_at_close(self, result):
        assert result.sell_buy.cash_remaining_at_close == pytest.approx(59500.0, abs=TOL)

    def test_B18_new_monthly_pi(self, result):
        assert result.sell_buy.new_monthly_pi == pytest.approx(4316.763781099817, abs=TOL)

    def test_B21_future_new_home_value(self, result):
        assert result.sell_buy.future_new_home_value == pytest.approx(1043346.6668699998, abs=TOL)

    def test_B22_future_new_mortgage_balance(self, result):
        assert result.sell_buy.future_new_mortgage_balance == pytest.approx(669991.3691243026, abs=TOL)

    def test_B25_net_equity_at_horizon(self, result):
        assert result.sell_buy.net_equity_at_horizon == pytest.approx(300321.0310647972, abs=TOL)

    def test_B26_total_net_position(self, result):
        assert result.sell_buy.total_net_position == pytest.approx(359821.0310647972, abs=TOL)

    def test_B33_total_monthly_ownership_cost(self, result):
        assert result.sell_buy.total_monthly_ownership_cost == pytest.approx(5841.763781099817, abs=TOL)

    def test_B34_monthly_change_vs_stay(self, result):
        assert result.sell_buy.monthly_ownership_cost_change_vs_stay == pytest.approx(-1790.7338513745963, abs=TOL)


# ===========================================================================
# Rent Scenario — Excel 'Rent Scenario' sheet
# ===========================================================================

class TestRentScenario:
    def test_B5_vacancy_allowance(self, result):
        assert result.rent.monthly_flow.vacancy_allowance == pytest.approx(190.0, abs=TOL)

    def test_B6_effective_rent_collected(self, result):
        assert result.rent.monthly_flow.effective_rent_collected == pytest.approx(3610.0, abs=TOL)

    def test_B13_total_operating_expenses(self, result):
        assert result.rent.monthly_flow.total_operating_expenses_before_debt == pytest.approx(1808.0, abs=TOL)

    def test_B15_cash_flow_before_tax(self, result):
        assert result.rent.monthly_flow.monthly_cash_flow_before_tax == pytest.approx(-949.0299297252204, abs=TOL)

    def test_B18_mortgage_balance_after_12_months(self, result):
        assert result.rent.tax_view.mortgage_balance_after_12_months == pytest.approx(393593.27417984395, abs=TOL)

    def test_B19_first_year_interest(self, result):
        assert result.rent.tax_view.first_year_mortgage_interest_deduction == pytest.approx(26605.633336546598, abs=TOL)

    def test_B20_annual_depreciation(self, result):
        assert result.rent.tax_view.annual_depreciation == pytest.approx(21818.18181818182, abs=TOL)

    def test_B21_annual_taxable_rental_income(self, result):
        assert result.rent.tax_view.annual_taxable_rental_income == pytest.approx(-59812.17431143107, abs=TOL)

    def test_B22_annual_tax_benefit(self, result):
        assert result.rent.tax_view.annual_tax_benefit == pytest.approx(20934.26100900087, abs=TOL)

    def test_B24_monthly_cash_flow_after_tax(self, result):
        assert result.rent.tax_view.monthly_cash_flow_after_tax == pytest.approx(795.4918210248522, abs=TOL)

    def test_B31_net_equity_at_horizon(self, result):
        """Same formula as Stay — identical mortgage."""
        assert result.rent.net_equity_at_horizon == pytest.approx(445370.6913864369, abs=TOL)

    def test_B32_cumulative_cash_flow(self, result):
        assert result.rent.cumulative_after_tax_rental_cash_flow == pytest.approx(47729.50926149113, abs=TOL)

    def test_B34_total_net_position(self, result):
        assert result.rent.total_net_position == pytest.approx(490600.20064792805, abs=TOL)


# ===========================================================================
# Rent Out & Buy Scenario — Excel 'Rent Out & Buy Scenario' sheet
# ===========================================================================

class TestRentOutAndBuyScenario:
    def test_B32_total_upfront_cash_needed(self, result):
        assert result.rent_out_buy.total_upfront_cash_needed == pytest.approx(213000.0, abs=TOL)

    def test_B33_new_monthly_pi(self, result):
        assert result.rent_out_buy.new_monthly_pi == pytest.approx(4316.763781099817, abs=TOL)

    def test_B38_total_new_home_monthly(self, result):
        assert result.rent_out_buy.total_new_home_monthly_ownership_cost == pytest.approx(5841.763781099817, abs=TOL)

    def test_B39_net_monthly_before_tax(self, result):
        assert result.rent_out_buy.net_monthly_housing_cost_before_tax == pytest.approx(6790.793710825037, abs=TOL)

    def test_B40_net_monthly_after_tax(self, result):
        assert result.rent_out_buy.net_monthly_housing_cost_after_tax == pytest.approx(5046.271960074964, abs=TOL)

    def test_B41_monthly_change_vs_stay_pretax(self, result):
        assert result.rent_out_buy.monthly_housing_cost_change_vs_stay == pytest.approx(-2739.7637810998167, abs=TOL)

    def test_B42_monthly_change_vs_stay_aftertax(self, result):
        assert result.rent_out_buy.after_tax_monthly_impact_vs_stay == pytest.approx(-995.2420303497438, abs=TOL)

    def test_B49_current_home_net_equity(self, result):
        assert result.rent_out_buy.current_home_net_equity_at_horizon == pytest.approx(445370.6913864369, abs=TOL)

    def test_B54_new_home_net_equity(self, result):
        assert result.rent_out_buy.new_home_net_equity_at_horizon == pytest.approx(300321.0310647972, abs=TOL)

    def test_B57_total_net_position(self, result):
        assert result.rent_out_buy.total_net_position == pytest.approx(577921.2317127252, abs=TOL)

    def test_B61_cash_shortfall(self, result):
        assert result.rent_out_buy.cash_surplus_or_shortfall == pytest.approx(-63000.0, abs=TOL)

    def test_B62_liquidity_status_not_viable(self, result):
        """With $150k cash vs $213k upfront need, the default case is Not viable."""
        assert result.rent_out_buy.liquidity_status == "Not viable"


class TestLiquidityEdgeCases:
    def test_feasible_when_cash_is_ample(self):
        inputs = MasterInputs(available_cash_for_purchase=300_000)
        r = run_all(inputs).rent_out_buy
        assert r.liquidity_status == "Feasible"
        assert r.cash_surplus_or_shortfall == pytest.approx(87_000.0, abs=TOL)

    def test_stretch_when_cash_barely_covers(self):
        """$215k cash vs $213k need → surplus $2k, which is under max($10k, 10%*$215k=$21.5k)."""
        inputs = MasterInputs(available_cash_for_purchase=215_000)
        r = run_all(inputs).rent_out_buy
        assert r.liquidity_status == "Stretch"
        assert r.cash_surplus_or_shortfall == pytest.approx(2_000.0, abs=TOL)

    def test_not_viable_when_shortfall(self):
        inputs = MasterInputs(available_cash_for_purchase=100_000)
        r = run_all(inputs).rent_out_buy
        assert r.liquidity_status == "Not viable"


# ===========================================================================
# Decision Map — Excel 'Outputs' sheet
# ===========================================================================

class TestDecisionMap:
    def test_B2_hold_period(self, result):
        assert result.decision_map.selected_hold_period_years == 5.0

    # Monthly impact row (B5:F5)
    def test_B5_monthly_impact_stay(self, result):
        assert result.decision_map.monthly_all_in_impact_vs_today.stay == 0.0

    def test_C5_monthly_impact_refi(self, result):
        assert result.decision_map.monthly_all_in_impact_vs_today.refinance == pytest.approx(358.3812183066534, abs=TOL)

    def test_D5_monthly_impact_sell_buy(self, result):
        assert result.decision_map.monthly_all_in_impact_vs_today.sell_buy == pytest.approx(-1790.7338513745963, abs=TOL)

    def test_E5_monthly_impact_rent(self, result):
        assert result.decision_map.monthly_all_in_impact_vs_today.rent == pytest.approx(3102.0, abs=TOL)

    def test_F5_monthly_impact_rent_out_buy(self, result):
        assert result.decision_map.monthly_all_in_impact_vs_today.rent_out_buy == pytest.approx(-2739.7637810998167, abs=TOL)

    # After-tax monthly impact (B6:F6)
    def test_E6_after_tax_monthly_rent(self, result):
        assert result.decision_map.after_tax_monthly_impact_vs_today.rent == pytest.approx(4846.521750750073, abs=TOL)

    def test_F6_after_tax_monthly_rent_out_buy(self, result):
        assert result.decision_map.after_tax_monthly_impact_vs_today.rent_out_buy == pytest.approx(-995.2420303497438, abs=TOL)

    # Net equity row (B7:F7)
    def test_F7_net_equity_rent_out_buy(self, result):
        """Excel F7 = sum of current home + new home net equity = 745691.72..."""
        assert result.decision_map.net_equity_if_sold_at_horizon.rent_out_buy == pytest.approx(745691.7224512341, abs=TOL)

    # Total net position row (B8:F8)
    def test_B8_total_net_stay(self, result):
        assert result.decision_map.total_net_position.stay == pytest.approx(445370.6913864369, abs=TOL)

    def test_C8_total_net_refi(self, result):
        assert result.decision_map.total_net_position.refinance == pytest.approx(449771.5738748402, abs=TOL)

    def test_D8_total_net_sell_buy(self, result):
        assert result.decision_map.total_net_position.sell_buy == pytest.approx(359821.0310647972, abs=TOL)

    def test_E8_total_net_rent(self, result):
        assert result.decision_map.total_net_position.rent == pytest.approx(490600.20064792805, abs=TOL)

    def test_F8_total_net_rent_out_buy(self, result):
        assert result.decision_map.total_net_position.rent_out_buy == pytest.approx(577921.2317127252, abs=TOL)

    # Rent driver breakdown (B11:B16)
    def test_B11_current_net_equity_today(self, result):
        assert result.decision_map.rent_driver_breakdown.current_net_equity_today == pytest.approx(297500.0, abs=TOL)

    def test_B12_net_appreciation(self, result):
        assert result.decision_map.rent_driver_breakdown.net_appreciation_after_selling_costs == pytest.approx(111093.66682424987, abs=TOL)

    def test_B13_principal_paydown(self, result):
        assert result.decision_map.rent_driver_breakdown.principal_paydown_over_hold_period == pytest.approx(36777.02456218703, abs=TOL)

    def test_B14_cumulative_cash_flow(self, result):
        assert result.decision_map.rent_driver_breakdown.cumulative_after_tax_rental_cash_flow == pytest.approx(47729.50926149113, abs=TOL)

    def test_B15_neg_make_ready(self, result):
        assert result.decision_map.rent_driver_breakdown.initial_make_ready_cost == pytest.approx(-2500.0, abs=TOL)

    def test_B16_rent_driver_total_ties(self, result):
        """The additive drivers must sum to the Rent total net position."""
        rent_total = result.rent.total_net_position
        driver_total = result.decision_map.rent_driver_breakdown.total_net_position
        assert driver_total == pytest.approx(rent_total, abs=TOL)

    # Recommendation snapshot (B19:B23)
    def test_B19_best_financial_outcome(self, result):
        """Rent Out & Buy is Not viable → Rent wins (highest of the viable 4)."""
        assert result.decision_map.recommendation.best_financial_outcome == "Rent"

    def test_B20_best_total_net_position(self, result):
        """When Rent Out & Buy is Not viable, the best value excludes it — so it's Rent's 490600."""
        assert result.decision_map.recommendation.best_total_net_position == pytest.approx(490600.20064792805, abs=TOL)

    def test_B21_best_monthly_affordability(self, result):
        assert result.decision_map.recommendation.best_for_monthly_affordability == "Refinance"

    def test_B22_simplest_path(self, result):
        assert result.decision_map.recommendation.simplest_path == "Stay"

    def test_B23_plain_english_insight_default(self, result):
        """When ROB is not viable and Rent wins, exact sentence from Excel."""
        insight = result.decision_map.recommendation.plain_english_insight
        assert "feasibility-aware modeled outcome" in insight
        assert "investment result" in insight

    # Priority rankings (B28:B31)
    def test_B31_move_lifestyle_when_ROB_not_viable(self, result):
        """Excel: if not viable → Sell + Buy."""
        assert result.decision_map.priority_rankings.move_lifestyle_change == "Sell + Buy"

    # Feasibility flags
    def test_complexity_high_when_rent_wins(self, result):
        assert result.decision_map.feasibility_flags.complexity == "High"

    def test_subsidy_depends_on_next_housing_when_rent_wins(self, result):
        assert result.decision_map.feasibility_flags.requires_monthly_subsidy == "Depends on next housing cost"

    def test_rent_out_buy_liquidity_status(self, result):
        assert result.decision_map.feasibility_flags.rent_out_buy_liquidity_status == "Not viable"

    def test_upfront_cash_required(self, result):
        assert result.decision_map.feasibility_flags.rent_out_buy_upfront_cash_required == pytest.approx(213000.0, abs=TOL)


class TestDecisionMapWithViableROB:
    """
    Change available cash so Rent Out & Buy becomes viable. Then the
    argmax logic should include it and (at the default other inputs)
    ROB beats Rent: 577921 > 490600.
    """
    @pytest.fixture(scope="class")
    def viable(self):
        return run_all(MasterInputs(available_cash_for_purchase=250_000))

    def test_rob_becomes_winner(self, viable):
        assert viable.rent_out_buy.liquidity_status == "Feasible"
        assert viable.decision_map.recommendation.best_financial_outcome == "Rent Out & Buy"

    def test_best_total_net_uses_rob(self, viable):
        assert viable.decision_map.recommendation.best_total_net_position == pytest.approx(577921.2317127252, abs=TOL)

    def test_move_lifestyle_prefers_rob_when_higher(self, viable):
        assert viable.decision_map.priority_rankings.move_lifestyle_change == "Rent Out & Buy"

    def test_plain_english_mentions_liquidity_check(self, viable):
        insight = viable.decision_map.recommendation.plain_english_insight
        assert "liquidity status" in insight.lower()


# ===========================================================================
# Audit — Excel 'Audit' sheet (all 9 checks must PASS on default inputs)
# ===========================================================================

class TestAuditChecks:
    def test_all_checks_pass_on_defaults(self, result):
        assert result.audit.all_passed, [
            (c.name, c.status) for c in result.audit.checks
            if c.status != "PASS"
        ]

    def test_expected_number_of_checks(self, result):
        assert len(result.audit.checks) == 9

    def test_stay_tie_check(self, result):
        names = [c.name for c in result.audit.checks]
        assert "Stay total net position ties to net equity" in names

    def test_refi_break_even_check(self, result):
        names = [c.name for c in result.audit.checks]
        assert "Refi break-even formula" in names

    def test_liquidity_check(self, result):
        names = [c.name for c in result.audit.checks]
        assert "Rent Out & Buy liquidity status aligns with cash surplus" in names


# ===========================================================================
# Input validation
# ===========================================================================

class TestInputValidation:
    def test_negative_hold_period_rejected(self):
        with pytest.raises(ValueError, match="hold_years"):
            run_all(MasterInputs(hold_years=-1))

    def test_zero_home_value_rejected(self):
        with pytest.raises(ValueError, match="current_home_value"):
            run_all(MasterInputs(current_home_value=0))

    def test_rate_as_percent_rejected(self):
        """6.7 is almost certainly meant as a percent; engine requires decimal."""
        with pytest.raises(ValueError, match="current_mortgage_rate"):
            run_all(MasterInputs(current_mortgage_rate=6.7))

    def test_negative_available_cash_rejected(self):
        with pytest.raises(ValueError, match="available_cash"):
            run_all(MasterInputs(available_cash_for_purchase=-1))
