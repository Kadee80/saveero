"""
tests/test_scenarios_core.py

Unit tests for the Excel-conventions math primitives in scenarios.core.

Golden values pulled from direct PMT/FV calculations and cross-checked
against the Home Decision Model spreadsheet.
"""
from __future__ import annotations

import math

import pytest

from scenarios.core import fv_balance, future_home_value, pmt_monthly


class TestPmtMonthly:
    def test_default_current_mortgage(self):
        """Excel Inputs!B9 = -PMT(0.067/12, 300, 400000) = 2751.0299297252204"""
        assert pmt_monthly(400_000, 0.067, 300) == pytest.approx(2751.0299297252204, abs=1e-8)

    def test_refi_loan(self):
        """Excel Refi!B8 = -PMT(0.0575/12, 360, 410000) = 2392.648711418567"""
        assert pmt_monthly(410_000, 0.0575, 360) == pytest.approx(2392.648711418567, abs=1e-8)

    def test_new_purchase(self):
        """Excel Sell+Buy!B18 = -PMT(0.06/12, 360, 720000) = 4316.763781099817"""
        assert pmt_monthly(720_000, 0.06, 360) == pytest.approx(4316.763781099817, abs=1e-8)

    def test_zero_principal(self):
        assert pmt_monthly(0, 0.05, 360) == 0.0

    def test_zero_term(self):
        assert pmt_monthly(100_000, 0.05, 0) == 0.0

    def test_zero_rate_straight_line(self):
        assert pmt_monthly(120_000, 0.0, 120) == pytest.approx(1000.0)


class TestFvBalance:
    def test_current_loan_after_5_years(self):
        """Excel Stay!B13 = -FV(0.067/12, 60, -2751.03..., 400000) = 363222.975437813"""
        pi = pmt_monthly(400_000, 0.067, 300)
        assert fv_balance(400_000, 0.067, 60, pi) == pytest.approx(363222.975437813, abs=1e-6)

    def test_refi_loan_after_5_years(self):
        """Excel Refi!B15 = 380324.9660478089"""
        pi = pmt_monthly(410_000, 0.0575, 360)
        assert fv_balance(410_000, 0.0575, 60, pi) == pytest.approx(380324.9660478089, abs=1e-6)

    def test_new_purchase_after_5_years(self):
        """Excel Sell+Buy!B22 = 669991.3691243026"""
        pi = pmt_monthly(720_000, 0.06, 360)
        assert fv_balance(720_000, 0.06, 60, pi) == pytest.approx(669991.3691243026, abs=1e-6)

    def test_current_loan_after_12_months(self):
        """Excel Rent!B18 = 393593.27417984395"""
        pi = pmt_monthly(400_000, 0.067, 300)
        assert fv_balance(400_000, 0.067, 12, pi) == pytest.approx(393593.27417984395, abs=1e-6)

    def test_overpaid_balance_clamps_to_zero(self):
        """A huge payment should result in zero, not negative."""
        assert fv_balance(1000, 0.05, 60, 100) == 0.0

    def test_zero_periods_returns_principal(self):
        assert fv_balance(400_000, 0.067, 0, 2751.03) == 400_000


class TestFutureHomeValue:
    def test_default_5yr_appreciation(self):
        """Excel Stay!B12 = 750000 * 1.03^5 = 869455.5557249999"""
        assert future_home_value(750_000, 0.03, 5) == pytest.approx(869455.5557249999, abs=1e-6)

    def test_new_home_5yr(self):
        """Excel Sell+Buy!B21 = 900000 * 1.03^5 = 1043346.6668699998"""
        assert future_home_value(900_000, 0.03, 5) == pytest.approx(1043346.6668699998, abs=1e-6)

    def test_zero_appreciation(self):
        assert future_home_value(500_000, 0.0, 10) == 500_000

    def test_negative_appreciation(self):
        # Down markets are real
        assert future_home_value(500_000, -0.05, 5) == pytest.approx(500_000 * (0.95 ** 5))

    def test_zero_value_returns_zero(self):
        assert future_home_value(0, 0.03, 5) == 0.0
