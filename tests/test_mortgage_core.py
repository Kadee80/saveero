"""
tests/test_mortgage_core.py

Unit tests for mortgage.core — the pure-math building blocks.

Golden values come from two sources:
  (a) Hand-computed closed-form values (e.g. $200k @ 5% 30yr = $1073.64,
      a published, universally reproducible figure).
  (b) Internal consistency: first-month interest of any amortization must
      equal principal * monthly_rate exactly, and the sum of principal
      paid across all months must equal the original loan amount.
"""
from __future__ import annotations

import pytest

from mortgage.core import (
    PMI_LTV_THRESHOLD,
    build_amortization,
    max_housing_payment,
    max_housing_payment_backend,
    monthly_rate,
    months_until_ltv_threshold,
    pmt,
    principal_for_payment,
    remaining_balance,
)


# ---------------------------------------------------------------------------
# pmt
# ---------------------------------------------------------------------------

class TestPmt:
    def test_canonical_200k_5pct_30yr(self):
        # Widely published reference value: $200,000 @ 5% for 30yr = $1,073.64/mo
        assert pmt(200_000, 5.0, 30) == pytest.approx(1073.64, abs=0.01)

    def test_canonical_100k_6pct_30yr(self):
        # Widely published: $100,000 @ 6% for 30yr = $599.55/mo
        assert pmt(100_000, 6.0, 30) == pytest.approx(599.55, abs=0.01)

    def test_canonical_200k_4pct_15yr(self):
        # Widely published: $200,000 @ 4% for 15yr = $1,479.38/mo
        assert pmt(200_000, 4.0, 15) == pytest.approx(1479.38, abs=0.01)

    def test_zero_rate_is_straight_line(self):
        # 0% rate — payment is just principal / months
        assert pmt(360_000, 0.0, 30) == pytest.approx(1000.0)

    def test_zero_principal(self):
        assert pmt(0, 5.0, 30) == 0.0

    def test_zero_term_returns_zero(self):
        # Defensive — not a valid input but should not raise
        assert pmt(100_000, 5.0, 0) == 0.0

    def test_higher_rate_higher_payment(self):
        assert pmt(300_000, 7.0, 30) > pmt(300_000, 5.0, 30)

    def test_longer_term_lower_monthly(self):
        assert pmt(300_000, 6.0, 30) < pmt(300_000, 6.0, 15)


# ---------------------------------------------------------------------------
# remaining_balance
# ---------------------------------------------------------------------------

class TestRemainingBalance:
    def test_zero_elapsed_returns_principal(self):
        assert remaining_balance(300_000, 6.0, 30, 0) == 300_000

    def test_full_term_returns_zero(self):
        assert remaining_balance(300_000, 6.0, 30, 360) == pytest.approx(0.0, abs=0.01)

    def test_beyond_term_returns_zero(self):
        assert remaining_balance(300_000, 6.0, 30, 500) == 0.0

    def test_matches_amortization_at_midpoint(self):
        # Closed-form balance should match the iterative amortization to the cent.
        principal, rate, years = 250_000, 5.5, 30
        schedule = build_amortization(principal, rate, years)
        mid = len(schedule) // 2
        expected = schedule[mid - 1].balance
        closed = remaining_balance(principal, rate, years, mid)
        assert closed == pytest.approx(expected, abs=0.01)

    def test_zero_rate_linear(self):
        # 0% interest — balance decreases linearly.
        assert remaining_balance(120_000, 0.0, 10, 60) == pytest.approx(60_000)


# ---------------------------------------------------------------------------
# build_amortization
# ---------------------------------------------------------------------------

class TestBuildAmortization:
    def test_length_is_months(self):
        schedule = build_amortization(300_000, 6.75, 30)
        assert len(schedule) == 360

    def test_first_month_interest_is_principal_times_rate(self):
        # Hand-verifiable invariant.
        principal, rate, years = 300_000, 6.75, 30
        schedule = build_amortization(principal, rate, years)
        expected = principal * monthly_rate(rate)
        assert schedule[0].interest == pytest.approx(expected, abs=0.0001)

    def test_final_balance_is_near_zero(self):
        schedule = build_amortization(450_000, 7.25, 30)
        assert schedule[-1].balance == pytest.approx(0.0, abs=0.05)

    def test_principal_sum_equals_loan(self):
        # All the principal paid across 360 months should equal the original loan.
        principal = 325_000
        schedule = build_amortization(principal, 6.5, 30)
        total_principal = sum(r.principal for r in schedule)
        assert total_principal == pytest.approx(principal, abs=0.05)

    def test_interest_decreases_monotonically(self):
        schedule = build_amortization(300_000, 6.0, 30)
        for i in range(1, len(schedule)):
            assert schedule[i].interest <= schedule[i - 1].interest + 1e-9

    def test_payment_is_constant(self):
        schedule = build_amortization(300_000, 6.0, 30)
        payments = {round(r.payment, 2) for r in schedule}
        assert len(payments) == 1


# ---------------------------------------------------------------------------
# months_until_ltv_threshold (PMI drop-off)
# ---------------------------------------------------------------------------

class TestMonthsUntilLtvThreshold:
    def test_already_below_threshold_returns_zero(self):
        # 10% down puts LTV at 90%; 80% is the default threshold.
        # If the loan was 75% of purchase price, PMI isn't required at all.
        result = months_until_ltv_threshold(
            purchase_price=400_000, loan_amount=300_000,  # LTV 75%
            annual_rate_percent=6.0, term_years=30,
        )
        assert result == 0

    def test_reaches_threshold_before_term_end(self):
        # 95% LTV: with typical amortization, should take many years to drop to 80%.
        result = months_until_ltv_threshold(
            purchase_price=400_000, loan_amount=380_000,
            annual_rate_percent=6.5, term_years=30,
        )
        # Should land somewhere in the first 2/3 of the term.
        assert 60 < result < 300

    def test_custom_threshold(self):
        # Dropping threshold to 70% should take LONGER than the default 80%.
        at_80 = months_until_ltv_threshold(400_000, 380_000, 6.5, 30, 0.80)
        at_70 = months_until_ltv_threshold(400_000, 380_000, 6.5, 30, 0.70)
        assert at_70 > at_80


# ---------------------------------------------------------------------------
# principal_for_payment (inverse of pmt)
# ---------------------------------------------------------------------------

class TestPrincipalForPayment:
    def test_round_trip(self):
        # PMT and its inverse should compose to identity.
        principal, rate, years = 425_000, 6.75, 30
        monthly = pmt(principal, rate, years)
        assert principal_for_payment(monthly, rate, years) == pytest.approx(principal, abs=0.01)

    def test_zero_payment(self):
        assert principal_for_payment(0.0, 6.0, 30) == 0.0

    def test_zero_rate(self):
        assert principal_for_payment(1000.0, 0.0, 30) == pytest.approx(1000 * 360)


# ---------------------------------------------------------------------------
# DTI caps
# ---------------------------------------------------------------------------

class TestDtiCaps:
    def test_front_end_cap(self):
        # $120k/yr at 35% front-end → $3500/mo housing cap.
        assert max_housing_payment(120_000, 0.35) == pytest.approx(3500.0)

    def test_back_end_cap_subtracts_debts(self):
        # $120k/yr at 43% back-end = $4300; minus $800 debts = $3500.
        assert max_housing_payment_backend(120_000, 800.0, 0.43) == pytest.approx(3500.0)

    def test_back_end_cap_never_negative(self):
        assert max_housing_payment_backend(120_000, 100_000, 0.43) == 0.0

    def test_zero_income(self):
        assert max_housing_payment(0, 0.35) == 0.0
        assert max_housing_payment_backend(0, 500, 0.43) == 0.0
