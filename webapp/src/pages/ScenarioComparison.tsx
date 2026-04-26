/**
 * Scenario Comparison page component - compare up to 3 mortgage scenarios side-by-side
 *
 * Allows users to compare different financing strategies:
 * - Different down payments (%, converted to dollars)
 * - Different interest rates
 * - Different loan terms (15, 20, 30 years)
 *
 * Features:
 * - Live interest rates from Federal Reserve (FRED API)
 * - Side-by-side scenario cards with editable inputs
 * - Add/remove scenarios (max 3)
 * - Shared property inputs (purchase price, taxes, insurance, HOA)
 * - Comprehensive comparison table with 8+ metrics
 * - Winner highlighting (lower monthly = best, higher equity = best, etc.)
 * - Monthly savings calculation vs. lowest payment option
 * - Trophy badges for best scenario
 *
 * Metrics compared:
 * - Monthly payment, down payment needed, loan amount
 * - Loan-to-value, total interest, total cost
 * - PMI amount, equity built in 5 years
 * - Savings/cost vs. cheapest option
 *
 * @component
 * @returns {JSX.Element} The scenario comparison page
 *
 * @example
 * <ScenarioComparison />
 */
import { useState, useEffect } from 'react';
import { Plus, Trash2, Trophy, RefreshCw, AlertCircle, Shield, Zap, Target } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { analyzeMortgage, calcMonthlyPayment } from '@/lib/mortgage';
import { fetchCurrentRates, type CurrentRates } from '@/api/ratesApi';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  Label as ChartLabel,
} from 'recharts';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Represents a single mortgage scenario in the comparison
 */
/**
 * Represents a single mortgage scenario in the comparison
 */
interface Scenario {
  /** Unique identifier */
  id: string;
  /** Display name (e.g., "Conservative", "Aggressive") */
  name: string;
  /** Down payment as percentage of purchase price (e.g., 20 means 20%) */
  downPaymentPct: number;
  /** Annual interest rate as percentage (e.g., 6.82) */
  annualRatePercent: number;
  /** Loan term in years: 15, 20, or 30 */
  termYears: 15 | 20 | 30;
}

/**
 * Loan term options available in scenario comparison
 */
const TERM_OPTIONS: Array<{ label: string; value: 15 | 20 | 30 }> = [
  { label: '15 yr', value: 15 },
  { label: '20 yr', value: 20 },
  { label: '30 yr', value: 30 },
];

/**
 * Default scenarios for new users (pre-populated comparison examples)
 */
const DEFAULT_SCENARIOS: Scenario[] = [
  { id: '1', name: 'Conservative', downPaymentPct: 20, annualRatePercent: 6.82, termYears: 30 },
  { id: '2', name: 'Aggressive',   downPaymentPct: 10, annualRatePercent: 6.82, termYears: 30 },
  { id: '3', name: '15-Year',      downPaymentPct: 20, annualRatePercent: 6.13, termYears: 15 },
];

/**
 * Color scheme for scenario cards (border, background, text)
 * Index corresponds to scenario position (0-2)
 */
const SCENARIO_COLORS = ['border-blue-400', 'border-violet-400', 'border-emerald-400'];
const SCENARIO_BG     = ['bg-blue-50',      'bg-violet-50',      'bg-emerald-50'];
const SCENARIO_TEXT   = ['text-blue-700',   'text-violet-700',   'text-emerald-700'];

/**
 * Chart color scheme for scenarios (hex format for recharts)
 */
const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#10b981'];

/**
 * Hero icons and taglines for scenario cards by index
 */
const SCENARIO_ICONS = [Shield, Zap, Target];
const SCENARIO_TAGLINES = ['Conservative play', 'Aggressive play', 'Tight discipline'];

/**
 * Generate a short random ID for new scenarios
 *
 * @returns {string} 6-character random ID
 *
 * @example
 * uid()  // Returns something like "a7k3m9"
 */
function uid() {
  return Math.random().toString(36).slice(2, 8);
}

// ─── Comparison rows config ───────────────────────────────────────────────────

/**
 * Configuration for a single metric row in the comparison table
 */
interface Row {
  /** Display label (e.g., "Monthly payment") */
  label: string;
  /** Key to access value in ScenarioResult */
  key: string;
  /** Function to format number for display */
  format: (v: number) => string;
  /** 'min' = lower is better, 'max' = higher is better */
  winner: 'min' | 'max';
  /** Optional explanatory note shown below label */
  note?: string;
}

/**
 * Metrics displayed in the comparison table
 * Each row has a label, accessor key, format function, and winner direction
 */
const ROWS: Row[] = [
  { label: 'Monthly payment',     key: 'monthlyTotal',        format: formatCurrency, winner: 'min' },
  { label: 'Down payment needed', key: 'downPaymentDollars',  format: formatCurrency, winner: 'min', note: 'Cash out of pocket at closing' },
  { label: 'Loan amount',         key: 'loanAmount',          format: formatCurrency, winner: 'min' },
  { label: 'Loan-to-value',       key: 'ltv',                 format: (v) => `${v.toFixed(1)}%`, winner: 'min' },
  { label: 'Total interest paid', key: 'totalInterest',       format: formatCurrency, winner: 'min', note: 'Over the full loan term' },
  { label: 'Total cost of loan',  key: 'totalCost',           format: formatCurrency, winner: 'min', note: 'All P&I payments combined' },
  { label: 'PMI / month',         key: 'pmi',                 format: (v) => v === 0 ? 'None' : formatCurrency(v), winner: 'min' },
  { label: 'Equity at year 5',    key: 'equityY5',            format: formatCurrency, winner: 'max', note: 'Principal paid down + down payment' },
];

/**
 * Flat numeric-only result shape — safe to index with Record<string, number>
 * Derived from each scenario's inputs via analyzeMortgage
 */
interface ScenarioResult {
  /** Total monthly payment (principal, interest, taxes, insurance, PMI, HOA) */
  monthlyTotal: number;
  /** Down payment in dollars */
  downPaymentDollars: number;
  /** Loan amount (purchase price - down payment) */
  loanAmount: number;
  /** Loan-to-value ratio as percentage (0-100) */
  ltv: number;
  /** Total interest paid over loan term */
  totalInterest: number;
  /** Total cost of loan (all P&I payments combined) */
  totalCost: number;
  /** Monthly PMI payment (0 if LTV <= 80%) */
  pmi: number;
  /** Equity built in first 5 years (down payment + principal paid) */
  equityY5: number;
  /** Monthly breakdown (P&I, tax, insurance, PMI, HOA) */
  monthlyBreakdown?: {
    principalInterest: number;
    tax: number;
    insurance: number;
    pmi: number;
    hoa: number;
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * ScenarioComparison component - compare multiple mortgage scenarios
 *
 * Allows users to create and compare 2-3 different financing options
 * with shared property data but different loan parameters.
 *
 * @component
 * @returns {JSX.Element} The scenario comparison tool
 *
 * @example
 * <ScenarioComparison />
 */
export default function ScenarioComparison() {
  const [purchasePrice, setPurchasePrice] = useState(450000);
  const [annualTaxPct, setAnnualTaxPct]   = useState(1.2);
  const [annualIns, setAnnualIns]         = useState(1500);
  const [monthlyHoa, setMonthlyHoa]       = useState(0);
  const [scenarios, setScenarios]         = useState<Scenario[]>(DEFAULT_SCENARIOS);
  const [rates, setRates]                 = useState<CurrentRates | null>(null);
  const [loadingRates, setLoadingRates]   = useState(false);
  const [activeDonutScenario, setActiveDonutScenario] = useState(0);

  /**
   * Load current mortgage rates from FRED API
   * Updates all scenarios with live rates matching their term
   * Falls back gracefully to estimated rates if API unavailable
   */
  async function loadRates() {
    setLoadingRates(true);
    try {
      const r = await fetchCurrentRates();
      setRates(r);
      // Update all default scenarios to use live rates
      setScenarios((prev) =>
        prev.map((s) => ({
          ...s,
          annualRatePercent:
            s.termYears === 15 ? r.rate15yr
            : s.termYears === 20 ? r.rate20yr
            : r.rate30yr,
        })),
      );
    } finally {
      setLoadingRates(false);
    }
  }

  // Fetch rates on mount
  useEffect(() => {
    loadRates();
  }, []);

  /**
   * Derive metrics for each scenario — flat numbers only, safe to index
   */
  const results: ScenarioResult[] = scenarios.map((s) => {
    const downPaymentDollars = (s.downPaymentPct / 100) * purchasePrice;
    const summary = analyzeMortgage({
      purchasePrice,
      downPayment: downPaymentDollars,
      annualRatePercent: s.annualRatePercent,
      termYears: s.termYears,
      annualPropertyTaxPercent: annualTaxPct,
      annualInsuranceDollars: annualIns,
      monthlyHoa,
    });

    // Equity at year 5: down payment + principal paid in first 60 months
    const principalPaidY5 = summary.amortization
      .slice(0, 60)
      .reduce((sum, row) => sum + row.principal, 0);

    return {
      monthlyTotal: summary.monthly.total,
      downPaymentDollars,
      loanAmount: summary.loanAmount,
      ltv: summary.ltv,
      totalInterest: summary.totalInterestPaid,
      totalCost: summary.totalCostOfLoan,
      pmi: summary.monthly.pmi,
      equityY5: downPaymentDollars + principalPaidY5,
      monthlyBreakdown: {
        principalInterest: summary.monthlyPrincipalInterest,
        tax: summary.monthly.propertyTax,
        insurance: summary.monthly.insurance,
        pmi: summary.monthly.pmi,
        hoa: summary.monthly.hoa,
      },
    };
  });

  /**
   * Find which scenario wins for a given metric row
   *
   * @param {string} rowKey - The metric key to evaluate
   * @param {'min' | 'max'} winner - Direction (lower or higher is better)
   * @returns {number} Index of winning scenario (0-2)
   *
   * @example
   * winnerIndex('monthlyTotal', 'min')  // Returns index of lowest payment
   */
  function winnerIndex(rowKey: string, winner: 'min' | 'max') {
    const vals = results.map((r) => (r as unknown as Record<string, number>)[rowKey]);
    const target = winner === 'min' ? Math.min(...vals) : Math.max(...vals);
    return vals.indexOf(target);
  }

  /**
   * Update a scenario's properties
   *
   * @param {string} id - Scenario ID to update
   * @param {Partial<Scenario>} patch - Properties to update
   */
  function updateScenario(id: string, patch: Partial<Scenario>) {
    setScenarios((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  }

  /**
   * Add a new scenario (max 3 total)
   * New scenario has default values and uses current 30yr rate
   */
  function addScenario() {
    if (scenarios.length >= 3) return;
    setScenarios((prev) => [
      ...prev,
      {
        id: uid(),
        name: `Scenario ${prev.length + 1}`,
        downPaymentPct: 15,
        annualRatePercent: rates?.rate30yr ?? 6.82,
        termYears: 30,
      },
    ]);
  }

  /**
   * Remove a scenario (minimum 2 scenarios must remain)
   *
   * @param {string} id - Scenario ID to remove
   */
  function removeScenario(id: string) {
    if (scenarios.length <= 2) return;
    setScenarios((prev) => prev.filter((s) => s.id !== id));
  }

  const bestMonthly = Math.min(...results.map((r) => r.monthlyTotal));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Scenario Comparison</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Compare up to 3 loan options side by side.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadRates} disabled={loadingRates}>
          <RefreshCw className={cn('mr-2 h-4 w-4', loadingRates && 'animate-spin')} />
          {loadingRates ? 'Fetching…' : 'Refresh rates'}
        </Button>
      </div>

      {rates?.source === 'fallback' && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Showing estimated rates. Add <code className="mx-1 rounded bg-amber-100 px-1">VITE_FRED_API_KEY</code> to .env for live Federal Reserve data.
        </div>
      )}

      {/* Shared property inputs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Property (shared across all scenarios)
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Purchase price</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                type="number"
                className="pl-7"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Property tax rate</Label>
            <div className="relative">
              <Input
                type="number"
                step="0.01"
                className="pr-7"
                value={annualTaxPct}
                onChange={(e) => setAnnualTaxPct(Number(e.target.value))}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Insurance / yr</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                type="number"
                className="pl-7"
                value={annualIns}
                onChange={(e) => setAnnualIns(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>HOA / mo</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                type="number"
                className="pl-7"
                value={monthlyHoa}
                onChange={(e) => setMonthlyHoa(Number(e.target.value))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scenario columns */}
      <div
        className={cn(
          'grid gap-4',
          scenarios.length === 2 ? 'grid-cols-2' : 'grid-cols-3',
        )}
      >
        {scenarios.map((s, i) => {
          const IconComponent = SCENARIO_ICONS[i];
          return (
          <Card key={s.id} className={cn('border-t-4', SCENARIO_COLORS[i])}>
            <CardContent className="space-y-4 pt-4">
              {/* Hero icon */}
              <div className="flex items-center gap-3">
                <div className={cn('rounded-lg p-2', SCENARIO_BG[i])}>
                  <IconComponent className={cn('h-6 w-6', SCENARIO_TEXT[i])} />
                </div>
                <div className="flex-1">
                  <Input
                    value={s.name}
                    onChange={(e) => updateScenario(s.id, { name: e.target.value })}
                    className="font-semibold"
                  />
                  <p className={cn('text-xs font-medium mt-1', SCENARIO_TEXT[i])}>
                    {SCENARIO_TAGLINES[i]}
                  </p>
                </div>
                {scenarios.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeScenario(s.id)}
                    className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                    aria-label="Remove scenario"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Down payment */}
              <div className="space-y-1.5">
                <Label>Down payment</Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="1"
                    min={3}
                    max={100}
                    className="pr-7"
                    value={s.downPaymentPct}
                    onChange={(e) => updateScenario(s.id, { downPaymentPct: Number(e.target.value) })}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  = {formatCurrency((s.downPaymentPct / 100) * purchasePrice)}
                </p>
              </div>

              {/* Rate */}
              <div className="space-y-1.5">
                <Label>Interest rate</Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.01"
                    className="pr-7"
                    value={s.annualRatePercent}
                    onChange={(e) => updateScenario(s.id, { annualRatePercent: Number(e.target.value) })}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                </div>
              </div>

              {/* Term */}
              <div className="space-y-1.5">
                <Label>Term</Label>
                <div className="flex gap-1.5">
                  {TERM_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        const rate = rates
                          ? opt.value === 15 ? rates.rate15yr
                            : opt.value === 20 ? rates.rate20yr
                            : rates.rate30yr
                          : s.annualRatePercent;
                        updateScenario(s.id, { termYears: opt.value, annualRatePercent: rate });
                      }}
                      className={cn(
                        'flex-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors',
                        s.termYears === opt.value
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-background hover:bg-accent',
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Monthly total hero */}
              <div className={cn('rounded-lg px-4 py-3', SCENARIO_BG[i])}>
                <p className="text-xs font-medium text-muted-foreground">Monthly payment</p>
                <p className={cn('text-2xl font-bold tabular-nums', SCENARIO_TEXT[i])}>
                  {formatCurrency(results[i]?.monthlyTotal ?? 0)}
                </p>
                {results[i]?.monthlyTotal === bestMonthly && scenarios.length > 1 && (
                  <Badge variant="outline" className="mt-1 gap-1 border-current text-xs">
                    <Trophy className="h-3 w-3" /> Lowest payment
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        );
        })}
      </div>

      {/* Visualization charts */}
      {scenarios.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Comparison Charts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Top row: two bar charts + donut, three columns */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Monthly Payment Bar Chart */}
              <div>
                <p className="text-sm font-medium text-slate-700 mb-3">Monthly Payment</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={scenarios.map((s, i) => ({ name: s.name, value: results[i]?.monthlyTotal ?? 0 }))}>
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value) => formatCurrency(Number(value))}
                      contentStyle={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}
                    />
                    <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                      {scenarios.map((_, i) => (
                        <Cell key={`cell-${i}`} fill={CHART_COLORS[i]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Total Cost of Loan Bar Chart */}
              <div>
                <p className="text-sm font-medium text-slate-700 mb-3">Total Cost of Loan</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={scenarios.map((s, i) => ({ name: s.name, value: results[i]?.totalCost ?? 0 }))}>
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value) => formatCurrency(Number(value))}
                      contentStyle={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}
                    />
                    <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                      {scenarios.map((_, i) => (
                        <Cell key={`cell-${i}`} fill={CHART_COLORS[i]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Donut: Principal vs Interest */}
              <div>
                <div className="flex items-center justify-between mb-3 gap-2">
                  <p className="text-sm font-medium text-slate-700">Where Your Money Goes</p>
                  {scenarios.length > 1 && (
                    <div className="flex gap-1">
                      {scenarios.map((s, i) => (
                        <button
                          key={s.id}
                          onClick={() => setActiveDonutScenario(i)}
                          className={cn(
                            'px-2 py-1 rounded text-xs font-medium transition-colors',
                            activeDonutScenario === i
                              ? cn('text-white', {
                                  'bg-blue-500': i === 0,
                                  'bg-violet-500': i === 1,
                                  'bg-emerald-500': i === 2,
                                })
                              : 'bg-muted text-slate-600 hover:bg-muted/80',
                          )}
                          title={s.name}
                        >
                          {i + 1}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Principal', value: results[activeDonutScenario]?.loanAmount ?? 0 },
                        { name: 'Interest', value: results[activeDonutScenario]?.totalInterest ?? 0 },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      <Cell fill="#3b82f6" />
                      <Cell fill="#ef4444" />
                    </Pie>
                    <Tooltip
                      formatter={(value) => formatCurrency(Number(value))}
                      contentStyle={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Stacked Bar: Monthly Payment Composition */}
            <div>
              <p className="text-sm font-medium text-slate-700 mb-3">Monthly Payment Breakdown</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={scenarios.map((s, i) => ({
                  name: s.name,
                  'P&I': results[i]?.monthlyBreakdown?.principalInterest ?? 0,
                  'Tax': results[i]?.monthlyBreakdown?.tax ?? 0,
                  'Insurance': results[i]?.monthlyBreakdown?.insurance ?? 0,
                  'PMI': results[i]?.monthlyBreakdown?.pmi ?? 0,
                  'HOA': results[i]?.monthlyBreakdown?.hoa ?? 0,
                }))}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value))}
                    contentStyle={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}
                  />
                  <Legend />
                  <Bar dataKey="P&I" stackId="a" fill="#3b82f6" />
                  <Bar dataKey="Tax" stackId="a" fill="#f59e0b" />
                  <Bar dataKey="Insurance" stackId="a" fill="#10b981" />
                  <Bar dataKey="PMI" stackId="a" fill="#ef4444" />
                  <Bar dataKey="HOA" stackId="a" fill="#8b5cf6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add scenario */}
      {scenarios.length < 3 && (
        <Button variant="outline" className="w-full" onClick={addScenario}>
          <Plus className="mr-2 h-4 w-4" /> Add scenario
        </Button>
      )}

      {/* Comparison table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Full Comparison</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-3 pr-4 font-medium text-muted-foreground w-48">Metric</th>
                {scenarios.map((s, i) => (
                  <th key={s.id} className={cn('pb-3 pr-4 font-semibold', SCENARIO_TEXT[i])}>
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const wi = winnerIndex(row.key, row.winner);
                return (
                  <tr key={row.key} className="border-b last:border-0">
                    <td className="py-2.5 pr-4 text-muted-foreground">
                      <div>{row.label}</div>
                      {row.note && <div className="text-xs opacity-70">{row.note}</div>}
                    </td>
                    {results.map((r, i) => {
                      const val = (r as unknown as Record<string, number>)[row.key];
                      const isWinner = i === wi && scenarios.length > 1;
                      return (
                        <td
                          key={scenarios[i].id}
                          className={cn(
                            'py-2.5 pr-4 font-medium tabular-nums',
                            isWinner && 'font-bold',
                          )}
                        >
                          <span className={cn(isWinner && SCENARIO_TEXT[i])}>
                            {row.format(val)}
                          </span>
                          {isWinner && (
                            <Trophy className="ml-1.5 inline h-3 w-3 opacity-70" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {/* Monthly savings vs cheapest */}
              {scenarios.length > 1 && (
                <tr className="bg-muted/30">
                  <td className="py-2.5 pr-4 font-medium">vs. lowest monthly</td>
                  {results.map((r, i) => {
                    const savings = r.monthlyTotal - bestMonthly;
                    return (
                      <td key={scenarios[i].id} className="py-2.5 pr-4 font-medium tabular-nums">
                        {savings === 0 ? (
                          <span className={SCENARIO_TEXT[i]}>—</span>
                        ) : (
                          <span className="text-red-600">+{formatCurrency(savings)}/mo</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
