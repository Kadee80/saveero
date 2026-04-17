"""
tests/test_mortgage_analyzer.py

Unit tests for mortgage.analyzer.analyze_mortgage — the main
"analyze a loan" function the API returns.
"""
from __future__ import annotations

import pytest

from mortgage.analyzer import LoanInputs, analyze_mortgage
from mortgage.core import monthly_rate


# ---------------------------------------------------------------------------
# Golden scenario — a realistic input we can hand-check piece by piece.
# Purchase: $500,000, 20% down, 6.75% 30-year, 1.2% tax, $1800 ins, $0 HOA.
# Loan amount = $400,000  (LTV = 80%, exactly at PMI threshold → NO PMI)
# ---------------------------------------------------------------------------

def _golden_inputs() -> LoanInputs:
    return LoanInputs(
        purchase_price=500_000,
        down_payment=100_000,
        annual_rate_percent=6.75,
        term_years=30,
        annual_property_tax_percent=1.2,
        annual_insurance_dollars=1800,
        monthly_hoa=0,
    )


class TestAnalyzeMortgageGolden:
    def test_loan_amount(self):
        r = analyze_mortgage(_golden_inputs())
        assert r.loan_amount == 400_000

    def test_ltv_at_threshold_no_pmi(self):
        r = analyze_mortgage(_golden_inputs())
        assert r.ltv == pytest.approx(80.0)
        assert r.pmi_required is False
        assert r.monthly.pmi == 0.0

    def test_monthly_pi_matches_canonical(self):
        # $400,000 at 6.75% for 30 years → $2594.39/mo (widely published)
        r = analyze_mortgage(_golden_inputs())
        assert r.monthly_principal_interest == pytest.approx(2594.39, abs=0.01)

    def test_monthly_tax_is_annual_rate_over_12(self):
        r = analyze_mortgage(_golden_inputs())
        # 1.2% of $500,000 = $6000/year = $500/month
        assert r.monthly.property_tax == pytest.approx(500.0)

    def test_monthly_insurance_is_annual_over_12(self):
        r = analyze_mortgage(_golden_inputs())
        assert r.monthly.insurance == pytest.approx(150.0)

    def test_monthly_total_sums_components(self):
        r = analyze_mortgage(_golden_inputs())
        expected = (
            r.monthly_principal_interest
            + r.monthly.property_tax
            + r.monthly.insurance
            + r.monthly.pmi
            + r.monthly.hoa
        )
        assert r.monthly.total == pytest.approx(expected)

    def test_first_month_interest_correct(self):
        # Month 1 interest = loan_amount * monthly_rate
        inputs = _golden_inputs()
        r = analyze_mortgage(inputs)
        expected = inputs.purchase_price - inputs.down_payment
        expected_interest = expected * monthly_rate(inputs.annual_rate_percent)
        assert r.monthly.interest == pytest.approx(expected_interest, abs=0.001)

    def test_first_month_principal_is_pi_minus_interest(self):
        inputs = _golden_inputs()
        r = analyze_mortgage(inputs)
        assert r.monthly.principal == pytest.approx(
            r.monthly_principal_interest - r.monthly.interest, abs=0.001
        )

    def test_amortization_length(self):
        r = analyze_mortgage(_golden_inputs())
        assert len(r.amortization) == 360

    def test_total_interest_in_expected_range(self):
        # For $400k at 6.75% 30yr, total interest is around $534k.
        r = analyze_mortgage(_golden_inputs())
        assert 530_000 < r.total_interest_paid < 540_000


# ---------------------------------------------------------------------------
# PMI scenarios
# ---------------------------------------------------------------------------

class TestPmiScenarios:
    def test_pmi_triggered_above_80_ltv(self):
        # 10% down → 90% LTV → PMI required
        r = analyze_mortgage(LoanInputs(
            purchase_price=400_000, down_payment=40_000,
            annual_rate_percent=6.75, term_years=30,
        ))
        assert r.pmi_required is True
        assert r.monthly.pmi > 0

    def test_pmi_amount_is_half_percent_of_loan(self):
        # 10% down → loan = $360k → PMI = 0.5%/yr / 12 = $150/mo
        r = analyze_mortgage(LoanInputs(
            purchase_price=400_000, down_payment=40_000,
            annual_rate_percent=6.75, term_years=30,
        ))
        expected_pmi = 360_000 * 0.005 / 12
        assert r.monthly.pmi == pytest.approx(expected_pmi)

    def test_pmi_drop_off_month_is_positive(self):
        r = analyze_mortgage(LoanInputs(
            purchase_price=400_000, down_payment=40_000,
            annual_rate_percent=6.75, term_years=30,
        ))
        assert r.pmi_drop_off_month > 0
        assert r.pmi_drop_off_month < 360  # should drop off before term end

    def test_exactly_20_percent_down_no_pmi(self):
        # Exactly 20% down → LTV = 80% = threshold (NOT above) → no PMI.
        r = analyze_mortgage(LoanInputs(
            purchase_price=500_000, down_payment=100_000,
            annual_rate_percent=6.75, term_years=30,
        ))
        assert r.pmi_required is False
        assert r.pmi_drop_off_month == 0


# ---------------------------------------------------------------------------
# Edge case: all cash (no loan)
# ---------------------------------------------------------------------------

class TestAllCashEdgeCase:
    def test_full_down_payment_zero_loan(self):
        r = analyze_mortgage(LoanInputs(
            purchase_price=400_000, down_payment=400_000,
            annual_rate_percent=6.75, term_years=30,
        ))
        assert r.loan_amount == 0
        assert r.monthly_principal_interest == 0
        assert r.ltv == 0
        assert r.pmi_required is False


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------

class TestInputValidation:
    def test_zero_purchase_price_raises(self):
        with pytest.raises(ValueError):
            analyze_mortgage(LoanInputs(
                purchase_price=0, down_payment=0,
                annual_rate_percent=6.75, term_years=30,
            ))

    def test_down_payment_exceeds_price_raises(self):
        with pytest.raises(ValueError):
            analyze_mortgage(LoanInputs(
                purchase_price=300_000, down_payment=400_000,
                annual_rate_percent=6.75, term_years=30,
            ))

    def test_negative_rate_raises(self):
        with pytest.raises(ValueError):
            analyze_mortgage(LoanInputs(
                purchase_price=300_000, down_payment=60_000,
                annual_rate_percent=-1.0, term_years=30,
            ))

    def test_negative_down_payment_raises(self):
        with pytest.raises(ValueError):
            analyze_mortgage(LoanInputs(
                purchase_price=300_000, down_payment=-1,
                annual_rate_percent=6.75, term_years=30,
            ))
