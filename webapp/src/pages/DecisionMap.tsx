/**
 * Decision Map — Saveero's differentiated home-decision analyzer.
 *
 * This page is the front-end to the `/api/scenarios/*` engine, which is a
 * bit-for-bit port of the client-supplied
 * `FINAL_V1_Protected_Home Decision_Model` Excel workbook (8 sheets, 45 input
 * rows, 9 audit checks). Every number you see here ties to an Excel cell
 * within $0.0001.
 *
 * This is intentionally NOT the same page as `ScenarioComparison` — that
 * page is the generic mortgage-only compare that may be sold off as a
 * simpler product. This one is the full five-scenario decision model with
 * the Decision Map recommendation layer on top.
 *
 * V1 scope (agreed with user):
 *   - Inputs form seeded from Excel column-B defaults.
 *   - Explicit "Recalculate" button. No live-edit wizardry.
 *   - Renders Decision Map + 5 scenario detail cards + Audit strip.
 *   - No NPV / no sliders / no charts — deferred to post-V1.
 */
import { useCallback, useState } from 'react'
import {
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Home,
  TrendingUp,
  Building2,
  Banknote,
  KeyRound,
  PiggyBank,
  Compass,
} from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  DEFAULT_INPUTS,
  runAll,
  type MasterInputs,
  type RunAllResponse,
  type ComparisonRowOut,
} from '@/api/scenarioApi'

// ---------------------------------------------------------------------------
// Form state — the only thing we do to MasterInputs in the UI is represent
// decimal rates / fractional percents as whole-number percents so users type
// "6.7" instead of "0.067". We convert at submit time.
// ---------------------------------------------------------------------------

/** Fields that are stored on the backend as a decimal (0-1) but displayed as a percent. */
const PERCENT_FIELDS = new Set<keyof MasterInputs>([
  'current_mortgage_rate',
  'annual_appreciation',
  'selling_cost_pct',
  'marginal_tax_rate',
  'land_value_pct',
  'refinance_rate',
  'refinance_closing_cost_pct',
  'new_down_payment_pct',
  'new_mortgage_rate',
  'purchase_closing_cost_pct',
  'vacancy_rate',
  'management_fee_pct',
  'maintenance_reserve_pct',
])

/** Put a MasterInputs object into form-display shape (percents as whole numbers). */
function toFormShape(i: MasterInputs): Record<string, number | boolean> {
  const out: Record<string, number | boolean> = {}
  ;(Object.keys(i) as Array<keyof MasterInputs>).forEach((k) => {
    const v = i[k]
    if (typeof v === 'boolean') {
      out[k] = v
    } else if (PERCENT_FIELDS.has(k)) {
      out[k] = round4(v * 100)
    } else {
      out[k] = v
    }
  })
  return out
}

/** Reverse of toFormShape — convert form values back to MasterInputs. */
function fromFormShape(f: Record<string, number | boolean>): MasterInputs {
  const out = {} as Record<string, number | boolean>
  ;(Object.keys(DEFAULT_INPUTS) as Array<keyof MasterInputs>).forEach((k) => {
    const v = f[k]
    if (typeof v === 'boolean') {
      out[k] = v
    } else if (PERCENT_FIELDS.has(k)) {
      out[k] = (Number(v) || 0) / 100
    } else {
      out[k] = Number(v) || 0
    }
  })
  return out as unknown as MasterInputs
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

// ---------------------------------------------------------------------------
// Input-group metadata — keeps the form definition data-driven so we don't
// have to hand-copy 45 labels and input tags.
// ---------------------------------------------------------------------------

type FieldKind = 'money' | 'percent' | 'months' | 'years' | 'number' | 'bool'

interface FieldDef {
  key: keyof MasterInputs
  label: string
  kind: FieldKind
  hint?: string
}

interface GroupDef {
  title: string
  icon: React.ComponentType<{ className?: string }>
  description?: string
  fields: FieldDef[]
}

const GROUPS: GroupDef[] = [
  {
    title: 'Current home & mortgage',
    icon: Home,
    description: 'What you own today.',
    fields: [
      { key: 'hold_years', label: 'Hold period', kind: 'years' },
      { key: 'current_home_value', label: 'Current home value', kind: 'money' },
      { key: 'current_mortgage_balance', label: 'Mortgage balance', kind: 'money' },
      { key: 'current_mortgage_rate', label: 'Mortgage rate', kind: 'percent' },
      { key: 'remaining_term_months', label: 'Remaining term', kind: 'months' },
      { key: 'monthly_property_tax', label: 'Property tax', kind: 'money', hint: '/mo' },
      { key: 'monthly_insurance', label: 'Insurance', kind: 'money', hint: '/mo' },
      { key: 'monthly_hoa', label: 'HOA', kind: 'money', hint: '/mo' },
      { key: 'monthly_maintenance', label: 'Maintenance', kind: 'money', hint: '/mo' },
    ],
  },
  {
    title: 'Market & tax assumptions',
    icon: TrendingUp,
    fields: [
      { key: 'annual_appreciation', label: 'Home appreciation', kind: 'percent', hint: '/yr' },
      { key: 'selling_cost_pct', label: 'Selling costs', kind: 'percent', hint: 'of price' },
      { key: 'marginal_tax_rate', label: 'Marginal tax rate', kind: 'percent' },
      { key: 'land_value_pct', label: 'Land value', kind: 'percent', hint: 'of basis (non-depreciable)' },
    ],
  },
  {
    title: 'Refinance terms',
    icon: Banknote,
    fields: [
      { key: 'refinance_rate', label: 'Refi rate', kind: 'percent' },
      { key: 'refinance_term_months', label: 'Refi term', kind: 'months' },
      { key: 'refinance_closing_cost_pct', label: 'Closing costs', kind: 'percent', hint: 'of new loan' },
      {
        key: 'refinance_closing_costs_financed',
        label: 'Finance closing costs?',
        kind: 'bool',
      },
    ],
  },
  {
    title: 'Purchase of new home',
    icon: Building2,
    fields: [
      { key: 'target_new_home_value', label: 'New home price', kind: 'money' },
      { key: 'new_down_payment_pct', label: 'Down payment', kind: 'percent' },
      { key: 'new_mortgage_rate', label: 'New mortgage rate', kind: 'percent' },
      { key: 'new_mortgage_term_months', label: 'New term', kind: 'months' },
      { key: 'purchase_closing_cost_pct', label: 'Closing costs', kind: 'percent', hint: 'of price' },
      { key: 'moving_cost', label: 'Moving cost', kind: 'money' },
      { key: 'cash_reserve_held_back', label: 'Cash reserve held back', kind: 'money' },
    ],
  },
  {
    title: 'New-home ongoing costs',
    icon: KeyRound,
    description: 'Used by Sell & Buy and Rent Out & Buy.',
    fields: [
      { key: 'new_home_monthly_property_tax', label: 'Property tax', kind: 'money', hint: '/mo' },
      { key: 'new_home_monthly_insurance', label: 'Insurance', kind: 'money', hint: '/mo' },
      { key: 'new_home_monthly_hoa', label: 'HOA', kind: 'money', hint: '/mo' },
      { key: 'new_home_monthly_maintenance', label: 'Maintenance', kind: 'money', hint: '/mo' },
    ],
  },
  {
    title: 'Rental income & expenses',
    icon: PiggyBank,
    description: 'If you rent the current home.',
    fields: [
      { key: 'gross_monthly_rent', label: 'Gross rent', kind: 'money', hint: '/mo' },
      { key: 'vacancy_rate', label: 'Vacancy', kind: 'percent' },
      { key: 'management_fee_pct', label: 'Management fee', kind: 'percent', hint: 'of rent' },
      { key: 'maintenance_reserve_pct', label: 'Maintenance reserve', kind: 'percent', hint: 'of rent' },
      { key: 'other_rental_expense_monthly', label: 'Other expenses', kind: 'money', hint: '/mo' },
      { key: 'make_ready_cost', label: 'Make-ready cost', kind: 'money', hint: 'one-time' },
    ],
  },
  {
    title: 'Liquidity check',
    icon: Compass,
    description: 'Caps how aggressive a Rent Out & Buy plan can be.',
    fields: [
      { key: 'available_cash_for_purchase', label: 'Cash available for next purchase', kind: 'money' },
    ],
  },
]

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FieldInput({
  def,
  value,
  onChange,
}: {
  def: FieldDef
  value: number | boolean
  onChange: (v: number | boolean) => void
}) {
  if (def.kind === 'bool') {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-input"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{def.label}</span>
      </label>
    )
  }

  const suffix =
    def.kind === 'percent' ? '%'
    : def.kind === 'months' ? 'mo'
    : def.kind === 'years' ? 'yr'
    : def.hint || ''
  const prefix = def.kind === 'money' ? '$' : ''
  const step =
    def.kind === 'percent' ? '0.01'
    : def.kind === 'money' ? '100'
    : '1'

  return (
    <div className="space-y-1">
      <Label htmlFor={def.key} className="text-xs font-medium text-muted-foreground">
        {def.label}
      </Label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
            {prefix}
          </span>
        )}
        <Input
          id={def.key}
          type="number"
          step={step}
          className={cn(prefix && 'pl-7', suffix && 'pr-10')}
          value={Number.isFinite(value as number) ? (value as number) : 0}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

function ScenarioLabel({ slug }: { slug: keyof ComparisonRowOut }) {
  const map: Record<keyof ComparisonRowOut, string> = {
    stay: 'Stay',
    refinance: 'Refinance',
    sell_buy: 'Sell & Buy',
    rent: 'Rent (current home)',
    rent_out_buy: 'Rent Out & Buy',
  }
  return <span>{map[slug]}</span>
}

function ComparisonTable({
  rows,
  colorize = true,
}: {
  rows: Array<{ label: string; row: ComparisonRowOut; hint?: string }>
  colorize?: boolean
}) {
  const slugs: Array<keyof ComparisonRowOut> = [
    'stay',
    'refinance',
    'sell_buy',
    'rent',
    'rent_out_buy',
  ]
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Metric</th>
            {slugs.map((s) => (
              <th key={s} className="py-2 pr-3 text-right font-medium">
                <ScenarioLabel slug={s} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, row, hint }) => (
            <tr key={label} className="border-b last:border-0">
              <td className="py-2 pr-3">
                <div className="font-medium">{label}</div>
                {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
              </td>
              {slugs.map((s) => {
                const v = row[s]
                const cls = colorize
                  ? v > 0 ? 'text-emerald-600'
                  : v < 0 ? 'text-red-600'
                  : 'text-foreground'
                  : 'text-foreground'
                return (
                  <td
                    key={s}
                    className={cn('py-2 pr-3 text-right tabular-nums', cls)}
                  >
                    {formatCurrency(v)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'good' | 'bad' | 'warn'
}) {
  const toneCls =
    tone === 'good' ? 'text-emerald-700'
    : tone === 'bad' ? 'text-red-700'
    : tone === 'warn' ? 'text-amber-700'
    : 'text-foreground'
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn('mt-0.5 text-base font-semibold tabular-nums', toneCls)}>
        {value}
      </div>
    </div>
  )
}

function KV({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className={cn('tabular-nums', bold && 'font-semibold')}>{v}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function DecisionMap() {
  const [formState, setFormState] = useState<Record<string, number | boolean>>(
    toFormShape(DEFAULT_INPUTS),
  )
  const [result, setResult] = useState<RunAllResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setField = useCallback((key: keyof MasterInputs, value: number | boolean) => {
    setFormState((s) => ({ ...s, [key]: value }))
  }, [])

  const resetDefaults = useCallback(() => {
    setFormState(toFormShape(DEFAULT_INPUTS))
    setResult(null)
    setError(null)
  }, [])

  const recalculate = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const inputs = fromFormShape(formState)
      const r = await runAll(inputs)
      setResult(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to run scenario engine')
    } finally {
      setLoading(false)
    }
  }, [formState])

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Decision Map</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Five paths, one view. Compare staying, refinancing, selling &amp; buying,
            renting the house out, or renting it out <em>and</em> buying — over the
            hold period you choose. Numbers tie to your workbook cell-for-cell.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={resetDefaults}>
            Reset to defaults
          </Button>
          <Button onClick={recalculate} disabled={loading}>
            <RefreshCw
              className={cn('mr-2 h-4 w-4', loading && 'animate-spin')}
            />
            {loading ? 'Running…' : 'Recalculate'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <span className="font-medium">Error:</span> {error}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
        {/* ── Left: Inputs ── */}
        <div className="space-y-5">
          {GROUPS.map((g) => {
            const Icon = g.icon
            return (
              <Card key={g.title}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Icon className="h-4 w-4" />
                    {g.title}
                  </CardTitle>
                  {g.description && (
                    <CardDescription className="text-xs">
                      {g.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3">
                  {g.fields.map((f) => (
                    <div
                      key={f.key}
                      className={cn(f.kind === 'bool' && 'col-span-2')}
                    >
                      <FieldInput
                        def={f}
                        value={formState[f.key as string] ?? 0}
                        onChange={(v) => setField(f.key, v)}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* ── Right: Results ── */}
        <div className="space-y-6">
          {!result && !loading && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                <Compass className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Adjust the inputs on the left, then click <b>Recalculate</b> to
                  run all five scenarios.
                </p>
              </CardContent>
            </Card>
          )}

          {result && (
            <>
              <DecisionSummary result={result} />
              <ScenarioComparisonTables result={result} />
              <FeasibilityStrip result={result} />
              <ScenarioDetails result={result} />
              <AuditStrip result={result} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Result sub-views
// ---------------------------------------------------------------------------

function DecisionSummary({ result }: { result: RunAllResponse }) {
  const { decision_map } = result
  const rec = decision_map.recommendation
  const pr = decision_map.priority_rankings

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Compass className="h-4 w-4" />
          Recommendation over {decision_map.selected_hold_period_years} years
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-relaxed">{rec.plain_english_insight}</p>

        <div className="grid grid-cols-2 gap-4 border-t pt-4 md:grid-cols-4">
          <Stat
            label="Best wealth outcome"
            value={rec.best_financial_outcome}
            tone="good"
          />
          <Stat
            label="Total net position"
            value={formatCurrency(rec.best_total_net_position)}
            tone="good"
          />
          <Stat
            label="Best monthly affordability"
            value={rec.best_for_monthly_affordability}
          />
          <Stat label="Simplest path" value={rec.simplest_path} />
        </div>

        <div className="border-t pt-4">
          <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
            Priority rankings
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <KV k="Max wealth" v={pr.max_wealth} />
            <KV k="Affordability" v={pr.monthly_affordability} />
            <KV k="Simplicity" v={pr.simplicity} />
            <KV k="Move / lifestyle" v={pr.move_lifestyle_change} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ScenarioComparisonTables({ result }: { result: RunAllResponse }) {
  const dm = result.decision_map
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Side-by-side comparison</CardTitle>
        <CardDescription>
          All five scenarios, four metrics. Green is cash in your pocket, red
          is cash out.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ComparisonTable
          rows={[
            {
              label: 'Monthly all-in change vs today',
              row: dm.monthly_all_in_impact_vs_today,
              hint: 'Before tax — new out-of-pocket each month.',
            },
            {
              label: 'After-tax monthly change vs today',
              row: dm.after_tax_monthly_impact_vs_today,
              hint: 'After deductions / rental tax benefit.',
            },
            {
              label: 'Net equity at horizon (if sold)',
              row: dm.net_equity_if_sold_at_horizon,
              hint: 'Home(s) sold at hold-period end, net of selling costs.',
            },
            {
              label: 'Total net position',
              row: dm.total_net_position,
              hint: 'Equity + cumulative rental cash flow − make-ready costs.',
            },
          ]}
        />
      </CardContent>
    </Card>
  )
}

function FeasibilityStrip({ result }: { result: RunAllResponse }) {
  const f = result.decision_map.feasibility_flags
  const liquidityColor =
    f.rent_out_buy_liquidity_status === 'Feasible'
      ? 'bg-emerald-100 text-emerald-900'
      : f.rent_out_buy_liquidity_status === 'Stretch'
        ? 'bg-amber-100 text-amber-900'
        : 'bg-red-100 text-red-900'
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Feasibility check</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Top-ranked scenario" value={f.top_ranked_scenario} />
        <Stat label="Complexity" value={f.complexity} />
        <Stat
          label="Monthly figure to watch"
          value={formatCurrency(f.monthly_figure_to_watch)}
        />
        <Stat
          label="Monthly subsidy required?"
          value={f.requires_monthly_subsidy}
          tone={f.requires_monthly_subsidy === 'No' ? 'good' : 'warn'}
        />
        <div className="col-span-2 md:col-span-4 border-t pt-3">
          <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
            Rent Out &amp; Buy liquidity
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                liquidityColor,
              )}
            >
              {f.rent_out_buy_liquidity_status}
            </span>
            <span className="text-muted-foreground">
              Upfront cash required:{' '}
              <b className="tabular-nums text-foreground">
                {formatCurrency(f.rent_out_buy_upfront_cash_required)}
              </b>
            </span>
            <span className="text-muted-foreground">
              Available:{' '}
              <b className="tabular-nums text-foreground">
                {formatCurrency(f.available_cash_for_new_purchase)}
              </b>
            </span>
            <span
              className={cn(
                'tabular-nums',
                f.cash_surplus_or_shortfall >= 0
                  ? 'text-emerald-700'
                  : 'text-red-700',
              )}
            >
              {f.cash_surplus_or_shortfall >= 0 ? 'Surplus' : 'Shortfall'}:{' '}
              <b>{formatCurrency(f.cash_surplus_or_shortfall)}</b>
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ScenarioDetails({ result }: { result: RunAllResponse }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <StayCard result={result} />
      <RefinanceCard result={result} />
      <SellBuyCard result={result} />
      <RentCard result={result} />
      <RentOutBuyCard result={result} />
    </div>
  )
}

function StayCard({ result }: { result: RunAllResponse }) {
  const s = result.stay
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <Home className="h-4 w-4" />
            Stay
          </span>
          <Badge variant="secondary">
            {formatCurrency(s.total_net_position)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <KV k="Monthly P&I" v={formatCurrency(s.current_monthly_pi)} />
        <KV
          k="Total monthly ownership cost"
          v={formatCurrency(s.total_monthly_ownership_cost)}
          bold
        />
        <KV k="Future home value" v={formatCurrency(s.future_home_value)} />
        <KV k="Future mortgage balance" v={formatCurrency(s.future_mortgage_balance)} />
        <KV k="Gross equity" v={formatCurrency(s.gross_equity)} />
        <KV k="Net equity at horizon" v={formatCurrency(s.net_equity_at_horizon)} bold />
      </CardContent>
    </Card>
  )
}

function RefinanceCard({ result }: { result: RunAllResponse }) {
  const r = result.refinance
  const saves = r.monthly_payment_change < 0
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <Banknote className="h-4 w-4" />
            Refinance
          </span>
          <Badge variant="secondary">
            {formatCurrency(r.total_net_position)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <KV k="New loan amount" v={formatCurrency(r.new_loan_amount)} />
        <KV k="New monthly P&I" v={formatCurrency(r.new_monthly_pi)} />
        <KV
          k="Monthly payment change"
          v={`${saves ? '−' : '+'}${formatCurrency(Math.abs(r.monthly_payment_change))}`}
        />
        <KV k="Cash to close" v={formatCurrency(r.cash_to_close)} />
        <KV
          k="Break-even"
          v={r.break_even_months == null ? 'N/A (no savings)' : `${r.break_even_months} mo`}
        />
        <KV
          k="Cumulative payment savings"
          v={formatCurrency(r.cumulative_payment_savings)}
          bold
        />
        <KV
          k="Total monthly cost"
          v={formatCurrency(r.total_monthly_ownership_cost)}
        />
        <KV
          k="Net equity at horizon"
          v={formatCurrency(r.net_equity_at_horizon)}
          bold
        />
      </CardContent>
    </Card>
  )
}

function SellBuyCard({ result }: { result: RunAllResponse }) {
  const s = result.sell_buy
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Sell &amp; Buy
          </span>
          <Badge variant="secondary">
            {formatCurrency(s.total_net_position)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <KV k="Sale proceeds (net of payoff)" v={formatCurrency(s.net_sale_proceeds_before_reserve)} />
        <KV k="Cash available for next purchase" v={formatCurrency(s.cash_available_for_next_purchase)} />
        <KV k="Required down payment" v={formatCurrency(s.required_down_payment)} />
        <KV k="New loan amount" v={formatCurrency(s.new_purchase_loan_amount)} />
        <KV k="New monthly P&I" v={formatCurrency(s.new_monthly_pi)} />
        <KV k="Cash remaining at close" v={formatCurrency(s.cash_remaining_at_close)} />
        <KV
          k="Total monthly cost"
          v={formatCurrency(s.total_monthly_ownership_cost)}
        />
        <KV
          k="Monthly cost change vs stay"
          v={formatCurrency(s.monthly_ownership_cost_change_vs_stay)}
        />
        <KV
          k="Net equity at horizon"
          v={formatCurrency(s.net_equity_at_horizon)}
          bold
        />
      </CardContent>
    </Card>
  )
}

function RentCard({ result }: { result: RunAllResponse }) {
  const r = result.rent
  const mf = r.monthly_flow
  const tv = r.tax_view
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <PiggyBank className="h-4 w-4" />
            Rent (current home)
          </span>
          <Badge variant="secondary">
            {formatCurrency(r.total_net_position)}
          </Badge>
        </CardTitle>
        <CardDescription className="text-xs">
          Keep the house, rent it out. Investment view — doesn't include your
          next housing cost.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <KV k="Effective rent collected" v={formatCurrency(mf.effective_rent_collected)} />
        <KV k="Operating expenses" v={formatCurrency(mf.total_operating_expenses_before_debt)} />
        <KV k="P&I" v={formatCurrency(mf.current_monthly_pi)} />
        <KV k="Monthly cash flow (pre-tax)" v={formatCurrency(mf.monthly_cash_flow_before_tax)} />
        <KV k="Monthly tax benefit" v={formatCurrency(tv.monthly_tax_benefit)} />
        <KV
          k="Monthly cash flow (after tax)"
          v={formatCurrency(tv.monthly_cash_flow_after_tax)}
          bold
        />
        <KV
          k="Cumulative cash flow"
          v={formatCurrency(r.cumulative_after_tax_rental_cash_flow)}
        />
        <KV
          k="Net equity at horizon"
          v={formatCurrency(r.net_equity_at_horizon)}
          bold
        />
      </CardContent>
    </Card>
  )
}

function RentOutBuyCard({ result }: { result: RunAllResponse }) {
  const r = result.rent_out_buy
  const statusTone =
    r.liquidity_status === 'Feasible'
      ? 'good'
      : r.liquidity_status === 'Stretch'
        ? 'warn'
        : 'bad'
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            Rent Out &amp; Buy
          </span>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                statusTone === 'good' && 'border-emerald-400 text-emerald-700',
                statusTone === 'warn' && 'border-amber-400 text-amber-700',
                statusTone === 'bad' && 'border-red-400 text-red-700',
              )}
            >
              {r.liquidity_status}
            </Badge>
            <Badge variant="secondary">
              {formatCurrency(r.total_net_position)}
            </Badge>
          </div>
        </CardTitle>
        <CardDescription className="text-xs">{r.execution_note}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Upfront cash
          </div>
          <KV k="Total upfront cash needed" v={formatCurrency(r.total_upfront_cash_needed)} />
          <KV k="Cash available" v={formatCurrency(r.available_cash_for_purchase)} />
          <KV
            k={r.cash_surplus_or_shortfall >= 0 ? 'Surplus' : 'Shortfall'}
            v={formatCurrency(r.cash_surplus_or_shortfall)}
            bold
          />
        </div>
        <div className="space-y-1.5">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Monthly housing (net)
          </div>
          <KV
            k="Before tax"
            v={formatCurrency(r.net_monthly_housing_cost_before_tax)}
          />
          <KV
            k="After tax"
            v={formatCurrency(r.net_monthly_housing_cost_after_tax)}
            bold
          />
          <KV
            k="Δ vs stay (after tax)"
            v={formatCurrency(r.after_tax_monthly_impact_vs_stay)}
          />
        </div>
        <div className="space-y-1.5 md:col-span-2 border-t pt-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Horizon
          </div>
          <KV
            k="Current home net equity"
            v={formatCurrency(r.current_home_net_equity_at_horizon)}
          />
          <KV
            k="New home net equity"
            v={formatCurrency(r.new_home_net_equity_at_horizon)}
          />
          <KV
            k="Cumulative rental cash flow"
            v={formatCurrency(r.cumulative_after_tax_rental_cash_flow)}
          />
          <KV
            k="Total net position"
            v={formatCurrency(r.total_net_position)}
            bold
          />
        </div>
      </CardContent>
    </Card>
  )
}

function AuditStrip({ result }: { result: RunAllResponse }) {
  const { audit } = result
  return (
    <Card className={cn(audit.all_passed ? 'border-emerald-200' : 'border-amber-200')}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          {audit.all_passed ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <AlertCircle className="h-4 w-4 text-amber-600" />
          )}
          Audit — {audit.all_passed ? 'all checks passed' : 'items to review'}
        </CardTitle>
        <CardDescription className="text-xs">
          Sanity checks against Excel source-of-truth.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {audit.checks.map((c) => (
          <div
            key={c.name}
            className="flex items-start justify-between gap-3 border-b py-1.5 text-sm last:border-0"
          >
            <div>
              <span className="font-medium">{c.name}</span>
              {c.notes && (
                <div className="text-xs text-muted-foreground">{c.notes}</div>
              )}
            </div>
            <Badge
              variant="outline"
              className={cn(
                c.status === 'PASS'
                  ? 'border-emerald-400 text-emerald-700'
                  : 'border-amber-400 text-amber-700',
              )}
            >
              {c.status}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
