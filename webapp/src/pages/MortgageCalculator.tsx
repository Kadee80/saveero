/**
 * Mortgage Calculator page component
 *
 * Interactive mortgage calculator for estimating monthly payments and total loan costs.
 *
 * Features:
 * - Live interest rates from Federal Reserve (FRED API)
 * - Input fields for purchase price, down payment, interest rate, loan term
 * - Additional fields for property taxes, insurance, HOA dues
 * - Real-time calculation as user types
 * - Monthly payment breakdown (P&I, tax, insurance, PMI, HOA)
 * - PMI warning and month-to-payoff calculation
 * - Amortization schedule (annual snapshots, expandable)
 * - Loan-to-value (LTV) calculation
 * - Graceful fallback to estimated rates if API unavailable
 *
 * Data flow:
 * - Fetches current rates on mount via fetchCurrentRates
 * - Updates rate when user changes loan term
 * - Recalculates summary whenever any field changes (via useEffect with JSON.stringify)
 * - Displays rate source (live FRED or estimated fallback)
 *
 * @component
 * @returns {JSX.Element} The mortgage calculator page
 *
 * @example
 * <MortgageCalculator />
 */
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  TrendingDown,
  Home,
  Shield,
  Landmark,
  DollarSign,
  Save,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import type { AmortizationRow } from '@/lib/mortgage';
import {
  analyzeMortgage as analyzeMortgageApi,
  getAnalysis,
  saveAnalysis,
  type AnalyzeMortgageResponse,
} from '@/api/mortgageApi';
import { fetchCurrentRates, type CurrentRates } from '@/api/ratesApi';
import { SCENARIO_PALETTE, CHART_NEGATIVE } from '@/lib/chartPalette';
import { trackActivity } from '@/api/leadsApi';

/**
 * UI-shaped mortgage summary. Mirrors the camelCase shape the original
 * page was built against so the JSX doesn't need to change. Built by
 * adapting the backend's snake_case response.
 */
interface MortgageSummary {
  loanAmount: number;
  ltv: number;
  monthlyPrincipalInterest: number;
  monthly: {
    principal: number;
    interest: number;
    pmi: number;
    propertyTax: number;
    insurance: number;
    hoa: number;
    total: number;
  };
  totalInterestPaid: number;
  totalCostOfLoan: number;
  amortization: AmortizationRow[];
  pmiRequired: boolean;
  pmiMonths: number;
}

/** Convert backend snake_case response to the camelCase shape the UI uses. */
function adaptSummary(r: AnalyzeMortgageResponse): MortgageSummary {
  return {
    loanAmount: r.loan_amount,
    ltv: r.ltv,
    monthlyPrincipalInterest: r.monthly_principal_interest,
    monthly: {
      principal: r.monthly.principal,
      interest: r.monthly.interest,
      pmi: r.monthly.pmi,
      propertyTax: r.monthly.property_tax,
      insurance: r.monthly.insurance,
      hoa: r.monthly.hoa,
      total: r.monthly.total,
    },
    totalInterestPaid: r.total_interest_paid,
    totalCostOfLoan: r.total_cost_of_loan,
    amortization: r.amortization,
    pmiRequired: r.pmi_required,
    pmiMonths: r.pmi_drop_off_month,
  };
}

// ─── Form shape ─────────────────────────────────────────────────────────────

/**
 * Form input values for the mortgage calculator
 */
interface FormValues {
  purchasePrice: number;
  downPayment: number;
  annualRatePercent: number;
  termYears: '15' | '20' | '30';
  annualPropertyTaxPercent: number;
  annualInsuranceDollars: number;
  monthlyHoa: number;
}

/**
 * Loan term options available in the calculator
 */
const TERM_OPTIONS: Array<{ label: string; value: '15' | '20' | '30' }> = [
  { label: '15 yr', value: '15' },
  { label: '20 yr', value: '20' },
  { label: '30 yr', value: '30' },
];

// ─── Utility ────────────────────────────────────────────────────────────────

/**
 * Calculate percentage of a value relative to a total
 *
 * @param {number} value - The value to calculate percentage for
 * @param {number} total - The total reference amount
 * @returns {number} Percentage (0-100), rounded to nearest integer
 *
 * @example
 * pct(500, 1000)  // Returns 50
 * pct(0, 1000)    // Returns 0
 */
function pct(value: number, total: number) {
  return total === 0 ? 0 : Math.round((value / total) * 100);
}

// ─── Sub-components ─────────────────────────────────────────────────────────

/**
 * Breakdown bar component - visualizes monthly payment composition
 *
 * Displays a horizontal stacked bar chart showing the breakdown of monthly
 * payment into principal+interest, tax, insurance, PMI, and HOA with
 * color coding and percentage labels.
 *
 * Components shown (if > $0):
 * - P&I (blue): Principal and interest
 * - Tax (amber): Property tax
 * - Ins. (green): Homeowner's insurance
 * - PMI (red): Private mortgage insurance
 * - HOA (purple): HOA dues
 *
 * @param {Object} props - Component props
 * @param {MortgageSummary['monthly']} props.monthly - Monthly payment breakdown object
 * @returns {JSX.Element} Stacked bar chart with legend
 *
 * @example
 * <BreakdownBar monthly={summary.monthly} />
 */
function BreakdownBar({ monthly }: { monthly: MortgageSummary['monthly'] }) {
  // Hex fills from the shared chart palette so this bar matches the
  // monthly-cost stacks on DecisionMap and ScenarioComparison.
  const segments = [
    { label: 'P&I', value: monthly.principal + monthly.interest, color: SCENARIO_PALETTE.blue },
    { label: 'Tax', value: monthly.propertyTax, color: SCENARIO_PALETTE.amber },
    { label: 'Ins.', value: monthly.insurance, color: SCENARIO_PALETTE.emerald },
    { label: 'PMI', value: monthly.pmi, color: CHART_NEGATIVE },
    { label: 'HOA', value: monthly.hoa, color: SCENARIO_PALETTE.violet },
  ].filter((s) => s.value > 0);

  const total = monthly.total;

  return (
    <div className="space-y-2">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {segments.map((s) => (
          <div
            key={s.label}
            className="h-full transition-all"
            style={{ width: `${pct(s.value, total)}%`, backgroundColor: s.color }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {segments.map((s) => (
          <span key={s.label} className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            {s.label} {pct(s.value, total)}%
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Amortization table component - shows loan paydown schedule
 *
 * Displays annual snapshots of the amortization schedule showing:
 * - Year (month number / 12)
 * - Principal paid that year
 * - Interest paid that year
 * - Remaining balance
 *
 * Only shows every 12th row (annual data) to keep the table manageable.
 * For a 30-year loan, shows 30 rows total.
 *
 * @param {Object} props - Component props
 * @param {AmortizationRow[]} props.rows - Full amortization schedule from mortgage calculation
 * @returns {JSX.Element} Scrollable table
 *
 * @example
 * <AmortizationTable rows={summary.amortization} />
 */
function AmortizationTable({ rows }: { rows: AmortizationRow[] }) {
  // Show every 12th row (annual snapshots) to keep the table readable
  const annual = rows.filter((r) => r.month % 12 === 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Year</th>
            <th className="pb-2 pr-4 font-medium text-right">Principal</th>
            <th className="pb-2 pr-4 font-medium text-right">Interest</th>
            <th className="pb-2 font-medium text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {annual.map((row) => (
            <tr key={row.month} className="border-b last:border-0">
              <td className="py-1.5 pr-4">{row.month / 12}</td>
              <td className="py-1.5 pr-4 text-right text-green-600">
                {formatCurrency(row.principal)}
              </td>
              <td className="py-1.5 pr-4 text-right text-red-500">
                {formatCurrency(row.interest)}
              </td>
              <td className="py-1.5 text-right font-medium">
                {formatCurrency(row.balance)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

/**
 * MortgageCalculator component - interactive mortgage calculation tool
 *
 * Allows users to input loan parameters and instantly see:
 * - Monthly payment (PITI: Principal, Interest, Taxes, Insurance)
 * - Loan-to-value ratio and PMI requirements
 * - Total interest and cost of loan
 * - Amortization schedule
 * - Real-time rate updates from Federal Reserve
 *
 * @component
 * @returns {JSX.Element} The calculator page with form and results
 *
 * @example
 * <MortgageCalculator />
 */
export default function MortgageCalculator() {
  const [rates, setRates] = useState<CurrentRates | null>(null);
  const [loadingRates, setLoadingRates] = useState(false);
  const [summary, setSummary] = useState<MortgageSummary | null>(null);
  const [showAmortization, setShowAmortization] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      purchasePrice: 450000,
      downPayment: 90000,
      annualRatePercent: 6.82,
      termYears: '30',
      annualPropertyTaxPercent: 1.2,
      annualInsuranceDollars: 1500,
      monthlyHoa: 0,
    },
  });

  // ?analysis=<id> deep-link from the dashboard's "Recent calculations"
  // panel: fetch the saved analysis and reset the form to its inputs so the
  // user picks up exactly where they left off. Errors are swallowed
  // silently — if the load fails, the form keeps its defaults rather than
  // throwing the user into a broken state mid-session.
  const [searchParams] = useSearchParams();
  const analysisId = searchParams.get('analysis');
  useEffect(() => {
    if (!analysisId) return;
    let cancelled = false;
    getAnalysis(analysisId)
      .then((row) => {
        if (cancelled) return;
        const i = row.inputs as Record<string, unknown>;
        // Defensive: every saved row from the calculator's saveAnalysis call
        // ships the same shape (snake_case keys, numeric values), but we
        // tolerate missing fields by falling back to the form's existing
        // value rather than NaN-ing it out.
        reset({
          purchasePrice: typeof i.purchase_price === 'number' ? i.purchase_price : 450000,
          downPayment: typeof i.down_payment === 'number' ? i.down_payment : 90000,
          annualRatePercent:
            typeof i.annual_rate_percent === 'number' ? i.annual_rate_percent : 6.82,
          // termYears is a discriminated string union — coerce, then
          // defensively fall back to '30' if the saved value isn't one of
          // the three allowed terms.
          termYears: ((): '15' | '20' | '30' => {
            const t = String(i.term_years ?? '30');
            return t === '15' || t === '20' || t === '30' ? t : '30';
          })(),
          annualPropertyTaxPercent:
            typeof i.annual_property_tax_percent === 'number'
              ? i.annual_property_tax_percent
              : 1.2,
          annualInsuranceDollars:
            typeof i.annual_insurance_dollars === 'number'
              ? i.annual_insurance_dollars
              : 1500,
          monthlyHoa: typeof i.monthly_hoa === 'number' ? i.monthly_hoa : 0,
        });
      })
      .catch(() => {
        /* fall back to default form values silently */
      });
    return () => {
      cancelled = true;
    };
  }, [analysisId, reset]);

  // Auto-recalculate whenever any field changes — now via the backend engine.
  // A tiny debounce keeps us from firing a request on every keystroke.
  const watchedValues = watch();
  useEffect(() => {
    const v = watchedValues;
    // Require the minimum set of fields before we call the API.
    if (
      !v.purchasePrice || v.downPayment === undefined || v.downPayment === null ||
      !v.annualRatePercent
    ) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      analyzeMortgageApi({
        purchase_price: Number(v.purchasePrice),
        down_payment: Number(v.downPayment),
        annual_rate_percent: Number(v.annualRatePercent),
        term_years: Number(v.termYears),
        annual_property_tax_percent: Number(v.annualPropertyTaxPercent),
        annual_insurance_dollars: Number(v.annualInsuranceDollars),
        monthly_hoa: Number(v.monthlyHoa),
      })
        .then((r) => {
          if (controller.signal.aborted) return;
          setSummary(adaptSummary(r));
          setCalcError(null);
          setSaveState('idle'); // inputs changed — previous save no longer reflects shown result
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          const msg = err instanceof Error ? err.message : 'Calculation failed';
          setCalcError(msg);
        });
    }, 150);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [JSON.stringify(watchedValues)]);

  const handleSave = useCallback(async () => {
    if (!summary) return;
    setSaveState('saving');
    setSaveMessage(null);
    try {
      const v = watchedValues;
      await saveAnalysis({
        analysis_type: 'analyze',
        label: `$${Number(v.purchasePrice).toLocaleString()} — ${v.termYears}yr @ ${v.annualRatePercent}%`,
        inputs: {
          purchase_price: Number(v.purchasePrice),
          down_payment: Number(v.downPayment),
          annual_rate_percent: Number(v.annualRatePercent),
          term_years: Number(v.termYears),
          annual_property_tax_percent: Number(v.annualPropertyTaxPercent),
          annual_insurance_dollars: Number(v.annualInsuranceDollars),
          monthly_hoa: Number(v.monthlyHoa),
        },
        result: {
          loan_amount: summary.loanAmount,
          ltv: summary.ltv,
          monthly_principal_interest: summary.monthlyPrincipalInterest,
          monthly: {
            principal: summary.monthly.principal,
            interest: summary.monthly.interest,
            pmi: summary.monthly.pmi,
            property_tax: summary.monthly.propertyTax,
            insurance: summary.monthly.insurance,
            hoa: summary.monthly.hoa,
            total: summary.monthly.total,
          },
          total_interest_paid: summary.totalInterestPaid,
          total_cost_of_loan: summary.totalCostOfLoan,
          pmi_required: summary.pmiRequired,
          pmi_drop_off_month: summary.pmiMonths,
        },
      });
      setSaveState('saved');
      setSaveMessage('Saved to your analyses');
      // CRM activity event — only on successful save so failed saves
      // don't pollute the timeline. Status ladder bumps to 'active'.
      trackActivity('saved_mortgage_analysis', {
        purchase_price: Number(watchedValues.purchasePrice),
        term_years: Number(watchedValues.termYears),
        rate: Number(watchedValues.annualRatePercent),
      });
    } catch (err) {
      setSaveState('error');
      setSaveMessage(err instanceof Error ? err.message : 'Save failed');
    }
  }, [summary, watchedValues]);

  const loadRates = useCallback(async () => {
    setLoadingRates(true);
    try {
      const r = await fetchCurrentRates();
      setRates(r);
      // Pre-fill rate based on selected term
      const term = watchedValues.termYears;
      const rate = term === '15' ? r.rate15yr : term === '20' ? r.rate20yr : r.rate30yr;
      setValue('annualRatePercent', rate);
    } finally {
      setLoadingRates(false);
    }
  }, [watchedValues.termYears, setValue]);

  // Load rates on mount
  useEffect(() => {
    loadRates();
  }, []);

  // When term changes, update rate from already-fetched rates
  const selectedTerm = watch('termYears');
  useEffect(() => {
    if (!rates) return;
    const rate =
      selectedTerm === '15' ? rates.rate15yr
      : selectedTerm === '20' ? rates.rate20yr
      : rates.rate30yr;
    setValue('annualRatePercent', rate);
  }, [selectedTerm, rates, setValue]);

  const downPaymentPct = summary
    ? Math.round((Number(watchedValues.downPayment) / Number(watchedValues.purchasePrice)) * 100)
    : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mortgage Calculator</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Estimate your monthly payment and total cost of ownership.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {rates && (
            <div className="text-right text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                {rates.source === 'fallback' && (
                  <AlertCircle className="h-3 w-3 text-amber-500" />
                )}
                <span>
                  Rates as of {rates.asOf}
                  {rates.source === 'fallback' && ' (estimated)'}
                </span>
              </div>
              <span>30yr {rates.rate30yr}% · 15yr {rates.rate15yr}%</span>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={loadRates}
            disabled={loadingRates}
          >
            <RefreshCw className={cn('mr-2 h-4 w-4', loadingRates && 'animate-spin')} />
            {loadingRates ? 'Fetching…' : 'Refresh rates'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        {/* ── Left: Inputs ── */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Home className="h-4 w-4" /> Property
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="purchasePrice">Purchase price</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="purchasePrice"
                    type="number"
                    className="pl-7"
                    {...register('purchasePrice', { required: true, min: 1 })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="downPayment">
                  Down payment{' '}
                  <span className="text-muted-foreground">
                    ({downPaymentPct}%)
                  </span>
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="downPayment"
                    type="number"
                    className="pl-7"
                    {...register('downPayment', { required: true, min: 0 })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingDown className="h-4 w-4" /> Loan
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Term selector */}
              <div className="space-y-1.5">
                <Label>Loan term</Label>
                <div className="flex gap-2">
                  {TERM_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setValue('termYears', opt.value)}
                      className={cn(
                        'flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                        watchedValues.termYears === opt.value
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-background hover:bg-accent',
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="annualRatePercent">Interest rate</Label>
                <div className="relative">
                  <Input
                    id="annualRatePercent"
                    type="number"
                    step="0.01"
                    className="pr-7"
                    {...register('annualRatePercent', { required: true, min: 0.01, max: 30 })}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                </div>
                {rates?.source === 'fallback' && (
                  <p className="text-xs text-amber-600">
                    Add <code>VITE_FRED_API_KEY</code> to .env for live rates from the Federal Reserve.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Landmark className="h-4 w-4" /> Taxes & Insurance
              </CardTitle>
              <CardDescription>Estimates — your lender will use actual values.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="annualPropertyTaxPercent">Property tax rate</Label>
                <div className="relative">
                  <Input
                    id="annualPropertyTaxPercent"
                    type="number"
                    step="0.01"
                    className="pr-7"
                    {...register('annualPropertyTaxPercent', { required: true, min: 0 })}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                </div>
                <p className="text-xs text-muted-foreground">US avg ≈ 1.1%</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="annualInsuranceDollars">Homeowner's insurance</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="annualInsuranceDollars"
                    type="number"
                    className="pl-7"
                    {...register('annualInsuranceDollars', { min: 0 })}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">/yr</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="monthlyHoa">HOA dues</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="monthlyHoa"
                    type="number"
                    className="pl-7"
                    {...register('monthlyHoa', { min: 0 })}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">/mo</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Right: Results ── */}
        {calcError && !summary && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <span className="font-medium">Calculation error:</span> {calcError}
            </div>
          </div>
        )}
        {summary && (
          <div className="space-y-4">
            {/* Monthly total */}
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="pt-6">
                <p className="text-sm font-medium text-muted-foreground">Monthly payment (PITI)</p>
                <p className="mt-1 text-4xl font-bold tracking-tight">
                  {formatCurrency(summary.monthly.total)}
                </p>
                <div className="mt-4">
                  <BreakdownBar monthly={summary.monthly} />
                </div>
              </CardContent>
            </Card>

            {/* PMI warning */}
            {summary.pmiRequired && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                <Shield className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <span className="font-medium">PMI required</span> — your LTV is{' '}
                  {summary.ltv.toFixed(1)}%. PMI drops off around month{' '}
                  {summary.pmiMonths} (~{formatCurrency(summary.monthly.pmi)}/mo).
                </div>
              </div>
            )}

            {/* Breakdown detail */}
            <Card>
              <CardContent className="pt-4 space-y-2 text-sm">
                {[
                  { label: 'Principal & Interest', value: summary.monthlyPrincipalInterest, icon: <DollarSign className="h-3.5 w-3.5" /> },
                  { label: 'Property Tax', value: summary.monthly.propertyTax },
                  { label: "Homeowner's Ins.", value: summary.monthly.insurance },
                  ...(summary.pmiRequired ? [{ label: 'PMI', value: summary.monthly.pmi }] : []),
                  ...(summary.monthly.hoa > 0 ? [{ label: 'HOA', value: summary.monthly.hoa }] : []),
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium tabular-nums">{formatCurrency(value)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-2 font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{formatCurrency(summary.monthly.total)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Loan stats */}
            <Card>
              <CardContent className="pt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Loan amount</span>
                  <span className="font-medium tabular-nums">{formatCurrency(summary.loanAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Loan-to-value</span>
                  <span className="font-medium tabular-nums">{summary.ltv.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total interest paid</span>
                  <span className="font-medium text-red-600 tabular-nums">
                    {formatCurrency(summary.totalInterestPaid)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total cost of loan</span>
                  <span className="font-medium tabular-nums">{formatCurrency(summary.totalCostOfLoan)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Save analysis */}
            <div className="space-y-2">
              <Button
                type="button"
                onClick={handleSave}
                disabled={saveState === 'saving' || saveState === 'saved'}
                className="w-full"
                variant={saveState === 'saved' ? 'outline' : 'default'}
              >
                <Save className="mr-2 h-4 w-4" />
                {saveState === 'saving'
                  ? 'Saving…'
                  : saveState === 'saved'
                    ? 'Saved'
                    : 'Save this analysis'}
              </Button>
              {saveMessage && (
                <p
                  className={cn(
                    'text-xs',
                    saveState === 'error' ? 'text-red-600' : 'text-muted-foreground',
                  )}
                >
                  {saveMessage}
                </p>
              )}
              {calcError && (
                <p className="text-xs text-red-600">Latest update failed: {calcError}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Amortization schedule */}
      {summary && (
        <Card>
          <button
            type="button"
            className="flex w-full items-center justify-between p-4 text-left"
            onClick={() => setShowAmortization((v) => !v)}
          >
            <span className="font-medium">Amortization Schedule</span>
            {showAmortization ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          {showAmortization && (
            <CardContent className="pt-0">
              <AmortizationTable rows={summary.amortization} />
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
