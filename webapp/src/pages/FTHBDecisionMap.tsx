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
 * because some of the input fields are typed text inputs and an
 * on-change debounce would either lag or thrash the engine.
 *
 * MVP scope (per Katie 2026-05-13): the 8 most user-visible inputs
 * (income, debts, cash, down payment, rent, starter price, preferred
 * price, horizon) are exposed in the input panel; the rest stay at
 * Excel defaults. A future pass can surface the system assumptions
 * (rate, tax %, DPA amount, etc.) via an "Advanced" disclosure when
 * the audience wants to override them.
 *
 * @component
 * @returns {JSX.Element}
 */
import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronDown,
  Clock,
  Compass,
  DollarSign,
  Home,
  KeyRound,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn, formatCurrency } from '@/lib/utils'
import { SCENARIO_PALETTE } from '@/lib/chartPalette'
import { trackActivity } from '@/api/leadsApi'
import {
  DEFAULT_FTHB_INPUTS,
  runAllFthb,
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
// Input panel — exposes the 8 most consequential fields. Everything else
// stays at the Excel defaults. The panel collapses to a one-line summary
// once the user has run at least once, so the comparison stays in view.
// ---------------------------------------------------------------------------

interface VisibleInputs {
  annual_household_income: number
  monthly_debt_obligations: number
  available_cash_for_purchase: number
  universal_down_payment: number
  current_monthly_rent: number
  starter_home_price: number
  preferred_home_price: number
  horizon_years: number
}

const VISIBLE_FIELDS: Array<{
  key: keyof VisibleInputs
  label: string
  hint: string
  prefix?: string
  suffix?: string
}> = [
  { key: 'annual_household_income',     label: 'Annual household income', hint: 'Gross — before tax.', prefix: '$' },
  { key: 'monthly_debt_obligations',    label: 'Monthly debt obligations', hint: 'Student loans, auto, credit cards.', prefix: '$' },
  { key: 'available_cash_for_purchase', label: 'Available cash for purchase', hint: 'Total cash for down + closing.', prefix: '$' },
  { key: 'universal_down_payment',      label: 'Down payment used', hint: 'Same down payment for every buy scenario.', prefix: '$' },
  { key: 'current_monthly_rent',        label: 'Current monthly rent', hint: 'What you pay today.', prefix: '$' },
  { key: 'starter_home_price',          label: 'Starter home target price', hint: 'Lower entry-point option.', prefix: '$' },
  { key: 'preferred_home_price',        label: 'Preferred home target price', hint: 'Aspirational / "reach" option.', prefix: '$' },
  { key: 'horizon_years',               label: 'Comparison horizon', hint: 'How long you plan to stay.', suffix: 'years' },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FTHBDecisionMap() {
  // We keep the full FTHBInputs around — visible fields are a slice of it,
  // but the engine call wants all of them. Hidden fields stay at default.
  const [inputs, setInputs] = useState<FTHBInputs>(DEFAULT_FTHB_INPUTS)
  const [result, setResult] = useState<RunAllResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inputsOpen, setInputsOpen] = useState(true)

  // Initial run on mount with default inputs so the comparison + snapshot
  // are populated immediately — no "click Recalculate to see anything"
  // empty state.
  useEffect(() => {
    void recalc(inputs)
    // We intentionally only fire once on mount; subsequent runs are
    // user-initiated via the Recalculate button.
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

  function setField<K extends keyof FTHBInputs>(key: K, value: FTHBInputs[K]) {
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

      <InputPanel
        inputs={inputs}
        setField={setField}
        open={inputsOpen}
        onToggle={() => setInputsOpen((o) => !o)}
        onRecalc={() => recalc(inputs)}
        loading={loading}
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
// Input panel
// ---------------------------------------------------------------------------

interface InputPanelProps {
  inputs: FTHBInputs
  setField: <K extends keyof FTHBInputs>(key: K, value: FTHBInputs[K]) => void
  open: boolean
  onToggle: () => void
  onRecalc: () => void
  loading: boolean
}

function InputPanel({
  inputs,
  setField,
  open,
  onToggle,
  onRecalc,
  loading,
}: InputPanelProps) {
  return (
    <section
      className="overflow-hidden rounded-xl bg-card shadow-md ring-1 ring-border"
      style={{ borderTopColor: SCENARIO_PALETTE.blue, borderTopWidth: 4 }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left hover:bg-stone-50"
        aria-expanded={open}
        aria-controls="fthb-input-grid"
      >
        <div className="flex items-center gap-3">
          <Compass
            className="h-5 w-5 shrink-0"
            style={{ color: SCENARIO_PALETTE.blue }}
          />
          <div>
            <h2 className="text-base font-semibold tracking-tight">
              Your inputs
            </h2>
            <p className="mt-0.5 text-xs text-stone-500">
              {open
                ? 'Edit the numbers below, then Recalculate.'
                : `Income ${formatCurrency(inputs.annual_household_income)} · Cash ${formatCurrency(inputs.available_cash_for_purchase)} · Horizon ${inputs.horizon_years}y`}
            </p>
          </div>
        </div>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-stone-500 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <>
          <div
            id="fthb-input-grid"
            className="grid gap-4 border-t border-border p-6 sm:grid-cols-2"
          >
            {VISIBLE_FIELDS.map((f) => (
              <NumberField
                key={f.key}
                label={f.label}
                hint={f.hint}
                prefix={f.prefix}
                suffix={f.suffix}
                value={inputs[f.key] as number}
                onChange={(v) => setField(f.key, v as FTHBInputs[typeof f.key])}
              />
            ))}
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-border bg-stone-50/50 px-6 py-4">
            <p className="mr-auto text-xs text-stone-500">
              System assumptions (rate, tax %, etc.) stay at Excel defaults.
            </p>
            <Button
              type="button"
              size="lg"
              disabled={loading}
              onClick={onRecalc}
              style={{ backgroundColor: SCENARIO_PALETTE.blue }}
              className="shadow-md"
            >
              <RefreshCw className={cn('mr-1.5 h-4 w-4', loading && 'animate-spin')} />
              {loading ? 'Running…' : 'Recalculate'}
            </Button>
          </div>
        </>
      )}
    </section>
  )
}

function NumberField({
  label,
  hint,
  prefix,
  suffix,
  value,
  onChange,
}: {
  label: string
  hint: string
  prefix?: string
  suffix?: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wide text-stone-500">
        {label}
      </span>
      <div className="mt-1.5 flex items-center rounded-md border border-border bg-card focus-within:border-stone-400 focus-within:ring-1">
        {prefix && (
          <span className="select-none px-3 text-sm text-stone-500">
            {prefix}
          </span>
        )}
        <input
          type="number"
          value={Number.isFinite(value) ? value : ''}
          onChange={(e) => {
            const n = e.target.value === '' ? 0 : Number(e.target.value)
            if (!Number.isNaN(n)) onChange(n)
          }}
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm focus:outline-none"
          style={{ paddingLeft: prefix ? 0 : undefined }}
        />
        {suffix && (
          <span className="select-none px-3 text-sm text-stone-500">
            {suffix}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-stone-500">{hint}</p>
    </label>
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

