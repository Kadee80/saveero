/**
 * FTHBDecisionMap — first-time-homebuyer decision-engine surface.
 *
 * Counterpart to DecisionMap.tsx (which serves the homeowner engine).
 * Same engine-call → comparison-table → recommendation-snapshot →
 * per-scenario-detail flow, scoped to the five FTHB scenarios:
 *
 *   Continue Renting · Buy Starter · Buy Preferred · Buy with DPA · Delay
 *
 * The page reads from /api/fthb/scenarios/run — one round-trip returns
 * everything it needs (5 scenarios + decision map + audit). On every
 * input change the user explicitly hits Recalculate; we don't auto-run
 * because the input fields are typed number inputs and an on-change
 * debounce would either lag or thrash the engine.
 *
 * Inputs are collected through a 3-step wizard (matching the
 * OnboardingWizard pattern — the #1 demo-feedback theme was that
 * form-heavy pages overwhelm users):
 *
 *   1. Financial profile  — income, debts, cash, down payment, credit
 *   2. Home goals         — rent, starter + preferred prices, horizon
 *   3. Advanced (optional) — system assumptions (rate, tax %, DPA, …),
 *                            all pre-filled to the spreadsheet defaults
 *
 * Step 3's "Recalculate" runs the engine. The wizard stays mounted so
 * the user can step back and tweak; results render below it.
 *
 * @component
 * @returns {JSX.Element}
 */
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  Building2,
  Check,
  Clock,
  Compass,
  DollarSign,
  Home,
  KeyRound,
  Percent,
  Receipt,
  Save,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn, formatCurrency } from '@/lib/utils'
import { SCENARIO_PALETTE } from '@/lib/chartPalette'
import { trackActivity } from '@/api/leadsApi'
import { InputCollector, type WizardStep } from '@/components/InputWizard'
import {
  DEFAULT_FTHB_INPUTS,
  getFthbAnalysis,
  runAllFthb,
  saveFthbAnalysis,
  type FTHBInputs,
  type RunAllResponse,
  type ScenarioComparisonRowOut,
} from '@/api/fthbApi'

// ---------------------------------------------------------------------------
// Per-scenario palette and icon binding. Mirrors the decision-map ordering
// in the API response so the comparison table, recommendation card, and
// detail cards share one visual language.
// ---------------------------------------------------------------------------

const SCENARIO_META: Record<
  string,
  { color: string; icon: typeof Home; blurb: string }
> = {
  'Continue Renting': {
    color: SCENARIO_PALETTE.blue,
    icon: Home,
    blurb: 'Keep renting; invest the available cash and accumulate savings.',
  },
  'Buy Starter Home': {
    color: SCENARIO_PALETTE.violet,
    icon: KeyRound,
    blurb: 'Buy the lower-priced entry home at the universal down payment.',
  },
  'Buy Preferred Home': {
    color: SCENARIO_PALETTE.emerald,
    icon: Building2,
    blurb: 'Buy the higher-priced "reach" home at the same down payment.',
  },
  'Buy with Assistance': {
    color: SCENARIO_PALETTE.amber,
    icon: DollarSign,
    blurb: 'Starter home + downpayment assistance (50bps higher rate).',
  },
  'Delay Purchase': {
    color: SCENARIO_PALETTE.rose,
    icon: Clock,
    blurb: 'Wait one year; save more; reassess.',
  },
}

function metaFor(name: string) {
  return (
    SCENARIO_META[name] ?? {
      color: SCENARIO_PALETTE.blue,
      icon: Home,
      blurb: '',
    }
  )
}

// ---------------------------------------------------------------------------
// Input wizard steps — fed to the shared InputCollector. Steps 1-2 are the
// consumer-facing inputs; steps 3-6 are the system assumptions, split into
// focused groups. The InputCollector renders these as a step wizard
// (default for consumers) or a dense all-fields form (default for pros).
//
// Values live as canonical FTHBInputs (decimals for percents) — the shared
// FieldControl handles the whole-number-percent display conversion, so
// `kind: 'percent'` fields just work.
// ---------------------------------------------------------------------------

const FTHB_STEPS: WizardStep[] = [
  {
    title: 'Your financial profile',
    icon: Wallet,
    description: 'Income, debts, and the cash you have to work with.',
    fields: [
      { key: 'annual_household_income',     label: 'Annual household income', kind: 'money', hint: 'Gross — before tax.' },
      { key: 'monthly_debt_obligations',    label: 'Monthly debt obligations', kind: 'money', hint: 'Student loans, auto, credit cards.' },
      { key: 'available_cash_for_purchase', label: 'Available cash for purchase', kind: 'money', hint: 'Total cash for down + closing.' },
      { key: 'universal_down_payment',      label: 'Down payment used', kind: 'money', hint: 'Same down payment for every buy scenario.' },
      { key: 'estimated_credit_score',      label: 'Estimated credit score', kind: 'number', hint: 'Used for product/pricing context.' },
    ],
  },
  {
    title: 'Your home goals',
    icon: Home,
    description: 'What you pay in rent today and the price points you’re weighing.',
    fields: [
      { key: 'current_monthly_rent', label: 'Current monthly rent', kind: 'money', hint: 'What you pay today.' },
      { key: 'starter_home_price',   label: 'Starter home target price', kind: 'money', hint: 'Lower entry-point option.' },
      { key: 'preferred_home_price', label: 'Preferred home target price', kind: 'money', hint: 'Aspirational / "reach" option.' },
      { key: 'horizon_years',        label: 'Comparison horizon', kind: 'years', hint: 'How long you plan to stay.' },
    ],
  },
  {
    title: 'Rates & term',
    icon: Percent,
    description: 'Pre-filled to the model defaults — tweak only what you want to override.',
    fields: [
      { key: 'mortgage_rate',        label: 'Mortgage interest rate', kind: 'percent', hint: 'Standard financing rate.' },
      { key: 'mortgage_term_months', label: 'Mortgage term', kind: 'months', hint: 'Amortization period.' },
    ],
  },
  {
    title: 'Costs & taxes',
    icon: Receipt,
    description: 'Closing, carrying, and upkeep assumptions.',
    fields: [
      { key: 'purchase_closing_cost_pct', label: 'Purchase closing cost', kind: 'percent', hint: '% of purchase price.' },
      { key: 'property_tax_annual_pct',   label: 'Property tax (annual)', kind: 'percent', hint: '% of home value per year.' },
      { key: 'insurance_annual_pct',      label: 'Insurance (annual)', kind: 'percent', hint: '% of home value per year.' },
      { key: 'monthly_hoa',               label: 'Monthly HOA', kind: 'money', hint: 'Condo / association fee.' },
      { key: 'maintenance_annual_pct',    label: 'Maintenance reserve (annual)', kind: 'percent', hint: '% of home value per year.' },
    ],
  },
  {
    title: 'Growth assumptions',
    icon: TrendingUp,
    description: 'How home value, rent, and cash grow over the horizon.',
    fields: [
      { key: 'annual_home_appreciation', label: 'Annual home appreciation', kind: 'percent', hint: 'Home value growth rate.' },
      { key: 'annual_rent_inflation',    label: 'Annual rent inflation', kind: 'percent', hint: 'Rent growth rate.' },
      { key: 'return_on_unspent_cash',   label: 'Return on unspent cash', kind: 'percent', hint: 'Growth rate on cash not used to buy.' },
      { key: 'take_home_pct',            label: 'Take-home % of gross income', kind: 'percent', hint: 'Gross-to-take-home haircut.' },
    ],
  },
  {
    title: 'Feasibility & assistance',
    icon: Compass,
    description: 'Lender limits, liquidity cushions, and downpayment assistance.',
    fields: [
      { key: 'max_dti',                label: 'Max DTI allowed', kind: 'percent', hint: 'Lender debt-to-income ceiling.' },
      { key: 'post_close_cushion_pct', label: 'Post-close cushion', kind: 'percent', hint: '% of cash kept as a liquidity warning threshold.' },
      { key: 'min_post_close_cushion', label: 'Minimum cash cushion', kind: 'money', hint: 'Dollar floor for the cushion check.' },
      { key: 'available_dpa',          label: 'Downpayment assistance', kind: 'money', hint: 'Repayable DPA amount.' },
      { key: 'delay_monthly_savings',  label: 'Delay scenario monthly savings', kind: 'money', hint: 'Extra saved each month during the 12-month delay.' },
    ],
  },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FTHBDecisionMap() {
  const [inputs, setInputs] = useState<FTHBInputs>(DEFAULT_FTHB_INPUTS)
  const [result, setResult] = useState<RunAllResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Wizard step index (0-based) the input collector is showing. Persists
  // across recalcs so a user who tweaked a later-step field and ran it
  // stays on that step rather than getting bounced to step 1.
  const [step, setStep] = useState(0)

  // ?analysis=<id> deep-link from the Dashboard's "Recent calculations"
  // panel: load that saved analysis instead of running defaults.
  const [searchParams] = useSearchParams()
  const analysisId = searchParams.get('analysis')

  // Initial load on mount. With ?analysis=<id> we hydrate from the saved
  // row (no recompute — the saved result blob is authoritative). Without
  // it we run defaults so the comparison + snapshot populate immediately
  // rather than showing an empty "click Recalculate" state.
  useEffect(() => {
    if (analysisId) {
      getFthbAnalysis(analysisId)
        .then((saved) => {
          setInputs(saved.inputs)
          setResult(saved.result)
        })
        .catch((err: unknown) => {
          const msg =
            err instanceof Error ? err.message : 'Could not load saved analysis'
          setError(`${msg} — showing defaults instead.`)
          void recalc(DEFAULT_FTHB_INPUTS)
        })
    } else {
      void recalc(inputs)
    }
    // Fire once on mount; subsequent runs are user-initiated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function recalc(next: FTHBInputs) {
    setLoading(true)
    setError(null)
    try {
      const r = await runAllFthb(next)
      setResult(r)
      // CRM activity tag — same convention as the homeowner engine
      // ('ran_*' bumps lead status to 'active').
      trackActivity('ran_fthb_decision_map', {
        best: r.decision_map.recommendation.best_executable_path,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not run engine'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  // Loose signature so it satisfies InputCollector's onChange contract.
  // Keys are always FTHBInputs keys in practice (they come from FTHB_STEPS).
  function setField(key: string, value: number | boolean) {
    setInputs((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 md:py-10">
      <header>
        <div className="flex items-center gap-2">
          <Sparkles
            className="h-5 w-5"
            style={{ color: SCENARIO_PALETTE.blue }}
          />
          <span
            className="text-sm font-semibold uppercase tracking-wide"
            style={{ color: SCENARIO_PALETTE.blue }}
          >
            First-time homebuyer · Decision Map
          </span>
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
          Five paths, one comparison
        </h1>
        <p className="mt-2 max-w-2xl text-stone-600">
          Continue renting, buy a starter, buy your "reach" home, buy with
          downpayment assistance, or wait. Same horizon, same cash, same
          rate — net position side by side, with monthly housing cost and
          future savings capacity baked in.
        </p>
      </header>

      <InputCollector
        steps={FTHB_STEPS}
        values={inputs as unknown as Record<string, number | boolean>}
        onChange={setField}
        onFinish={() => recalc(inputs)}
        step={step}
        onStepChange={setStep}
        loading={loading}
        accentColor={SCENARIO_PALETTE.blue}
        storageKey="saveero.fthb.inputview"
      />

      {error && (
        <div
          className="rounded-lg border px-4 py-3 text-sm"
          style={{
            color: '#b85844',
            borderColor: '#b8584433',
            backgroundColor: '#b858440a',
          }}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {result && (
        <>
          <RecommendationCard recommendation={result.decision_map.recommendation} />
          <SaveBar inputs={inputs} result={result} />
          <ComparisonTable rows={result.decision_map.comparison} />
          <ScenarioDetailGrid result={result} />
        </>
      )}

      {!result && !error && (
        <p className="py-12 text-center text-sm text-stone-500">
          {loading ? 'Running…' : 'Click Recalculate to model your inputs.'}
        </p>
      )}
    </div>
  )
}


// ---------------------------------------------------------------------------
// Recommendation snapshot card — Outputs!B12-B18 in the spreadsheet.
// ---------------------------------------------------------------------------

function RecommendationCard({
  recommendation,
}: {
  recommendation: RunAllResponse['decision_map']['recommendation']
}) {
  const bestMeta = metaFor(recommendation.best_executable_path)

  return (
    <section
      className="rounded-xl bg-card p-6 shadow-md ring-1 ring-border md:p-8"
      style={{ borderTopColor: bestMeta.color, borderTopWidth: 4 }}
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4" style={{ color: bestMeta.color }} />
        <span
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: bestMeta.color }}
        >
          Recommendation
        </span>
      </div>
      <h2 className="mt-3 text-2xl font-bold tracking-tight md:text-3xl">
        Best executable path:{' '}
        <span style={{ color: bestMeta.color }}>
          {recommendation.best_executable_path}
        </span>
      </h2>
      <p className="mt-2 text-sm text-stone-600">
        Net position at horizon:{' '}
        <strong>{formatCurrency(recommendation.best_net_position)}</strong>
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <RecPick
          label="Best monthly affordability"
          value={recommendation.best_monthly_affordability}
        />
        <RecPick
          label="Best savings capacity"
          value={recommendation.best_savings_capacity}
        />
        <RecPick
          label="Lowest cash required"
          value={recommendation.lowest_cash_required}
        />
      </div>

      {recommendation.actionable_insight && (
        <div className="mt-6 rounded-lg border border-border bg-stone-50/60 p-4">
          <p className="text-sm leading-relaxed text-stone-700">
            {recommendation.actionable_insight}
          </p>
        </div>
      )}
    </section>
  )
}

function RecPick({ label, value }: { label: string; value: string }) {
  const meta = metaFor(value)
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-stone-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold tracking-tight" style={{ color: meta.color }}>
        {value}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Save bar — names + persists the current analysis. Mirrors the mortgage
// calculator's save affordance. Requires an active session; if the user
// isn't signed in the save call throws and we surface that inline rather
// than hiding the control (the page itself is behind auth anyway).
// ---------------------------------------------------------------------------

function SaveBar({
  inputs,
  result,
}: {
  inputs: FTHBInputs
  result: RunAllResponse
}) {
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Any input change since the last save invalidates the "Saved ✓" state
  // — clear it so the user knows the new numbers aren't persisted yet.
  useEffect(() => {
    setSavedId(null)
  }, [inputs, result])

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const { id } = await saveFthbAnalysis({
        label: label.trim() || undefined,
        inputs,
        result,
      })
      setSavedId(id)
      trackActivity('saved_fthb_analysis', {
        best: result.decision_map.recommendation.best_executable_path,
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-xl bg-card p-4 shadow-sm ring-1 ring-border">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex-1">
          <span className="sr-only">Name this scenario</span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Name this scenario — e.g. &quot;7-year horizon, $90k cash&quot;"
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-1"
          />
        </label>
        <Button
          type="button"
          disabled={saving}
          onClick={handleSave}
          style={{ backgroundColor: SCENARIO_PALETTE.blue }}
          className="shadow-sm"
        >
          {savedId ? (
            <>
              <Check className="mr-1.5 h-4 w-4" /> Saved
            </>
          ) : (
            <>
              <Save className="mr-1.5 h-4 w-4" />
              {saving ? 'Saving…' : 'Save analysis'}
            </>
          )}
        </Button>
      </div>
      {error && (
        <p className="mt-2 text-xs" style={{ color: '#b85844' }}>
          {error}
        </p>
      )}
      {savedId && !error && (
        <p className="mt-2 text-xs text-stone-500">
          Saved to your dashboard — find it under Recent calculations.
        </p>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Comparison table — Outputs sheet rows 5-9.
// ---------------------------------------------------------------------------

function ComparisonTable({ rows }: { rows: ScenarioComparisonRowOut[] }) {
  return (
    <section className="overflow-hidden rounded-xl bg-card shadow-md ring-1 ring-border">
      <header className="border-b border-border bg-stone-50/40 px-6 py-4">
        <h2 className="text-base font-semibold tracking-tight">
          Scenario comparison
        </h2>
        <p className="mt-1 text-xs text-stone-500">
          Net position = equity at horizon + future value of remaining cash
          + projected savings accumulation.
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Scenario</th>
              <th className="px-4 py-3 text-right font-semibold">Net Position</th>
              <th className="px-4 py-3 text-right font-semibold">Monthly Cost</th>
              <th className="px-4 py-3 text-right font-semibold">Residual Savings/mo</th>
              <th className="px-4 py-3 text-right font-semibold">Cash Required</th>
              <th className="px-4 py-3 text-right font-semibold">Equity at Horizon</th>
              <th className="px-4 py-3 text-left font-semibold">Feasibility</th>
              <th className="px-4 py-3 text-left font-semibold">Risk</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const meta = metaFor(row.scenario)
              return (
                <tr key={row.scenario} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: meta.color }}
                      />
                      <span className="font-medium">{row.scenario}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {formatCurrency(row.net_position)}
                  </td>
                  <td className="px-4 py-3 text-right text-stone-700">
                    {row.monthly_cost === null
                      ? <span className="text-stone-400">—</span>
                      : formatCurrency(row.monthly_cost)}
                  </td>
                  <td className="px-4 py-3 text-right text-stone-700">
                    {formatCurrency(row.residual_monthly_savings)}
                  </td>
                  <td className="px-4 py-3 text-right text-stone-700">
                    {formatCurrency(row.cash_required)}
                  </td>
                  <td className="px-4 py-3 text-right text-stone-700">
                    {row.equity_at_horizon > 0
                      ? formatCurrency(row.equity_at_horizon)
                      : <span className="text-stone-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <FeasibilityChip status={row.feasibility} />
                  </td>
                  <td className="px-4 py-3">
                    <RiskChip risk={row.risk} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function FeasibilityChip({ status }: { status: string }) {
  const ok = status === 'Feasible'
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        backgroundColor: ok ? `${SCENARIO_PALETTE.emerald}1a` : '#b8584414',
        color: ok ? SCENARIO_PALETTE.emerald : '#b85844',
      }}
    >
      {ok && <Check className="mr-1 h-3 w-3" />}
      {status}
    </span>
  )
}

function RiskChip({ risk }: { risk: string }) {
  // Simple lookup — keeps the chip color tied to the qualitative risk
  // string emitted by the engine. "Higher" only appears on the Preferred
  // sheet's last branch — same color as Moderate.
  const color =
    risk === 'High'           ? '#b85844'
  : risk === 'Thin Liquidity' ? SCENARIO_PALETTE.amber
  : risk === 'Cash Flow Tight' ? SCENARIO_PALETTE.amber
  : risk === 'Higher'         ? SCENARIO_PALETTE.violet
  : risk === 'Moderate'       ? SCENARIO_PALETTE.violet
  :                             SCENARIO_PALETTE.emerald
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: `${color}14`, color }}
    >
      {risk}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Per-scenario detail grid — five cards, each summarizing one scenario's
// most-relevant fields. Lighter detail than DecisionMap.tsx (no charts in
// this MVP); the Outputs comparison + recommendation already do the
// heavy lifting.
// ---------------------------------------------------------------------------

function ScenarioDetailGrid({ result }: { result: RunAllResponse }) {
  return (
    <section className="grid gap-4 md:grid-cols-2">
      <RentingDetail r={result.continue_renting} />
      <BuyDetail name="Buy Starter Home" r={result.buy_starter} />
      <BuyDetail name="Buy Preferred Home" r={result.buy_preferred} />
      <BuyDetail name="Buy with Assistance" r={result.buy_with_assistance} note="50bps rate premium · DPA repaid at horizon" />
      <DelayDetail r={result.delay_purchase} />
    </section>
  )
}

function DetailCard({
  name,
  note,
  children,
}: {
  name: string
  note?: string
  children: React.ReactNode
}) {
  const meta = metaFor(name)
  const Icon = meta.icon
  return (
    <article
      className="rounded-xl bg-card p-5 shadow-sm ring-1 ring-border"
      style={{ borderLeftColor: meta.color, borderLeftWidth: 4 }}
    >
      <header className="flex items-start gap-3">
        <div
          className="inline-flex rounded-md p-2"
          style={{ backgroundColor: `${meta.color}1a` }}
        >
          <Icon className="h-4 w-4" style={{ color: meta.color }} />
        </div>
        <div>
          <h3 className="text-base font-semibold tracking-tight">{name}</h3>
          <p className="mt-0.5 text-xs text-stone-600">{meta.blurb}</p>
          {note && (
            <p className="mt-1 text-[11px] italic text-stone-500">{note}</p>
          )}
        </div>
      </header>
      <dl className="mt-4 grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
        {children}
      </dl>
    </article>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
        {label}
      </dt>
      <dd className="text-right font-medium text-stone-800">{value}</dd>
    </>
  )
}

function RentingDetail({ r }: { r: RunAllResponse['continue_renting'] }) {
  return (
    <DetailCard name="Continue Renting">
      <DetailRow label="Cumulative rent paid" value={formatCurrency(r.cumulative_rent_paid)} />
      <DetailRow label="FV of available cash" value={formatCurrency(r.future_value_of_available_cash)} />
      <DetailRow label="Residual savings/mo" value={formatCurrency(r.residual_monthly_savings)} />
      <DetailRow label="Savings accumulation" value={formatCurrency(r.projected_savings_accumulation)} />
      <DetailRow label="Total net position" value={formatCurrency(r.total_net_position)} />
    </DetailCard>
  )
}

function BuyDetail({
  name,
  r,
  note,
}: {
  name: string
  r: RunAllResponse['buy_starter']
  note?: string
}) {
  return (
    <DetailCard name={name} note={note}>
      <DetailRow label="Cash to close" value={formatCurrency(r.total_cash_required_at_close)} />
      <DetailRow label="Loan amount" value={formatCurrency(r.new_loan_amount)} />
      <DetailRow label="Monthly P&I" value={formatCurrency(r.monthly_principal_and_interest)} />
      <DetailRow label="All-in monthly" value={formatCurrency(r.total_monthly_housing_payment)} />
      <DetailRow label="DTI" value={`${(r.dti * 100).toFixed(1)}%`} />
      <DetailRow label="Equity at horizon" value={formatCurrency(r.net_equity_at_horizon)} />
      <DetailRow label="Residual savings/mo" value={formatCurrency(r.residual_monthly_savings)} />
      <DetailRow label="Total net position" value={formatCurrency(r.total_net_position)} />
    </DetailCard>
  )
}

function DelayDetail({ r }: { r: RunAllResponse['delay_purchase'] }) {
  return (
    <DetailCard name="Delay Purchase" note={`${r.recommended_delay_months}-month wait`}>
      <DetailRow label="Extra savings during wait" value={formatCurrency(r.projected_additional_savings)} />
      <DetailRow label="Cash after delay" value={formatCurrency(r.projected_available_cash_after_delay)} />
      <DetailRow label="Surplus vs. starter" value={formatCurrency(r.projected_cash_surplus_or_shortfall)} />
      <DetailRow label="Residual savings/mo" value={formatCurrency(r.residual_monthly_savings_while_renting)} />
      <DetailRow label="Future net position" value={formatCurrency(r.total_net_position)} />
    </DetailCard>
  )
}

