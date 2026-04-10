import { useState, useEffect } from 'react';
import { Plus, Trash2, Trophy, RefreshCw, AlertCircle } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { analyzeMortgage, calcMonthlyPayment } from '@/lib/mortgage';
import { fetchCurrentRates, type CurrentRates } from '@/api/ratesApi';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Scenario {
  id: string;
  name: string;
  downPaymentPct: number;   // % of purchase price, e.g. 10
  annualRatePercent: number;
  termYears: 15 | 20 | 30;
}

const TERM_OPTIONS: Array<{ label: string; value: 15 | 20 | 30 }> = [
  { label: '15 yr', value: 15 },
  { label: '20 yr', value: 20 },
  { label: '30 yr', value: 30 },
];

const DEFAULT_SCENARIOS: Scenario[] = [
  { id: '1', name: 'Conservative', downPaymentPct: 20, annualRatePercent: 6.82, termYears: 30 },
  { id: '2', name: 'Aggressive',   downPaymentPct: 10, annualRatePercent: 6.82, termYears: 30 },
  { id: '3', name: '15-Year',      downPaymentPct: 20, annualRatePercent: 6.13, termYears: 15 },
];

const SCENARIO_COLORS = ['border-blue-400', 'border-violet-400', 'border-emerald-400'];
const SCENARIO_BG     = ['bg-blue-50',      'bg-violet-50',      'bg-emerald-50'];
const SCENARIO_TEXT   = ['text-blue-700',   'text-violet-700',   'text-emerald-700'];

function uid() {
  return Math.random().toString(36).slice(2, 8);
}

// ─── Comparison rows config ───────────────────────────────────────────────────

interface Row {
  label: string;
  key: string;
  format: (v: number) => string;
  winner: 'min' | 'max'; // min = lower is better, max = higher is better
  note?: string;
}

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

// Flat numeric-only result shape — safe to index with Record<string, number>
interface ScenarioResult {
  monthlyTotal: number;
  downPaymentDollars: number;
  loanAmount: number;
  ltv: number;
  totalInterest: number;
  totalCost: number;
  pmi: number;
  equityY5: number;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ScenarioComparison() {
  const [purchasePrice, setPurchasePrice] = useState(450000);
  const [annualTaxPct, setAnnualTaxPct]   = useState(1.2);
  const [annualIns, setAnnualIns]         = useState(1500);
  const [monthlyHoa, setMonthlyHoa]       = useState(0);
  const [scenarios, setScenarios]         = useState<Scenario[]>(DEFAULT_SCENARIOS);
  const [rates, setRates]                 = useState<CurrentRates | null>(null);
  const [loadingRates, setLoadingRates]   = useState(false);

  // Fetch rates on mount
  useEffect(() => {
    loadRates();
  }, []);

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

  // Derive metrics for each scenario — flat numbers only, safe to index
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
    };
  });

  // For each row, find which scenario wins
  function winnerIndex(rowKey: string, winner: 'min' | 'max') {
    const vals = results.map((r) => (r as unknown as Record<string, number>)[rowKey]);
    const target = winner === 'min' ? Math.min(...vals) : Math.max(...vals);
    return vals.indexOf(target);
  }

  function updateScenario(id: string, patch: Partial<Scenario>) {
    setScenarios((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  }

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
        {scenarios.map((s, i) => (
          <Card key={s.id} className={cn('border-t-4', SCENARIO_COLORS[i])}>
            <CardContent className="space-y-4 pt-4">
              {/* Scenario name + remove */}
              <div className="flex items-center gap-2">
                <Input
                  value={s.name}
                  onChange={(e) => updateScenario(s.id, { name: e.target.value })}
                  className="font-semibold"
                />
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
        ))}
      </div>

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
