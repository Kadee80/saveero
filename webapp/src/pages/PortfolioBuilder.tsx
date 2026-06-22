/**
 * PortfolioBuilder — V1 results page for the Real Estate Portfolio
 * Strategy Engine.
 *
 * Intentionally lightweight for the first stab: seeds the engine with
 * the workbook's V4.1 sample inputs, calls the API on mount, and
 * renders the dashboard + ranked strategy list. The intake-side UX (a
 * full step wizard for portfolio + profile + target collection) is
 * deliberately deferred to the next session — for tomorrow's
 * discussion, the priority is showing the engine produces sensible
 * recommendations end-to-end, not a final user surface.
 *
 * Visual language matches the rest of the warm palette. Teal is the
 * branch accent (already added to chartPalette per the FTHB precedent
 * — see the comment alongside `teal` in lib/chartPalette.ts).
 *
 * Open questions called out in the UI itself so they're impossible to
 * miss while demoing:
 *   - Goal weighting matrix is a placeholder (banner near the top)
 *   - Property fit / risk heuristics are placeholders (banner near the
 *     strategy table)
 *
 * @component
 * @returns {JSX.Element}
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Building2,
  Compass,
  Info,
  TrendingUp,
} from 'lucide-react'
import {
  runPortfolio,
  SAMPLE_PORTFOLIO_INPUTS,
  type RunPortfolioResponse,
  type ScoredStrategyOut,
} from '@/api/portfolioApi'
import { SCENARIO_PALETTE } from '@/lib/chartPalette'
import { formatCurrency } from '@/lib/utils'

const ACCENT = SCENARIO_PALETTE.teal

export default function PortfolioBuilder() {
  const [result, setResult] = useState<RunPortfolioResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    runPortfolio(SAMPLE_PORTFOLIO_INPUTS)
      .then((r) => {
        if (!cancelled) setResult(r)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 md:py-10">
      <Header />
      <PlaceholderBanner />

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Could not run engine: {error}
        </div>
      )}

      {!result && !error && (
        <p className="text-sm text-stone-500">Running engine on sample inputs…</p>
      )}

      {result && (
        <>
          <DashboardCard data={result} />
          <PortfolioSummary data={result} />
          <TargetSummary data={result} />
          <StrategiesTable strategies={result.strategies} />
          <OpenQuestionsCard />
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header() {
  return (
    <header>
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Home
      </Link>
      <div className="mt-2 flex items-center gap-3">
        <div
          className="inline-flex rounded-lg p-2"
          style={{ backgroundColor: `${ACCENT}1a` }}
        >
          <Building2 className="h-6 w-6" style={{ color: ACCENT }} />
        </div>
        <div>
          <p
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: ACCENT }}
          >
            Portfolio
          </p>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Add to your real estate portfolio
          </h1>
        </div>
      </div>
      <p className="mt-3 max-w-2xl text-stone-600">
        Given your existing portfolio, profile, and the property you want to
        buy, here's which acquisition strategy our engine ranks highest. V1
        compares eight paths — Cash, HELOC, Conventional Cash-Out, DSCR
        Cash-Out, No-Ratio, Sell &amp; Redeploy, Combination, and Bridge / Hard
        Money.
      </p>
    </header>
  )
}

// ---------------------------------------------------------------------------
// Placeholder banner — flags the open questions on first sight.
// ---------------------------------------------------------------------------

function PlaceholderBanner() {
  return (
    <div
      className="flex items-start gap-3 rounded-lg border px-4 py-3 text-sm"
      style={{
        borderColor: `${SCENARIO_PALETTE.amber}66`,
        backgroundColor: `${SCENARIO_PALETTE.amber}14`,
      }}
    >
      <Info
        className="mt-0.5 h-4 w-4 shrink-0"
        style={{ color: '#8a6a1f' }}
      />
      <div className="text-stone-700">
        <p className="font-medium" style={{ color: '#8a6a1f' }}>
          First stab — pending Van's weighting matrix.
        </p>
        <p className="mt-1">
          Engine math is end-to-end and the workbook's recommendation matches
          (HELOC, score 92). The four goal-weighting profiles all currently
          point at the static V4.1 weights — swap them for the real matrix
          when it lands.
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dashboard hero — sheet 9 of the workbook
// ---------------------------------------------------------------------------

function DashboardCard({ data }: { data: RunPortfolioResponse }) {
  const d = data.dashboard
  return (
    <section
      className="overflow-hidden rounded-xl bg-card shadow-md ring-1 ring-border"
      style={{ borderTopColor: ACCENT, borderTopWidth: 4 }}
    >
      <div className="p-6">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4" style={{ color: ACCENT }} />
          <span
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: ACCENT }}
          >
            Recommended path
          </span>
        </div>
        <h2 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">
          {d.recommended_path}
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          Score {d.recommended_score} of 100
          {d.alternative_path && (
            <>
              {' · '}Alternative: <strong>{d.alternative_path}</strong> ({d.alternative_score})
            </>
          )}
        </p>
        <p className="mt-4 text-stone-700">{d.consumer_explanation}</p>
        <p className="mt-2 text-sm text-stone-600">
          <strong>Primary tradeoff:</strong> {d.primary_tradeoff}
        </p>
        <p className="mt-1 text-sm text-stone-600">
          <strong>Why this fits:</strong> {d.property_type_note}
        </p>
        <p className="mt-4 text-xs italic text-stone-500">
          {d.suggested_next_step}
        </p>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Portfolio summary — totals from sheet 3
// ---------------------------------------------------------------------------

function PortfolioSummary({ data }: { data: RunPortfolioResponse }) {
  const s = data.portfolio.summary
  return (
    <section className="rounded-xl bg-card p-6 shadow-sm ring-1 ring-border">
      <h3 className="text-base font-semibold tracking-tight">Your portfolio at a glance</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        <Stat label="Total equity" value={formatCurrency(s.total_equity)} />
        <Stat
          label="Accessible equity"
          value={formatCurrency(s.total_dscr_no_ratio_accessible_equity)}
          hint="DSCR / no-ratio basis"
        />
        <Stat
          label="Monthly cash flow"
          value={formatCurrency(s.total_monthly_cash_flow)}
          tone={s.total_monthly_cash_flow < 0 ? 'negative' : 'positive'}
        />
        <Stat label="HELOC capacity" value={formatCurrency(s.total_heloc_accessible_equity)} />
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Target property summary
// ---------------------------------------------------------------------------

function TargetSummary({ data }: { data: RunPortfolioResponse }) {
  const t = data.target_metrics
  const d = data.dashboard
  return (
    <section className="rounded-xl bg-card p-6 shadow-sm ring-1 ring-border">
      <h3 className="text-base font-semibold tracking-tight">Target property</h3>
      <p className="mt-1 text-sm text-stone-500">{d.target_property_type}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        <Stat label="Capital needed" value={formatCurrency(t.total_capital_needed)} />
        <Stat label="Monthly PITIA" value={formatCurrency(t.pitia)} />
        <Stat
          label="DSCR"
          value={t.dscr.toFixed(2)}
          tone={t.dscr >= 1.0 ? 'positive' : 'warn'}
        />
        <Stat
          label={t.projected_flip_profit !== 0 ? 'Projected flip profit' : 'Monthly cash flow'}
          value={formatCurrency(
            t.projected_flip_profit !== 0 ? t.projected_flip_profit : t.monthly_cash_flow,
          )}
          tone={
            t.projected_flip_profit !== 0
              ? t.projected_flip_profit > 0
                ? 'positive'
                : 'negative'
              : t.monthly_cash_flow >= 0
                ? 'positive'
                : 'negative'
          }
        />
      </div>
    </section>
  )
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'positive' | 'negative' | 'warn'
}) {
  const color =
    tone === 'negative'
      ? '#b85844'
      : tone === 'positive'
        ? SCENARIO_PALETTE.emerald
        : tone === 'warn'
          ? SCENARIO_PALETTE.amber
          : undefined
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <p
        className="mt-1 text-xl font-bold tabular-nums"
        style={color ? { color } : undefined}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-stone-500">{hint}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ranked strategies table
// ---------------------------------------------------------------------------

function StrategiesTable({ strategies }: { strategies: ScoredStrategyOut[] }) {
  const sorted = [...strategies].sort((a, b) => a.rank - b.rank)
  return (
    <section className="overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-border">
      <header className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4" style={{ color: ACCENT }} />
          <h3 className="text-base font-semibold tracking-tight">All strategies, ranked</h3>
        </div>
        <p className="mt-1 text-sm text-stone-500">
          Capital coverage + credit + liquidity + cash flow + eligibility + complexity + risk + property fit, weighted.
        </p>
      </header>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-stone-500">
            <th className="px-6 py-3 font-semibold">#</th>
            <th className="px-6 py-3 font-semibold">Strategy</th>
            <th className="px-6 py-3 text-right font-semibold">Capital available</th>
            <th className="px-6 py-3 text-right font-semibold">Coverage</th>
            <th className="px-6 py-3 text-right font-semibold">Score</th>
            <th className="px-6 py-3 font-semibold">Type</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <tr key={s.key} className="border-b border-border last:border-0">
              <td className="px-6 py-3 font-semibold">{s.rank}</td>
              <td className="px-6 py-3">
                <div className="font-medium text-stone-900">{s.name}</div>
                <div className="text-xs text-stone-500">{s.key_tradeoff}</div>
              </td>
              <td className="px-6 py-3 text-right tabular-nums">
                {formatCurrency(s.capital_available)}
              </td>
              <td className="px-6 py-3 text-right tabular-nums">
                {Math.round(s.capital_coverage * 100)}%
              </td>
              <td className="px-6 py-3 text-right text-lg font-bold tabular-nums">
                {s.weighted_score}
              </td>
              <td className="px-6 py-3">
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor:
                      s.recommendation_type === 'Recommended'
                        ? `${ACCENT}1a`
                        : '#f5f5f4',
                    color:
                      s.recommendation_type === 'Recommended' ? ACCENT : '#57534e',
                  }}
                >
                  {s.recommendation_type}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Open-questions card — read for tomorrow's discussion
// ---------------------------------------------------------------------------

function OpenQuestionsCard() {
  return (
    <section
      className="rounded-xl border border-dashed p-6"
      style={{ borderColor: `${ACCENT}66`, backgroundColor: `${ACCENT}08` }}
    >
      <h3 className="text-base font-semibold tracking-tight">For tomorrow's discussion</h3>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-stone-700">
        <li>
          <strong>Weighting matrix</strong> for the four goal profiles (Build Wealth / Passive
          Income / Preserve Liquidity / Minimize Risk). Engine is wired through — all four
          profiles use the static V4.1 weights until the matrix lands.
        </li>
        <li>
          <strong>Property-type fit + risk heuristics.</strong> Sample sheet uses Long-Term Rental
          fit=80, risk=70 — engine matches that, but the other five types are best-guess
          placeholders. Worth a calibration pass with Van.
        </li>
        <li>
          <strong>Lead role.</strong> Add <code>'investor'</code> to the <code>lead.role</code>{' '}
          enum, or reuse <code>'homeowner'</code> with a new <code>intent='portfolio'</code>?
        </li>
        <li>
          <strong>Branch surface name</strong> on the consumer side — workbook calls it{' '}
          "Add to your Real Estate Portfolio"; shorter options are "Build Your Portfolio" /
          "Add Another Property".
        </li>
        <li>
          <strong>Intake wizard scope.</strong> 10-property cap from the workbook is generous;
          should the wizard let users add one at a time, or upload a CSV?
        </li>
        <li>
          <strong>Wealth Projection (sheet 8) — confirmed out of V1.</strong> Re-evaluate when
          we want to drive recommendations on projected wealth impact.
        </li>
      </ol>
    </section>
  )
}
