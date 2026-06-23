# Portfolio Engine — V1 Architecture Spec

**Status:** Draft for Katie + Van review. Not yet a build contract.
**Date:** 2026-06-10.
**Author:** Katie (engineering)
**Inputs:** Van's *Portfolio Builder Engine.xlsx* + email scope replies + the
Master System Prompt V1 context.

This doc proposes the module structure, data shapes, and abstractions the V1
engine will be built around. Goal: agree on these before any code lands, so
the parts that are expensive to refactor later (data types, strategy
abstraction, scoring shape) are correct on the first pass. Same approach
that worked for the FTHB build.

If anything below is wrong or contentious, push back — better here than at
PR review.

---

## 1. V1 scope (from Van's replies, locked)

**In scope**

- **Six property types:** Single-Family Rental, Short-Term Rental,
  Residential Multifamily (2-4 Units), Commercial Multifamily (5+ Units),
  Vacation Home, Fix & Flip
- **Eight starting strategies:** Use Available Cash, HELOC on Existing
  Equity, Conventional Cash-Out, DSCR Cash-Out on Rental, No-Ratio /
  Asset-Based Cash-Out, Sell & Redeploy, Combination Strategy, Bridge /
  Hard Money / Private Capital
  - **Treated as an extensible registry, not a closed enum** — adding the
    9th strategy later should be one new file + one registry entry.
- **Four investor goals (drive scoring weights):**
  Build Wealth / Generate Passive Income / Preserve Liquidity / Minimize
  Risk
- **Per-property analytics** (sheet 3 logic): equity, LTV, monthly cash
  flow, DSCR, HELOC/Cash-Out/DSCR accessible equity buckets
- **Strategy scoring** (sheet 7 logic): per-strategy score across 8
  dimensions, weighted by the user's goal profile, ranked
- **Recommendation dashboard** (sheet 9 logic): top + alternative
  strategy, primary tradeoff, property-type note, suggested next step

**Out of scope for V1**

- Wealth projection (sheet 8) — deferred per Van.
- Other Commercial Property (retail/office/industrial/mixed-use) —
  deferred per Van.
- AI-generated consumer prose (sheet 7 column M, sheet 9). The engine
  produces structured outputs; the AI Coach layer (from the Master System
  Prompt) produces user-facing text. See §9.

**Terminology note for Van:** workbook uses "Long-Term Rental"; V1 list
uses "Single-Family Rental." Assuming they're the same concept (single-
unit, long-term residential rental). Flag if there's a meaningful split.

---

## 2. Mental model — engine flow start to end

```
                  ┌────────────────────────────────────────────┐
   user input → → │  PortfolioEngineInputs                     │
                  │   ├── user_profile                         │
                  │   ├── current_portfolio (list[Property])   │
                  │   └── target_property                      │
                  └────────────────────────────────────────────┘
                                       │
                                       ▼
                  ┌────────────────────────────────────────────┐
                  │  portfolio.analyze(current_portfolio)      │   ◄── sheet 3
                  │   → PortfolioAnalytics                     │
                  │     ├── per_property: list[PropertyAnalytics]
                  │     └── totals (equity, monthly cash flow, │
                  │         accessible equity buckets, etc.)   │
                  └────────────────────────────────────────────┘
                                       │
                                       ▼
                  ┌────────────────────────────────────────────┐
                  │  target.derive_capital_needed(target)      │   ◄── sheet 4
                  │   → float                                  │
                  └────────────────────────────────────────────┘
                                       │
                                       ▼
                  ┌────────────────────────────────────────────┐
                  │  for each strategy in STRATEGY_REGISTRY:   │   ◄── sheet 7
                  │    capital_available = strategy.capital(   │
                  │      portfolio_analytics, inputs)          │
                  │    dims = strategy.score_dimensions(       │
                  │      portfolio_analytics, inputs, target,  │
                  │      capital_available)                    │
                  │    weights = WEIGHTING_PROFILES[goal]      │
                  │    weighted = sum(dims[d] * weights[d])    │
                  │  → list[StrategyResult]                    │
                  └────────────────────────────────────────────┘
                                       │
                                       ▼
                  ┌────────────────────────────────────────────┐
                  │  rank + classify (Recommended/Alternative  │   ◄── sheet 7 col L, Q
                  │    /Stretch/Other), pull tradeoff +        │       sheet 9 INDEX/MATCH
                  │    property-type note from registry        │
                  │  → PortfolioEngineOutput                   │
                  └────────────────────────────────────────────┘
                                       │
                                       ▼
                                  consumer UI
                                       │
                                       ▼
                          (later) AI Coach layer
                          turns structured output
                          into the prose explanation
```

---

## 3. Module structure

Top-level `portfolio/` package — not nested under `scenarios/`. The
portfolio engine is substantial enough (strategy registry, goal-weighted
scoring matrix, per-property analytics, target-property capital model)
to warrant its own peer package alongside `scenarios/`. The
`scenarios/fthb/` precedent of nesting was for a much smaller engine
that fit naturally beside the homeowner one.

```
portfolio/
├── __init__.py
├── types.py                      # Pydantic v2 models — all inputs + outputs
├── enums.py                      # PropertyType, CreditScoreBucket, Goal, etc.
├── constants.py                  # PRODUCT_RULES, WEIGHTING_PROFILES, credit/risk maps
├── portfolio_analytics.py        # sheet 3 — per-property + portfolio totals
├── target_property.py            # sheet 4 — capital-needed, DP-by-type
├── strategy_scoring.py           # weights × dims → weighted score, rank, recommendation classification
├── goal_profiles.py              # the 4 weighting profiles keyed by InvestorGoal
├── product_rules.py              # PRODUCT_RULES constants block
├── engine.py                     # top-level run() composing the pieces
├── strategies/
│   ├── __init__.py               # STRATEGY_REGISTRY: list[Strategy]
│   ├── base.py                   # Strategy Protocol + shared helpers
│   ├── use_available_cash.py
│   ├── heloc.py
│   ├── conventional_cashout.py
│   ├── dscr_cashout.py
│   ├── no_ratio.py
│   ├── sell_redeploy.py
│   ├── combination.py
│   └── bridge.py
└── tests/
    ├── conftest.py               # default-inputs fixture matching the workbook
    ├── test_portfolio.py         # sheet 3 cell-for-cell golden tests
    ├── test_strategies.py        # one golden per strategy (sheet 7 rows)
    ├── test_scoring.py           # weighting + ranking
    └── test_engine.py            # end-to-end on default workbook inputs
```

**Why per-strategy files instead of one big strategies.py:** Van said the
list is open. Each strategy file is the natural unit for "add a new
strategy" — one new module, one registry entry, no edits to existing
files. Also makes the per-strategy goldens easier to read.

---

## 4. Core abstractions

### 4.1 Strategy registry

```python
# strategies/base.py
from typing import Protocol
from portfolio.types import (
    PortfolioAnalytics, PortfolioEngineInputs, TargetProperty,
    ScoreDimensions,
)

class Strategy(Protocol):
    """A path-to-acquisition strategy.

    Implemented as a Protocol (not ABC) so each strategy can be a
    free-standing module with module-level functions, which keeps the
    code idiomatic to how the spreadsheet reads (row-by-row).
    """
    name: str
    """Human-readable strategy name. Matches sheet 7 column A."""

    product_logic_fit: str
    """Short tag from sheet 7 column T. e.g. 'Liquidity-driven',
       'Equity-access', 'Rental-income / DSCR'. Used for the consumer
       tradeoff line."""

    def capital_available(
        self,
        portfolio_analytics: PortfolioAnalytics,
        inputs: PortfolioEngineInputs,
    ) -> float:
        """How much capital this strategy can muster for this user."""
        ...

    def score_dimensions(
        self,
        portfolio_analytics: PortfolioAnalytics,
        inputs: PortfolioEngineInputs,
        target: TargetProperty,
        capital_available: float,
        capital_needed: float,
    ) -> ScoreDimensions:
        """All 8 score dimensions on a 0-100 scale (capital_coverage on
           0-1 then scaled up). Mirrors sheet 7 columns D-J + R."""
        ...

    def key_tradeoff(
        self,
        inputs: PortfolioEngineInputs,
        target: TargetProperty,
    ) -> str:
        """One-line tradeoff string. Mirrors sheet 7 column P."""
        ...

    def property_type_note(
        self,
        target: TargetProperty,
    ) -> str:
        """Property-type-specific note. Mirrors sheet 7 column S."""
        ...


# strategies/__init__.py
from .use_available_cash import strategy as use_available_cash
from .heloc import strategy as heloc
# ... etc

STRATEGY_REGISTRY: list[Strategy] = [
    use_available_cash,
    heloc,
    conventional_cashout,
    dscr_cashout,
    no_ratio,
    sell_redeploy,
    combination,
    bridge,
]
```

Adding a ninth strategy in the future = one new file `strategies/foo.py`
with a `strategy` module-level export + one line in
`STRATEGY_REGISTRY`. No existing strategy needs to change.

### 4.2 Score dimensions

Each strategy emits a fixed shape:

```python
# types.py
class ScoreDimensions(BaseModel):
    """All 8 dimensions on a 0-100 scale. Mirrors sheet 7 columns D-J + R."""
    capital_coverage: float    # 0-100 (sheet shows 0-1, we scale ×100 here)
    credit: float              # 0-100
    liquidity: float           # 0-100
    cash_flow: float           # 0-100
    eligibility: float         # 0-100
    complexity: float          # 0-100
    risk: float                # 0-100
    property_type_fit: float   # 0-100
```

### 4.3 Goal-weighted scoring

The weights are NOT user-tunable — they're determined by the goal. Stored
as a constant in `constants.py`:

```python
# constants.py
WEIGHTING_PROFILES: dict[InvestorGoal, dict[str, float]] = {
    InvestorGoal.BUILD_WEALTH:        { ... },   # to be filled from Van's matrix
    InvestorGoal.PASSIVE_INCOME:      { ... },
    InvestorGoal.PRESERVE_LIQUIDITY:  { ... },
    InvestorGoal.MINIMIZE_RISK:       { ... },
}

# Each profile maps to: {
#   'capital_coverage': float,
#   'credit': float,
#   'liquidity': float,
#   'cash_flow': float,
#   'eligibility': float,
#   'complexity': float,
#   'risk': float,
#   'property_type_fit': float,
# }
# Profile weights must sum to 1.0 (validated at import time).
```

The current spreadsheet hard-codes 25/15/10/15/20/7.5/7.5/10. Van's
forthcoming matrix replaces that with four goal-specific profiles.

`scoring.py` does the math:

```python
def weighted_score(
    dims: ScoreDimensions,
    profile: dict[str, float],
) -> float:
    return round(
        dims.capital_coverage  * profile['capital_coverage']
      + dims.credit            * profile['credit']
      + dims.liquidity         * profile['liquidity']
      + dims.cash_flow         * profile['cash_flow']
      + dims.eligibility       * profile['eligibility']
      + dims.complexity        * profile['complexity']
      + dims.risk              * profile['risk']
      + dims.property_type_fit * profile['property_type_fit'],
        0,
    )
```

---

## 5. Data types (Pydantic)

### Inputs

```python
class PortfolioProperty(BaseModel):
    property_type: PortfolioPropertyType  # Primary Residence | Investment | Vacation | ...
    use_status: PropertyUseStatus         # Owner-Occupied | Rented | Short-Term-Rented | Vacant
    current_value: float                  # ≥ 0
    mortgage_balance: float               # ≥ 0
    current_rate: float                   # decimal (0.062 not 6.2)
    monthly_pi: float
    monthly_taxes_ins_hoa: float
    monthly_rent: float                   # 0 if not rented
    monthly_opex: float

class UserProfile(BaseModel):
    credit_score_bucket: CreditScoreBucket
    income_profile: IncomeProfile         # W2 | Self-Employed | Other
    available_cash: float
    investor_goal: InvestorGoal           # BUILD_WEALTH | PASSIVE_INCOME | PRESERVE_LIQUIDITY | MINIMIZE_RISK
    risk_tolerance: RiskTolerance         # Conservative | Moderate | Aggressive
    time_horizon: TimeHorizon             # 1-3 yrs | 3-5 yrs | 5-10 yrs | 10+ yrs
    expected_annual_appreciation: float = 0.03
    estimated_closing_costs_pct: float = 0.03
    target_down_payment_pct: float = 0.25

class TargetProperty(BaseModel):
    property_type: TargetPropertyType     # the 6 V1 types
    purchase_price: float
    expected_monthly_rent: float
    expected_monthly_taxes_ins_hoa: float
    expected_operating_expenses: float
    estimated_interest_rate: float = 0.075
    amortization_years: int = 30
    down_payment_pct: float | None = None  # None → derive from property_type
    closing_costs_pct: float = 0.03

    # Fix & Flip — required only when property_type == FIX_AND_FLIP
    rehab_budget: float | None = None
    holding_costs: float | None = None
    arv: float | None = None

class PortfolioEngineInputs(BaseModel):
    user_profile: UserProfile
    current_portfolio: list[PortfolioProperty]
    target_property: TargetProperty
```

### Outputs

```python
class PropertyAnalytics(BaseModel):
    """Sheet 3 columns C-O per row."""
    property_id: str       # 'Property 1'…
    property_type: PortfolioPropertyType
    value: float
    mortgage_balance: float
    equity: float
    ltv: float
    monthly_pi: float
    pitia: float           # P&I + taxes/ins/HOA
    rent: float
    opex: float
    monthly_cash_flow: float
    estimated_dscr: float
    heloc_accessible_equity: float
    cash_out_accessible_equity: float
    dscr_or_no_ratio_accessible_equity: float

class PortfolioAnalytics(BaseModel):
    per_property: list[PropertyAnalytics]
    # Totals — sheet 3 summary rows
    total_value: float
    total_mortgage_balance: float
    total_equity: float
    total_monthly_cash_flow: float
    portfolio_dscr: float
    total_heloc_accessible_equity: float
    total_cash_out_accessible_equity: float
    total_accessible_equity: float   # heloc + cash-out + dscr/no-ratio, deduped

class StrategyResult(BaseModel):
    name: str
    capital_available: float
    capital_needed: float
    capital_coverage: float          # 0-1 (kept on natural scale here)
    score_dimensions: ScoreDimensions
    weighted_score: float            # 0-100
    rank: int                        # 1 = best
    recommendation_type: Literal["Recommended", "Alternative", "Stretch", "Other"]
    fit_label: Literal["strong", "possible", "lower-fit"]
    key_tradeoff: str
    property_type_note: str
    product_logic_fit: str           # e.g. 'Liquidity-driven'

class PortfolioEngineOutput(BaseModel):
    portfolio_analytics: PortfolioAnalytics
    target_capital_needed: float
    strategies: list[StrategyResult]       # all 8, sorted by rank
    recommendation: StrategyResult         # = strategies[0]
    alternative: StrategyResult | None     # = strategies[1] if rank-2 score within N of rank-1
```

**Note on recommendation/alternative:** sheet 9 takes top + 2nd. We
should probably suppress "alternative" if the gap is large (e.g.
recommendation is 85, alt is 32 — alt isn't an alternative, it's an
also-ran). Open question for Van.

---

## 6. Sheet → module mapping

| Workbook sheet              | V1 module                                | Notes                                                                  |
| --------------------------- | ---------------------------------------- | ---------------------------------------------------------------------- |
| 1_Inputs                    | `types.UserProfile`                      | All inputs typed; assumption defaults live here too                    |
| 2_Current_Portfolio         | `types.list[PortfolioProperty]`          | List, not fixed-10 — frontend handles list management                  |
| 3_Portfolio_Analytics       | `portfolio.py`                           | Pure deterministic — best golden-test surface                          |
| 4_Target_Property           | `types.TargetProperty` + `target.py`     | DP-by-property-type formula in `target.derive_down_payment_pct`        |
| 5_Product_Rules             | `constants.PRODUCT_RULES`                | All editable rules-of-thumb. Stays as a single source of truth         |
| 6_Strategy_Mapping          | (doc only; informs per-strategy modules) | Reference table — informs property_type_note() per strategy            |
| 7_Strategy_Scoring          | `strategies/*` + `scoring.py`            | Per-strategy code; weighting+rank in scoring.py                        |
| 8_Wealth_Projection         | **Deferred to V2**                       | Per Van                                                                |
| 9_Dashboard                 | `engine.run()` return value              | Engine emits structured output; UI does the layout                     |

---

## 7. Validation and edge cases

- **Empty portfolio** (no properties): user with $0 starting position
  considering a first investment property. All HELOC / cash-out
  strategies should report `capital_available=0`, eligibility=low. Only
  Use-Available-Cash / Sell-Redeploy(*N/A*) / Combination / Bridge
  meaningfully apply.
- **Fix & Flip target with no rehab inputs:** validate at input boundary.
  `TargetProperty.model_validator` raises if `property_type=FIX_AND_FLIP`
  and any of `rehab_budget`, `holding_costs`, `arv` is None.
- **DSCR=0 (no rent)** on a property: `dscr_cashout` should produce
  `capital_available=0` for that row — sheet 7's SUMIFS already handles
  this implicitly.
- **All strategies score 0**: still return a sorted list, but flag the
  recommendation with a special `fit_label="lower-fit"` and a different
  `recommendation_type`. Downstream UI shows "we don't see a strong path
  here — talk to a professional" rather than "Recommended."
- **Strategy ties:** sheet uses `RANK + COUNTIF` tiebreak (essentially
  preserves order). We'll mirror that — ties broken by strategy
  registration order, with `strategies[0]` being the default winner on
  exact ties.

---

## 8. Golden test strategy

Same pattern that worked for FTHB:

1. **Default-inputs fixture** mirrors the workbook's default values
   exactly (the values in the cells when Van handed it over).
2. **One golden file per sheet**, asserting each cell value the engine
   reproduces matches the spreadsheet's computed value to 2 dp (currency)
   / 4 dp (rates) / exact integer (scores, ranks).
3. **Recalc the workbook with LibreOffice** to get the live values, then
   freeze them into the goldens.
4. **One end-to-end test** that runs `engine.run(default_inputs)` and
   checks the recommended strategy + rank order matches sheet 9 + sheet 7
   column L.

This is what catches the kind of bug that would otherwise ship: an
off-by-one in the LTV formula, or a wrong product rule constant. The
spreadsheet stays the spec until the goldens replace it.

---

## 9. What the engine does NOT produce

The structured output is the entire engine surface. It does NOT produce:

- **Consumer-facing prose** (sheet 7 column M, sheet 9 column B for the
  consumer explanation). Those are AI-Coach territory. The engine emits
  structured fields (`recommendation_type`, `fit_label`, `key_tradeoff`,
  `property_type_note`, `product_logic_fit`); the AI Coach layer
  composes the prose explanation with the same structured-context
  pattern from the Master System Prompt.

- **Wealth projections** (sheet 8). Deferred to V2.

- **Lead-routing recommendations.** The engine names a strategy; the
  existing pipeline-button UX handles partner routing.

This keeps the engine as a pure function of its inputs — fully testable,
deterministic, no LLM calls — and the AI layer handles everything that
needs to feel human.

---

## 10. Open questions

1. **Weighting matrix.** Van said "see attached matrix." Need it before
   golden tests are meaningful. Numbers in this doc are placeholders.

2. **Long-Term Rental = Single-Family Rental?** Assuming yes. Confirm.

3. **Alternative suppression threshold.** When the rank-2 strategy is far
   below rank-1, should we surface it at all? Suggested rule: only
   surface alternative if `(rank1 - rank2) <= 20` *or* the alternative's
   `capital_coverage >= 1` (it can fund the deal). Open for discussion.

4. **DSCR Cash-Out on commercial multifamily.** Sheet 7 mostly treats
   DSCR Cash-Out as a residential investment strategy. With Commercial
   Multifamily 5+ in V1, we need explicit logic for whether DSCR
   strategies apply to 5+ unit (typically they don't — that's where
   "commercial multifamily" specific financing lives). Easy: either
   add a property-type guard inside the DSCR strategy, or surface
   "Commercial multifamily" only routes to the Bridge / Conventional /
   Combination strategies and a future "Commercial Cash-Out" strategy.
   Need Van's call.

5. **Investor pipeline.** The existing `pipeline` enum is
   `financial-planner | real-estate-agent | mortgage-broker`. Portfolio
   investors typically want a DSCR lender, a commercial broker, or a
   1031 specialist. Deferred to a separate scope conversation, but worth
   noting before the schema lands.

6. **Portfolio limit.** Workbook caps at 10 properties. Worth raising —
   we're a target audience for larger portfolios. Proposed: no hard cap
   in the data model; soft UI cap at e.g. 25.

---

## 11. Estimated build size

| Phase                                                | Estimate    | Sequencing       |
| ---------------------------------------------------- | ----------- | ---------------- |
| Engine + golden tests (this spec → green pytest)     | ~1.5 weeks  | Blocks all else  |
| Schema migration + API endpoints                     | 2-3 days    | After engine     |
| Frontend (page + portfolio-entry table + wizard)     | ~1 week     | After API        |
| Intake fork (Onboarding step 2 three-way)            | 1 day       | After frontend   |
| Hooking into AI Coach (after V1.1 prompt + harness)  | Separate    | After AI lands   |

Total to "investors can run the engine and see recommendations":
roughly 3 weeks of focused work.

---

## 12. Decisions to confirm before any code

Marked as a checklist so Van and Katie can mark them off:

- [ ] **Module structure** (§3) — fine?
- [ ] **Strategy as Protocol with module-level export** (§4.1) vs. a
      single big strategies.py — picking the abstraction now matters most
- [ ] **Goal-weighted scoring** as `WEIGHTING_PROFILES[goal][dimension]`
      (§4.3) — once the matrix lands, this is the shape we pour it into
- [ ] **Data types** (§5) — any fields missing or named wrong?
- [ ] **Recommendation suppression rule** (§7, §10 #3)
- [ ] **Long-Term Rental == Single-Family Rental** (§10 #2)
- [ ] **DSCR vs Commercial Multifamily** (§10 #4)
- [ ] **Soft 25-property cap** (§10 #6)

Once these are signed off, I open a feature branch and start with sheet 3
(`portfolio.py`) — pure deterministic, easiest first golden, builds
confidence in the test setup before tackling strategy scoring.
