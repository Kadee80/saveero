"""
tests/test_mortgage_affordability.py

Unit tests for mortgage.affordability.compute_affordability.
"""
from __future__ import annotations

import pytest

from mortgage.affordability import AffordabilityInputs, compute_affordability


def _typical() -> AffordabilityInputs:
    """A typical middle-class scenario."""
    return AffordabilityInputs(
        annual_income=120_000,
        monthly_debts=0,
        down_payment_cash=60_000,
        annual_rate_percent=6.75,
        term_years=30,
        annual_property_tax_percent=1.2,
        annual_insurance_dollars=1500,
        monthly_hoa=0,
        max_front_end_dti=0.35,
        max_back_end_dti=0.43,
    )


class TestAffordability:
    def test_zero_income_returns_zero_everything(self):
        r = compute_affordability(AffordabilityInputs(annual_income=0))
        assert r.max_purchase_price == 0
        assert r.max_loan_amount == 0
        assert r.binding_constraint == "income_zero"

    def test_positive_income_gives_positive_price(self):
        r = compute_affordability(_typical())
        assert r.max_purchase_price > 0
        assert r.max_loan_amount > 0

    def test_monthly_housing_cap_respects_front_end_dti(self):
        # $120k/yr at 35% → $3500/mo cap when no debts.
        r = compute_affordability(_typical())
        assert r.max_monthly_housing_payment == pytest.approx(3500.0)

    def test_debts_reduce_affordability(self):
        with_debt = compute_affordability(AffordabilityInputs(
            annual_income=120_000, monthly_debts=1500,
            down_payment_cash=60_000,
        ))
        without_debt = compute_affordability(AffordabilityInputs(
            annual_income=120_000, monthly_debts=0,
            down_payment_cash=60_000,
        ))
        assert with_debt.max_purchase_price < without_debt.max_purchase_price

    def test_back_end_becomes_binding_when_debts_high(self):
        # With $1500/mo in debts and $120k income:
        # back-end cap = 120000/12 * 0.43 - 1500 = 4300 - 1500 = 2800
        # front-end cap = 120000/12 * 0.35 = 3500
        # back-end is the binding constraint.
        r = compute_affordability(AffordabilityInputs(
            annual_income=120_000, monthly_debts=1500,
            down_payment_cash=60_000,
        ))
        assert r.binding_constraint == "back_end_dti"
        assert r.max_monthly_housing_payment == pytest.approx(2800.0)

    def test_front_end_binding_when_debts_low(self):
        r = compute_affordability(_typical())
        assert r.binding_constraint == "front_end_dti"

    def test_higher_down_payment_higher_price(self):
        low_down = compute_affordability(AffordabilityInputs(
            annual_income=120_000, down_payment_cash=20_000,
        ))
        high_down = compute_affordability(AffordabilityInputs(
            annual_income=120_000, down_payment_cash=100_000,
        ))
        # More cash → larger purchase price, even though the monthly cap is the same.
        assert high_down.max_purchase_price > low_down.max_purchase_price

    def test_higher_rate_lower_price(self):
        low_rate = compute_affordability(AffordabilityInputs(
            annual_income=120_000, annual_rate_percent=5.0,
            down_payment_cash=60_000,
        ))
        high_rate = compute_affordability(AffordabilityInputs(
            annual_income=120_000, annual_rate_percent=8.0,
            down_payment_cash=60_000,
        ))
        assert high_rate.max_purchase_price < low_rate.max_purchase_price

    def test_pmi_flag_set_when_ltv_over_80(self):
        # Small down payment → high LTV → PMI required.
        r = compute_affordability(AffordabilityInputs(
            annual_income=120_000, down_payment_cash=5_000,
        ))
        assert r.pmi_required is True

    def test_no_pmi_when_20pct_down(self):
        # Solve: find an income where 20% down works out cleanly.
        # Use high income + high down payment cash so LTV stays at/below 80%.
        r = compute_affordability(AffordabilityInputs(
            annual_income=200_000,
            down_payment_cash=200_000,  # very large cash position
            annual_rate_percent=6.75,
        ))
        # At this income, loan will cap at whatever DTI allows;
        # with a huge down payment, LTV should easily be under 80%.
        assert r.pmi_required is False

    def test_monthly_total_within_cap(self):
        r = compute_affordability(_typical())
        # Computed monthly housing total should be <= the cap (give a small tolerance
        # for the iterative solve).
        assert r.estimated_monthly_total <= r.max_monthly_housing_payment + 1.0

    def test_dti_ratios_consistent(self):
        r = compute_affordability(_typical())
        # Front-end DTI at the reported price should be close to the configured cap.
        assert r.front_end_dti == pytest.approx(0.35, abs=0.02)
