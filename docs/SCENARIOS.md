# Scenario Engine Documentation

This document describes Saveero's two consumer-facing scenario
engines — the homeowner Decision Map (Part 1, below) and the
first-time-homebuyer engine (Part 2). Both are pure-Python,
deterministic, golden-tested against client-validated Excel models.

For the third engine — the Portfolio Strategy Engine for investors —
see [`PORTFOLIO_ENGINE_ARCH.md`](./PORTFOLIO_ENGINE_ARCH.md). That
engine is substantively different in shape (multi-property input,
strategy registry, goal-weighted scoring) and warrants its own spec
rather than a section here.

---

## Overview

The scenario engine models every realistic decision a homeowner can make:

1. **Stay** — Keep the home and current mortgage unchanged (baseline)
2. **Refinance** — Keep the home, replace the mortgage at a lower rate
3. **Sell + Buy** — Sell current home, purchase a replacement
4. **Rent Out** — Convert current home to rental; owner moves elsewhere (investment view)
5. **Rent Out & Buy** — Keep current as rental AND simultaneously purchase new primary residence

Each scenario produces two key outputs:
- **Net Position** — Wealth at the analysis horizon (equity + growth − costs)
- **Monthly Cost Impact** — How monthly housing costs compare to staying

The Decision Map then ranks all 5 scenarios and flags feasibility constraints (e.g., "insufficient liquidity for Rent Out & Buy").

---

## Inputs (45 Fields)

All scenarios share the same input set. Inputs are provided as JSON to the API and converted to the `MasterInputs` dataclass.

### Current Property
| Input | Type | Notes |
|-------|------|-------|
| `current_home_value` | float | Current market value or purchase price ($) |
| `current_mortgage_balance` | float | Outstanding principal today ($) |
| `current_mortgage_rate` | float | Annual fixed rate (e.g., 0.065 for 6.5%) |
| `current_loan_term_months` | int | Remaining amortization (months) |
| `monthly_property_tax` | float | Annual property tax ÷ 12 ($) |
| `monthly_insurance` | float | Annual homeowners insurance ÷ 12 ($) |
| `monthly_hoa` | float | Homeowners association fee ($) |
| `monthly_maintenance` | float | Expected maintenance reserve ($) |

### Target Property (for Sell+Buy and Rent Out & Buy)
| Input | Type | Notes |
|-------|------|-------|
| `target_home_value` | float | Purchase price of replacement ($) |
| `target_down_payment_pct` | float | Down payment as % of purchase price (0.20 = 20%) |
| `target_mortgage_rate` | float | Expected rate on replacement loan |
| `target_loan_term_months` | int | Amortization on replacement loan |
| `target_property_tax_pct` | float | Property tax as % of target home value |
| `target_insurance_monthly` | float | Annual insurance ÷ 12 on target ($) |
| `target_hoa_monthly` | float | HOA fee on target ($) |
| `target_maintenance_monthly` | float | Maintenance reserve on target ($) |

### Refinance Scenario
| Input | Type | Notes |
|-------|------|-------|
| `refinance_rate` | float | New fixed rate |
| `refinance_loan_term_months` | int | New amortization period |
| `refinance_closing_cost_pct` | float | Refi closing costs as % of balance |
| `refinance_closing_costs_financed` | bool | True = roll costs into new loan; False = pay at close |

### Rental Conversion
| Input | Type | Notes |
|-------|------|-------|
| `rental_monthly_rent` | float | Gross monthly market rent ($) |
| `rental_vacancy_rate` | float | Vacancy allowance (0.05 = 5%) |
| `rental_management_fee_pct` | float | Property mgmt as % of gross rent (0.08 = 8%) |
| `rental_maintenance_reserve_pct` | float | Maintenance reserve as % of gross rent |
| `rental_other_monthly_expense` | float | Utilities, leasing, misc. ($) |
| `rental_make_ready_cost` | float | One-time turnover cost ($) |

### Universal Assumptions
| Input | Type | Notes |
|-------|------|-------|
| `annual_appreciation_rate` | float | Home value growth rate (0.03 = 3% annually) |
| `selling_cost_pct` | float | Brokerage + closing costs as % of sale price (0.07 = 7%) |
| `purchase_closing_cost_pct` | float | Closing costs on new purchase as % of price |
| `moving_transition_cost` | float | One-time moving cost for Sell+Buy ($) |
| `cash_reserve_for_purchase` | float | Cash held back, not redeployed ($) |
| `marginal_tax_rate` | float | Tax bracket for rental income/deductions (0.24 = 24%) |
| `land_value_pct` | float | Non-depreciable portion of value (0.20 = 20%) for depreciation |
| `analysis_hold_period_years` | int | How many years in the future to project |

---

## Scenario 1: Stay

**Logic:** Keep the home and current mortgage. Every other scenario is implicitly compared against this outcome.

### Calculations

```
Future home value = current_home_value × (1 + appreciation_rate) ^ years
Future mortgage balance = Amortize current loan forward by hold period
Gross equity = future_value − future_balance
Selling costs at horizon = selling_cost_pct × future_value
Net equity if sold = gross_equity − selling_costs
Total monthly cost = P&I + tax + insurance + HOA + maintenance
Total net position = Net equity if sold
```

### Output Fields
- `future_home_value` — Home value at analysis horizon
- `future_mortgage_balance` — Remaining balance at horizon
- `gross_equity` — Before selling costs
- `net_equity_if_sold` — After selling costs (main output)
- `total_monthly_ownership_cost` — Current monthly housing expense
- `monthly_principal_interest` — P&I on current loan

### Key Notes
- Stay is the baseline for all comparisons
- Its total_monthly_ownership_cost is used as reference for Sell+Buy and Rent Out & Buy monthly-cost deltas

---

## Scenario 2: Refinance

**Logic:** Keep the home, replace mortgage at a new rate. Measures whether payment savings justify closing costs.

### Calculations

```
Refinance closing costs = refi_closing_cost_pct × current_balance
New loan amount = current_balance + (closing_costs if financed, else 0)
Cash to close = closing_costs × (1 if not financed, else 0)
New monthly P&I = PMT(refi_rate / 12, new_term, new_loan)
Monthly savings = old_PI − new_PI
Break-even (months) = total_closing_costs ÷ monthly_savings
Future refi balance = Amortize new loan forward by hold period
Net equity if sold = future_home_value − future_refi_balance − selling_costs
Cumulative savings = monthly_savings × (hold_years × 12)
Total net position = net_equity + cumulative_savings − cash_to_close
Total monthly cost = new_PI + tax + insurance + HOA + maintenance
```

### Output Fields
- `monthly_savings` — Positive = monthly payment decrease
- `break_even_months` — How long to recover upfront closing cost
- `cumulative_savings` — Total P&I saved over hold period
- `total_net_position` — Final wealth comparison
- `total_monthly_ownership_cost` — New monthly expense

### Key Notes
- If `break_even_months > hold_period_months`, the refinance doesn't pay off in the homeowner's timeframe
- Negative `monthly_savings` means the new rate is worse
- Home appreciation and principal paydown are the same as Stay (only loan structure changes)

---

## Scenario 3: Sell + Buy

**Logic:** Sell current home, use net proceeds as down payment on replacement. Measures net position and monthly-cost impact.

### Calculations

```
Estimated selling costs = selling_cost_pct × current_home_value
Net proceeds = current_home_value − selling_costs − mortgage_balance
Cash available = net_proceeds − cash_reserve_held_back
Required down payment = target_down_payment_pct × target_home_value
New loan amount = target_home_value − down_payment
Purchase closing costs = purchase_closing_cost_pct × target_home_value
Cash remaining at close = cash_available − down_payment − closing_costs − moving_cost

New monthly P&I = PMT(target_rate / 12, target_term, new_loan)
Future target home value = target_home_value × (1 + appreciation) ^ years
Future new loan balance = Amortize new loan forward by hold period
Net equity if sold = future_target_value − future_new_balance − selling_costs_at_horizon
Total net position = net_equity + cash_remaining

Total monthly cost = new_PI + new_tax + new_insurance + new_HOA + new_maintenance
Monthly cost change = Stay_monthly_cost − new_monthly_cost
  (positive = lower monthly cost than staying)
```

### Output Fields
- `net_proceeds_from_sale` — Cash released from current home
- `cash_available_for_purchase` — After reserves held back
- `down_payment_amount` — Required for target home
- `new_loan_amount` — Amount financed
- `purchase_closing_costs` — Upfront cost
- `cash_remaining_at_close` — Surplus/deficit at close
- `net_equity_if_sold` — Equity in new home at horizon
- `total_net_position` — Final wealth
- `total_monthly_ownership_cost` — New monthly housing cost
- `monthly_cost_change_vs_stay` — Delta vs staying (for easy comparison)

### Key Notes
- Negative `cash_remaining_at_close` means homeowner needs external cash to close (liquidity constraint)
- Both homes appreciate at the same rate (assumption in product spec)
- The Decision Map flags this scenario as infeasible if cash_remaining is negative

---

## Scenario 4: Rent Out

**Logic:** Convert current home to rental. Owner moves elsewhere (rental expense not modeled—pure investment view). Includes tax benefits from depreciation and interest deductions.

### Calculations

```
Vacancy allowance = gross_rent × vacancy_rate
Effective rent = gross_rent − vacancy
Management fee = gross_rent × mgmt_fee_pct
Maintenance reserve = gross_rent × maintenance_pct
Total operating expenses = mgmt + maintenance + other + tax + insurance + HOA

Pre-tax cash flow (monthly) = effective_rent − operating_expenses − P&I
Annual interest deduction = First-year mortgage interest from amortization
Annual depreciation = (current_home_value × (1 − land_pct)) ÷ 27.5
  (27.5-year depreciation schedule per US tax code)
Annual taxable income = annual_rent − annual_opex − interest_deduction − depreciation
Annual tax benefit = taxable_income × marginal_tax_rate
  (if loss, benefit = negative tax paid; treated as cash benefit)
Monthly after-tax cash flow = pretax_cashflow + (annual_tax_benefit ÷ 12)

Cumulative after-tax cash flow = monthly_aftertax × (hold_years × 12)
Net equity if sold = Same as Stay scenario (same property)
Total net position = net_equity + cumulative_aftertax_cashflow − make_ready_cost
```

### Output Fields
- `monthly_gross_rent` — Gross rental income
- `vacancy_allowance` — Lost revenue to vacancy
- `effective_monthly_rent` — Actual rent collected
- `total_monthly_opex` — All operating expenses
- `pretax_monthly_cash_flow` — Before tax shield
- `annual_interest_deduction` — Tax deductible portion of interest
- `annual_depreciation` — Tax deductible depreciation
- `annual_tax_benefit` — Realized tax savings
- `aftertax_monthly_cash_flow` — After-tax monthly income (may be negative)
- `cumulative_aftertax_cash_flow` — Total cash over hold period
- `total_net_position` — Final wealth (equity + cumulative cash − make-ready)

### Key Notes
- Can show positive total net position even with **negative monthly cash flow** because:
  - Appreciation compounds over time
  - Principal paydown
  - Tax shield from depreciation (even if property has negative cash flow monthly)
- Depreciation recapture at sale is **not modeled** (simplification in current spec)
- Interest deduction decreases each year as principal is paid down (simplified as first-year amount)

---

## Scenario 5: Rent Out & Buy

**Logic:** Retain current home as rental AND simultaneously purchase new primary residence using available capital (no sale proceeds). Subject to liquidity feasibility.

### Calculations

Combines Rent Out + Sell+Buy logic:

```
Rental cash flows = Same as Rent Out scenario (same property)
New loan amount = target_home_value − down_payment
New monthly P&I = PMT(target_rate / 12, target_term, new_loan)

Available capital = current_home_value + current_liquid_assets − current_mortgage
  (simplified: assumes homeowner has capital, not derived from here)

For purchase: uses same down_payment_pct and closing cost logic as Sell+Buy
  BUT financed from available capital, not sale proceeds

Cash remaining for primary residence = Available capital − down_payment − closing_costs − moving_cost
```

### Output Fields
Combines outputs from both Rent Out and Sell+Buy:
- All rental fields (rent, vacancy, management fee, cash flow, tax benefit, etc.)
- New primary residence fields (loan amount, monthly P&I, equity, closing costs, etc.)
- Total monthly carrying cost = (Rental P&I) + (Primary P&I) + (All property costs)
- Liquidity check = Cash available for purchase (flag if negative)

### Key Notes
- Most complex scenario because homeowner must simultaneously:
  - Maintain equity in current home
  - Purchase new primary residence
  - Cover all expenses for both properties
- Feasibility flag in Decision Map checks if homeowner has enough capital
- Two separate mortgages (rental + primary residence)

---

## Decision Map

The Decision Map takes all 5 scenario results and produces:

### Recommendation
```
recommendation = Scenario with highest total_net_position
  (scenario that leaves homeowner wealthiest at horizon)
recommendation_rank = [1]
```

### Rankings
```
All 5 scenarios ranked by total_net_position (descending)
rank[0] = highest wealth outcome
rank[4] = lowest wealth outcome
```

### Feasibility Flags
Each scenario is evaluated for real-world constraints:

| Scenario | Feasibility Check |
|----------|------------------|
| Stay | Always feasible |
| Refinance | Always feasible (if current mortgage exists) |
| Sell + Buy | FAIL if `cash_remaining_at_close < 0` (insufficient equity) |
| Rent Out | FAIL if `aftertax_monthly_cash_flow < threshold` (subsidy too high) |
| Rent Out & Buy | FAIL if insufficient capital for both mortgages + reserves |

### Comparison Table
Shows all 5 scenarios side-by-side:
- Monthly ownership cost for each
- Net wealth position
- Monthly cost delta vs. Stay
- Feasibility flags

---

## Example: Full Workflow

A homeowner provides inputs:

```json
{
  "current_home_value": 500000,
  "current_mortgage_balance": 350000,
  "current_mortgage_rate": 0.065,
  "current_loan_term_months": 300,
  "monthly_property_tax": 400,
  "monthly_insurance": 150,
  "monthly_hoa": 0,
  "monthly_maintenance": 500,
  
  "target_home_value": 600000,
  "target_down_payment_pct": 0.20,
  "target_mortgage_rate": 0.055,
  "target_loan_term_months": 360,
  "target_property_tax_pct": 0.012,
  "target_insurance_monthly": 180,
  "target_hoa_monthly": 0,
  "target_maintenance_monthly": 600,
  
  "annual_appreciation_rate": 0.03,
  "analysis_hold_period_years": 7,
  "selling_cost_pct": 0.07,
  "marginal_tax_rate": 0.24,
  ...
}
```

The engine computes:

1. **Stay** → Home worth $635M, net equity $285M, monthly cost $1050
2. **Refinance** → Saves $200/mo, net equity $295M (stay + cumulative savings)
3. **Sell + Buy** → New home worth $762M, equity $410M, monthly cost $1200
4. **Rent Out** → Negative cash flow of $300/mo BUT tax shield makes total net position $320M
5. **Rent Out & Buy** → Most complex; combines rental income with new primary

**Decision Map Output:**
```
Ranking:
1. Rent Out & Buy: $450M (best wealth outcome)
2. Sell + Buy: $410M
3. Rent Out: $320M
4. Refinance: $295M
5. Stay: $285M (baseline)

Feasibility:
✓ All scenarios feasible (no liquidity constraints)

Recommendation:
Rent Out & Buy — homeowner ends with highest net position,
BUT requires capital to support two properties for 7 years.
```

---

## Code Organization

```
scenarios/
├── inputs.py          — MasterInputs dataclass, validate()
├── stay.py            — compute_stay() function
├── refinance.py       — compute_refinance()
├── sell_buy.py        — compute_sell_buy()
├── rent.py            — compute_rent()
├── rent_out_buy.py    — compute_rent_out_buy()
├── decision_map.py    — compute_decision_map(), ranking logic
├── audit.py           — run_audit(), calculation trail
├── engine.py          — run_all(), orchestrator
├── core.py            — Shared utilities (amortization, PMT formula, etc.)
├── schemas.py         — Pydantic HTTP models
└── __init__.py        — Public API exports
```

### Key Utilities (core.py)

- `amortize_loan()` — Calculates remaining balance after N payments
- `monthly_payment()` — PMT formula for loan payments
- `future_value()` — Compound growth formula
- Tax shield calculations
- Depreciation schedules

---

## Testing

**Golden-path tests** in `tests/test_scenarios_golden.py` validate each scenario against known inputs/outputs:

```python
def test_sell_buy_basic():
    inputs = test_inputs()  # Standard test set
    inputs.target_home_value = 600000
    inputs.target_down_payment_pct = 0.20
    
    result = compute_sell_buy(inputs, stay_monthly_cost)
    
    assert result.down_payment_amount == 120000
    assert result.new_loan_amount == 480000
    assert result.total_net_position > result.stay_net_position
```

When modifying scenario logic:
1. Run `pytest tests/test_scenarios_golden.py -v`
2. If formulas change, update expected values in tests
3. Commit both code changes and test updates

---

## Future Enhancements

- [ ] Depreciation recapture at sale (Rent Out, Rent Out & Buy)
- [ ] Interest deduction declining per amortization schedule (vs. first-year fixed)
- [ ] PMI (mortgage insurance) for down payments < 20%
- [ ] ARM (adjustable rate mortgage) scenarios
- [ ] Variable rental income over time
- [ ] Capital gains tax on appreciated home sales

---

# Part 2 — First-Time Homebuyer (FTHB) Engine

Everything above describes the **homeowner** scenario engine — for users who
already own a home and are deciding what to do with it. Saveero ships a
**second, parallel engine** for users who don't own yet and are deciding
*whether and how to buy their first home*. The two engines are deliberately
separate.

## Why a fork

Per the client's architectural ask: *"This would be a separate branch from the
homeowner branch (so at the start there should be a fork between non-homeowners
and existing homeowners)."* The fork happens at signup via the Onboarding
Wizard's "Do you currently own a home?" step (step 2). Answering No flags the
lead as `first_time_buyer`; the Dashboard then routes them to
`/fthb-decision-map` instead of `/decision-map`.

The two engines share `scenarios/core.py`'s math primitives (PMT, FV-of-loan-
balance, future-home-value with annual compounding) but otherwise live in
parallel directories — `scenarios/` for homeowner, `scenarios/fthb/` for FTHB —
with separate inputs, separate scenario modules, separate decision-map output
shape, separate API routes, and separate golden tests. Do not try to
retrofit FTHB into the homeowner engine.

## The five FTHB scenarios

1. **Continue Renting** — keep renting, invest the available cash, accumulate
   savings over the comparison horizon
2. **Buy Starter Home** — entry-priced purchase at the universal down payment,
   default mortgage rate
3. **Buy Preferred Home** — higher-priced "reach" purchase, same down payment
4. **Buy with Downpayment Assistance (DPA)** — starter home + DPA, with a
   50bps higher rate and forced repayment of the DPA principal at horizon
5. **Delay Purchase** — wait one year, save more during the wait, reassess
   feasibility of buying the starter

The Excel source-of-truth is `VAN/FTHB_decision map.xlsx`. The engine is
bit-for-bit golden-tested against it.

## Inputs (~25 fields, single `FTHBInputs` dataclass)

Defaults match the spreadsheet's Inputs sheet column B.

### Financial profile
| Input | Type | Notes |
|---|---|---|
| `annual_household_income` | float | Gross, before tax ($) |
| `monthly_debt_obligations` | float | Student loans, auto, credit cards ($) |
| `available_cash_for_purchase` | float | Total cash for down + closing ($) |
| `universal_down_payment` | float | Single down-payment value used by every buy scenario ($) |
| `estimated_credit_score` | int | Display-only in v1 |

### Home goals
| Input | Type | Notes |
|---|---|---|
| `current_monthly_rent` | float | What the user pays today ($) |
| `starter_home_price` | float | Lower entry-point option ($) |
| `preferred_home_price` | float | Aspirational / "reach" option ($) |
| `horizon_years` | float | Comparison horizon used across scenarios |

### System assumptions
Mortgage rate (decimal), term (months), purchase closing cost %, property tax
annual %, insurance annual %, monthly HOA, maintenance annual %, annual home
appreciation, annual rent inflation, return on unspent cash, max DTI,
post-close cushion %, minimum cushion floor, available DPA amount, delay-period
monthly savings, take-home % of gross income.

A derived field, `monthly_take_home_income`, computes
`annual_household_income / 12 * take_home_pct` (Excel `Inputs!B34`) and feeds
every scenario's residual-monthly-savings calculation.

## The DPA mechanic (load-bearing)

`Buy with Assistance` is structurally `Buy Starter Home` with three deltas.
Each matters; the test suite asserts all three:

1. **+50 bps rate premium.** The effective mortgage rate is
   `Inputs!B17 + 0.005` for both PMT and the FV(loan) at horizon. Higher rate
   → larger monthly payment → slower amortization → larger remaining loan
   balance at horizon. Constant lives in `scenarios/fthb/inputs.py` as
   `DPA_RATE_PREMIUM`.
2. **Cash-to-close reduction.** The DPA amount (`Inputs!B30`, default $15k) is
   subtracted from `down + closing` to get `cash_required`. This *helps* now.
3. **Forced repayment at horizon.** The DPA principal is subtracted from net
   equity at horizon — Excel models this as a single deduction at the end (no
   amortization, no DPA interest accrual). Audit check #11 enforces this:
   `B24 = B22 - B23 - Inputs!B30`.

## The savings-capacity coupling (also load-bearing)

The headline differentiator vs. the homeowner engine. Total net position
includes a **third term** that propagates monthly housing cost into long-term
wealth:

```
total_net_position
    = equity_at_horizon
    + future_value_of_remaining_cash
    + projected_savings_accumulation
```

`residual_monthly_savings = monthly_take_home_income − monthly_debt − total_monthly_housing_payment`,
and `projected_savings_accumulation` is the FV of that as a monthly annuity
over the horizon. Higher monthly housing cost shrinks the residual which
shrinks the future-savings term — even if equity at horizon looks good in
isolation, the *all-in* picture can favor a cheaper path. This is the second-
order effect Van called out in the spec email; do not simplify the engine to
"equity vs. equity."

## Decision Map output

Mirrors the Excel `Outputs` sheet:

- **Scenario comparison** — five rows (one per scenario) × ten columns: Net
  Position, Monthly Cost, Residual Monthly Savings, Savings Accumulation, Cash
  Required, Cash Remaining, DTI, Equity at Horizon, Feasibility, Risk. Delay
  has `None` for Monthly Cost / DTI / Equity at Horizon (Excel writes "N/A").
- **Recommendation snapshot** — Best executable path, Best net position, Best
  monthly affordability, Best savings capacity, Lowest cash required, plus an
  Actionable Insight string keyed off the best-executable-path label.

### Known-broken recommendation logic (preserved CHECK)

The Excel `Outputs!B13` cell ("Best executable path") references a
column L ("Decision Score") that is empty / contains only "Future/TBD"
placeholder text. The IF chain accidentally lands on the right answer via
Excel's MAX-of-empty-cells-equals-zero behavior. The Python engine implements
the **intended logic** — `MAXIFS(net_position, feasibility="Feasible")` then
look up the matching scenario name — which gives the same result for the
default inputs but won't accidentally drift if inputs change.

Audit check #15 (`"Output recommendation uses savings-adjusted scores"`) is
intentionally preserved as **CHECK** (not PASS) to mirror the spreadsheet's
known TODO for a future per-scenario savings-adjusted score column. When that
column is implemented in the Excel, the audit check should flip to PASS here
too.

## Compliance

`tests/test_fthb_golden.py` — **124 tests**, all pinning every visible cell in
the FTHB workbook to **$0.0001** (well inside the $0.01 compliance bar).
Covers every input default, every scenario's computed cells, the full Decision
Map comparison + recommendation, the audit report, and a handful of edge
cases (zero-rate path, DPA equity invariant, etc.).

## Future AI interpretation layer (NOT V1, design constraint)

Van's email framed *"what is financially optimal"* vs. *"what is optimal for
this household"* as related-but-not-identical answers. The engine answers the
first deterministically; an AI layer eventually layers on top to weight the
financial output against soft factors (family size, schools, WFH, commute,
flexibility vs. permanence, risk tolerance, etc.).

Architectural rule for that future build:
- **Keep the FTHB engine pure / deterministic / golden-tested.** Don't bake
  lifestyle weighting into it.
- The output shape (`RunAllResponse` — 5 scenarios + decision map + audit) is
  intentionally designed to be consumable by an LLM interpretation layer
  without re-running the engine. Plain JSON, labeled fields, no hidden
  internal state.

## API

Routes parallel to the homeowner engine, all under `/api/fthb/`:

| Method | Path | Body |
|---|---|---|
| POST | `/api/fthb/scenarios/run` | `FTHBInputsRequest` → full engine result |
| POST | `/api/fthb/scenarios/continue-renting` | per-scenario drill-down |
| POST | `/api/fthb/scenarios/buy-starter` | " |
| POST | `/api/fthb/scenarios/buy-preferred` | " |
| POST | `/api/fthb/scenarios/buy-with-assistance` | " |
| POST | `/api/fthb/scenarios/delay-purchase` | " |
| POST | `/api/fthb/scenarios/decision-map` | comparison + recommendation only |
| POST | `/api/fthb/analyses` | save a named analysis (auth required) |
| GET | `/api/fthb/analyses` | list saved analyses, newest first (auth required) |
| GET | `/api/fthb/analyses/{id}` | fetch one (auth required) |
| DELETE | `/api/fthb/analyses/{id}` | delete one (auth required) |
