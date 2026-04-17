"""
tests/test_mortgage_refinance.py

Unit tests for mortgage.refinance.analyze_refinance.
"""
from __future__ import annotations

import pytest

from mortgage.refinance import (
    CurrentLoan,
    RefinanceOffer,
    analyze_refinance,
)


# ---------------------------------------------------------------------------
# Clear-win refinance: rate drops significantly.
# Current: $400k, 7.5%, 30yr, 24 months in.
# Offer:   5.5%, new 30yr, $4000 closing rolled in.
# ---------------------------------------------------------------------------

class TestClearWinRefi:
    def _setup(self):
        current = CurrentLoan(
            original_principal=400_000,
            annual_rate_percent=7.5,
            term_years=30,
            elapsed_months=24,
        )
        offer = RefinanceOffer(
            annual_rate_percent=5.5,
            new_term_years=30,
            closing_costs=4_000,
            rolled_in_closing=True,
        )
        return analyze_refinance(current, offer)

    def test_monthly_savings_positive(self):
        r = self._setup()
        assert r.monthly_savings > 0

    def test_recommendation_is_refinance(self):
        r = self._setup()
        assert r.recommendation == "refinance"

    def test_break_even_reported(self):
        r = self._setup()
        # Rolled-in closing → monthly is cheaper from month 1.
        assert r.break_even_month == 1


# ---------------------------------------------------------------------------
# No-win refinance: rate is higher.
# ---------------------------------------------------------------------------

class TestNoWinRefi:
    def _setup(self):
        current = CurrentLoan(
            original_principal=300_000,
            annual_rate_percent=4.5,
            term_years=30,
            elapsed_months=60,
        )
        offer = RefinanceOffer(
            annual_rate_percent=7.0,  # went up, not down
            new_term_years=30,
            closing_costs=5_000,
        )
        return analyze_refinance(current, offer)

    def test_monthly_savings_negative(self):
        r = self._setup()
        assert r.monthly_savings < 0

    def test_no_break_even(self):
        r = self._setup()
        assert r.break_even_month == -1

    def test_recommendation_is_hold(self):
        r = self._setup()
        assert r.recommendation == "hold"


# ---------------------------------------------------------------------------
# Marginal case: lower rate but resetting the term erases lifetime savings.
# ---------------------------------------------------------------------------

class TestMarginalRefi:
    def test_long_break_even_is_marginal(self):
        # Small rate drop (25 bps) with high closing costs → long break-even.
        current = CurrentLoan(
            original_principal=500_000,
            annual_rate_percent=6.5,
            term_years=30,
            elapsed_months=12,
        )
        offer = RefinanceOffer(
            annual_rate_percent=6.25,  # only 25 bps lower
            new_term_years=30,
            closing_costs=8_000,
            rolled_in_closing=False,  # paid out of pocket
        )
        r = analyze_refinance(current, offer)
        # Monthly savings are small, closing is high → break-even should be long.
        assert r.monthly_savings > 0
        assert r.break_even_month > 60


# ---------------------------------------------------------------------------
# Cash-out refinance
# ---------------------------------------------------------------------------

class TestCashOut:
    def test_cash_out_increases_loan(self):
        current = CurrentLoan(
            original_principal=400_000,
            annual_rate_percent=6.5,
            term_years=30,
            elapsed_months=60,
        )
        no_cash = analyze_refinance(current, RefinanceOffer(
            annual_rate_percent=5.5, new_term_years=30, cash_out=0,
        ))
        cash = analyze_refinance(current, RefinanceOffer(
            annual_rate_percent=5.5, new_term_years=30, cash_out=50_000,
        ))
        assert cash.new_loan_amount == pytest.approx(no_cash.new_loan_amount + 50_000, abs=1)

    def test_cash_out_noted(self):
        current = CurrentLoan(
            original_principal=400_000, annual_rate_percent=6.5,
            term_years=30, elapsed_months=60,
        )
        r = analyze_refinance(current, RefinanceOffer(
            annual_rate_percent=5.5, new_term_years=30, cash_out=25_000,
        ))
        assert "cash-out" in r.notes.lower() or "25,000" in r.notes


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------

class TestValidation:
    def test_rejects_zero_principal(self):
        with pytest.raises(ValueError):
            analyze_refinance(
                CurrentLoan(original_principal=0, annual_rate_percent=6, term_years=30),
                RefinanceOffer(annual_rate_percent=5, new_term_years=30),
            )

    def test_rejects_zero_new_term(self):
        with pytest.raises(ValueError):
            analyze_refinance(
                CurrentLoan(original_principal=300_000, annual_rate_percent=6, term_years=30),
                RefinanceOffer(annual_rate_percent=5, new_term_years=0),
            )

    def test_rejects_negative_closing_costs(self):
        with pytest.raises(ValueError):
            analyze_refinance(
                CurrentLoan(original_principal=300_000, annual_rate_percent=6, term_years=30),
                RefinanceOffer(annual_rate_percent=5, new_term_years=30, closing_costs=-100),
            )


# ---------------------------------------------------------------------------
# Rolled-in vs. paid-out-of-pocket closing
# ---------------------------------------------------------------------------

class TestClosingCostHandling:
    def test_rolled_in_adds_to_loan(self):
        current = CurrentLoan(
            original_principal=300_000, annual_rate_percent=6.5,
            term_years=30, elapsed_months=12,
        )
        rolled = analyze_refinance(current, RefinanceOffer(
            annual_rate_percent=5.5, new_term_years=30,
            closing_costs=5_000, rolled_in_closing=True,
        ))
        paid = analyze_refinance(current, RefinanceOffer(
            annual_rate_percent=5.5, new_term_years=30,
            closing_costs=5_000, rolled_in_closing=False,
        ))
        # Rolled-in should produce a larger new loan.
        assert rolled.new_loan_amount > paid.new_loan_amount
        # ...but the paid version has a monthly savings break-even
        # counted against the $5k upfront.
        assert paid.break_even_month > 1
