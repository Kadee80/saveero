"""
mortgage/affordability.py

"How much house can I afford?"

Given income, debts, available down-payment cash, and target loan terms,
compute the maximum purchase price and loan amount the borrower can support
under front-end and back-end DTI caps.
"""
from __future__ import annotations

from dataclasses import dataclass

from mortgage.core import (
    DEFAULT_MAX_BACK_END_DTI,
    DEFAULT_MAX_FRONT_END_DTI,
    PMI_ANNUAL_RATE,
    PMI_LTV_THRESHOLD,
    max_housing_payment,
    max_housing_payment_backend,
    principal_for_payment,
)


@dataclass(frozen=True)
class AffordabilityInputs:
    """Inputs for `compute_affordability`."""
    annual_income: float
    monthly_debts: float = 0.0           # car loans, student loans, cards, etc.
    down_payment_cash: float = 0.0       # how much cash the borrower has for down payment
    annual_rate_percent: float = 6.75
    term_years: int = 30
    annual_property_tax_percent: float = 1.2  # national average ~1.1-1.2%
    annual_insurance_dollars: float = 1500.0
    monthly_hoa: float = 0.0
    max_front_end_dti: float = DEFAULT_MAX_FRONT_END_DTI
    max_back_end_dti: float = DEFAULT_MAX_BACK_END_DTI


@dataclass(frozen=True)
class AffordabilityResult:
    """Output from `compute_affordability`."""
    # Derived caps
    monthly_income: float
    max_monthly_housing_payment: float  # the binding cap (min of front/back)
    binding_constraint: str             # "front_end_dti" | "back_end_dti" | "income_zero"

    # Loan & price
    max_loan_amount: float
    max_purchase_price: float

    # Breakdown at max affordable price
    estimated_monthly_pi: float
    estimated_monthly_tax: float
    estimated_monthly_insurance: float
    estimated_monthly_pmi: float
    estimated_monthly_total: float

    # DTI ratios at the recommended price
    front_end_dti: float
    back_end_dti: float

    # Diagnostic / explanation for the UI
    pmi_required: bool
    notes: str


def compute_affordability(inputs: AffordabilityInputs) -> AffordabilityResult:
    """
    Compute maximum affordable home price.

    Algorithm:
      1. Compute the binding monthly housing cap (min of front-end and back-end DTI).
      2. Non-P&I costs (tax, insurance, HOA, PMI) scale with purchase price, so
         we solve iteratively: start with a guess, compute PI budget, derive price,
         recompute non-PI costs, and converge. 6 iterations is plenty at dollar
         precision for typical inputs.
      3. The result's `max_purchase_price` is what the borrower can qualify for;
         it is NOT a recommendation to spend that much.
    """
    if inputs.annual_income <= 0:
        return AffordabilityResult(
            monthly_income=0.0,
            max_monthly_housing_payment=0.0,
            binding_constraint="income_zero",
            max_loan_amount=0.0,
            max_purchase_price=0.0,
            estimated_monthly_pi=0.0,
            estimated_monthly_tax=0.0,
            estimated_monthly_insurance=0.0,
            estimated_monthly_pmi=0.0,
            estimated_monthly_total=0.0,
            front_end_dti=0.0,
            back_end_dti=0.0,
            pmi_required=False,
            notes="Annual income is zero; no qualifying loan.",
        )

    monthly_income = inputs.annual_income / 12.0
    front_cap = max_housing_payment(inputs.annual_income, inputs.max_front_end_dti)
    back_cap = max_housing_payment_backend(
        inputs.annual_income, inputs.monthly_debts, inputs.max_back_end_dti
    )

    if back_cap < front_cap:
        cap = back_cap
        binding = "back_end_dti"
    else:
        cap = front_cap
        binding = "front_end_dti"

    # Solve for price iteratively — non-PI costs depend on price.
    monthly_insurance = inputs.annual_insurance_dollars / 12.0
    tax_factor = inputs.annual_property_tax_percent / 100.0 / 12.0

    price = 0.0
    loan_amount = 0.0
    monthly_pi = 0.0
    monthly_pmi = 0.0
    monthly_tax = 0.0
    pmi_required = False

    for _ in range(8):
        non_pi = (price * tax_factor) + monthly_insurance + inputs.monthly_hoa + monthly_pmi
        pi_budget = max(0.0, cap - non_pi)
        new_loan = principal_for_payment(
            pi_budget, inputs.annual_rate_percent, inputs.term_years
        )
        new_price = new_loan + max(0.0, inputs.down_payment_cash)

        # PMI check for next iteration
        if new_price > 0:
            ltv_frac = new_loan / new_price
            pmi_required = ltv_frac > PMI_LTV_THRESHOLD
            monthly_pmi = (new_loan * PMI_ANNUAL_RATE / 12.0) if pmi_required else 0.0
        else:
            pmi_required = False
            monthly_pmi = 0.0

        # Converged?
        if abs(new_price - price) < 1.0:
            price = new_price
            loan_amount = new_loan
            monthly_pi = pi_budget
            monthly_tax = price * tax_factor
            break

        price = new_price
        loan_amount = new_loan
        monthly_pi = pi_budget
        monthly_tax = price * tax_factor

    # Don't invent negative numbers for pathological inputs
    price = max(0.0, price)
    loan_amount = max(0.0, loan_amount)

    monthly_total = (
        monthly_pi + monthly_tax + monthly_insurance
        + inputs.monthly_hoa + monthly_pmi
    )

    front_dti = monthly_total / monthly_income if monthly_income > 0 else 0.0
    back_dti = (
        (monthly_total + max(0.0, inputs.monthly_debts)) / monthly_income
        if monthly_income > 0 else 0.0
    )

    notes_parts = []
    if pmi_required:
        notes_parts.append(
            f"PMI required (LTV > {int(PMI_LTV_THRESHOLD * 100)}%). "
            "Increase down payment to avoid."
        )
    if binding == "back_end_dti":
        notes_parts.append(
            "Back-end DTI (existing debts) is the binding constraint, "
            "not income alone. Paying down debts increases affordability."
        )
    if inputs.down_payment_cash <= 0:
        notes_parts.append("Result assumes zero down — uncommon; plan for 3-20% down.")

    return AffordabilityResult(
        monthly_income=monthly_income,
        max_monthly_housing_payment=cap,
        binding_constraint=binding,
        max_loan_amount=loan_amount,
        max_purchase_price=price,
        estimated_monthly_pi=monthly_pi,
        estimated_monthly_tax=monthly_tax,
        estimated_monthly_insurance=monthly_insurance,
        estimated_monthly_pmi=monthly_pmi,
        estimated_monthly_total=monthly_total,
        front_end_dti=front_dti,
        back_end_dti=back_dti,
        pmi_required=pmi_required,
        notes=" ".join(notes_parts) if notes_parts else "Within standard DTI guidelines.",
    )
