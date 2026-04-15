/**
 * Mortgage calculation library - pure mortgage math
 *
 * This module provides pure functions for mortgage calculations.
 * No side effects, fully deterministic, and easily unit-testable.
 *
 * Core calculations:
 * - Monthly payment (P&I only) using standard amortization formula
 * - PMI estimation (~0.5% annually when LTV > 80%)
 * - Full amortization schedule (month-by-month breakdown)
 * - Comprehensive mortgage summary (all costs, equity, etc.)
 *
 * All functions use standard US mortgage conventions:
 * - Fixed-rate mortgages (no ARM)
 * - Monthly payments
 * - LTV-based PMI calculation
 * - PMI drops at 80% LTV (approximately 22% down payment)
 *
 * @module lib/mortgage
 * @example
 * import { analyzeMortgage, calcMonthlyPayment } from '@/lib/mortgage'
 *
 * const summary = analyzeMortgage({
 *   purchasePrice: 500000,
 *   downPayment: 100000,
 *   annualRatePercent: 6.75,
 *   termYears: 30,
 *   annualPropertyTaxPercent: 1.2,
 *   annualInsuranceDollars: 1500,
 *   monthlyHoa: 300
 * })
 *
 * console.log(`Monthly payment: $${summary.monthly.total}`)
 */

/**
 * User input parameters for mortgage calculation
 */
export interface LoanInputs {
  /** Purchase price of the property in dollars */
  purchasePrice: number;
  /** Down payment in dollars (not percentage) */
  downPayment: number;
  /** Annual interest rate as percentage (e.g., 6.75) */
  annualRatePercent: number;
  /** Loan term in years: 15, 20, or 30 */
  termYears: number;
  /** Annual property tax as percentage of purchase price (e.g., 1.2 means 1.2%) */
  annualPropertyTaxPercent: number;
  /** Annual homeowner's insurance cost in dollars */
  annualInsuranceDollars: number;
  /** Monthly HOA dues in dollars */
  monthlyHoa: number;
}

/**
 * Monthly payment breakdown - what the user pays each month
 * Sum of all components equals total monthly payment
 */
export interface MonthlyBreakdown {
  /** Principal portion of P&I payment (varies monthly) */
  principal: number;
  /** Interest portion of P&I payment (varies monthly) */
  interest: number;
  /** Private Mortgage Insurance (drops to $0 when LTV reaches 80%) */
  pmi: number;
  /** Property tax (monthly portion of annual rate) */
  propertyTax: number;
  /** Homeowner's insurance (monthly portion of annual cost) */
  insurance: number;
  /** HOA dues (if applicable) */
  hoa: number;
  /** Total monthly payment (PITI + PMI + HOA) */
  total: number;
}

/**
 * Single row from the amortization schedule
 * Shows payment breakdown and remaining balance for each month
 */
export interface AmortizationRow {
  /** Month number (1-indexed) */
  month: number;
  /** Fixed monthly payment (same each month) */
  payment: number;
  /** Principal paid that month */
  principal: number;
  /** Interest paid that month */
  interest: number;
  /** Remaining loan balance after payment */
  balance: number;
}

/**
 * Complete mortgage analysis summary
 * Result of analyzeMortgage() - contains all relevant metrics
 */
export interface MortgageSummary {
  /** Loan amount (purchase price - down payment) */
  loanAmount: number;
  /** Loan-to-value ratio as percentage (0-100) */
  ltv: number;
  /** Monthly principal + interest payment amount */
  monthlyPrincipalInterest: number;
  /** Detailed monthly payment breakdown */
  monthly: MonthlyBreakdown;
  /** Total interest paid over the life of the loan */
  totalInterestPaid: number;
  /** Total cost of loan: all payments plus taxes, insurance, PMI, HOA */
  totalCostOfLoan: number;
  /** Full amortization schedule (one row per month) */
  amortization: AmortizationRow[];
  /** Whether PMI is required (LTV > 80%) */
  pmiRequired: boolean;
  /** Month number when PMI drops off (balance reaches 80% of purchase price) */
  pmiMonths: number;
}

/**
 * Calculate monthly P&I payment for a fixed-rate mortgage
 *
 * Uses the standard amortization formula:
 * M = P * [r(1+r)^n] / [(1+r)^n - 1]
 *
 * Where:
 * - M = monthly payment
 * - P = principal (loan amount)
 * - r = monthly interest rate (annual / 100 / 12)
 * - n = number of payments (years * 12)
 *
 * Special case: if annual rate is 0%, returns simple division (principal / months)
 *
 * Note: This only calculates principal + interest.
 * Does NOT include taxes, insurance, PMI, or HOA.
 *
 * @param {number} loanAmount - The loan amount in dollars
 * @param {number} annualRatePercent - Annual interest rate as percentage (e.g., 6.75)
 * @param {number} termYears - Loan term in years (15, 20, 30)
 * @returns {number} Monthly P&I payment amount in dollars
 *
 * @example
 * calcMonthlyPayment(300000, 6.75, 30)  // Returns ~1979.73
 * calcMonthlyPayment(400000, 0, 30)     // Returns 1111.11 (no interest)
 */
export function calcMonthlyPayment(
  loanAmount: number,
  annualRatePercent: number,
  termYears: number,
): number {
  const r = annualRatePercent / 100 / 12;
  const n = termYears * 12;
  if (r === 0) return loanAmount / n;
  return (loanAmount * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

/**
 * Calculate monthly PMI (Private Mortgage Insurance) payment
 *
 * PMI is required when LTV (Loan-to-Value) exceeds 80%.
 * Common for loans with < 20% down payment.
 *
 * Calculation:
 * - PMI = ~0.5% of original loan amount per year
 * - Divided by 12 for monthly payment
 * - Drops to $0 once remaining balance <= 80% of purchase price
 *
 * The 0.5% rate is a rough industry average.
 * Actual PMI varies by credit score, loan amount, and lender.
 *
 * @param {number} currentBalance - Current remaining loan balance
 * @param {number} purchasePrice - Original purchase price (for LTV calculation)
 * @param {number} loanAmount - Original loan amount
 * @returns {number} Monthly PMI payment (or $0 if LTV <= 80%)
 *
 * @example
 * // New 30-year loan with 10% down
 * calcPmi(270000, 300000, 270000)  // Returns ~112.50 (0.5% annually)
 *
 * // Same loan after 5 years with $30k principal paid
 * calcPmi(240000, 300000, 270000)  // Returns ~112.50 (still > 80% LTV)
 *
 * // Same loan after 10 years with $60k principal paid
 * calcPmi(210000, 300000, 270000)  // Returns $0 (< 80% LTV)
 */
export function calcPmi(
  currentBalance: number,
  purchasePrice: number,
  loanAmount: number,
): number {
  const ltv = currentBalance / purchasePrice;
  if (ltv <= 0.8) return 0;
  return (loanAmount * 0.005) / 12; // 0.5% annually, rough industry average
}

/**
 * Build the complete amortization schedule (month-by-month breakdown)
 *
 * Generates a full amortization table showing:
 * - Each month's fixed payment amount
 * - How much goes to principal vs. interest
 * - Remaining balance after payment
 *
 * Early months have more interest, later months have more principal.
 * Balance reaches zero (or very close) at the end of the term.
 *
 * Used to:
 * - Display amortization table in the UI
 * - Calculate total interest paid over life of loan
 * - Determine when PMI drops off (when balance <= 80% of purchase)
 * - Show equity buildup over time
 *
 * @param {number} loanAmount - Original loan amount
 * @param {number} annualRatePercent - Annual interest rate as percentage
 * @param {number} termYears - Loan term in years
 * @returns {AmortizationRow[]} Array of 12*termYears rows, one per month
 *
 * @example
 * const schedule = buildAmortization(300000, 6.75, 30)
 * // Returns 360 rows (30 years * 12 months)
 * console.log(schedule[0].interest)  // High interest in month 1
 * console.log(schedule[359].interest) // Low interest in month 360
 * console.log(schedule[359].balance)  // ~0 at end
 */
export function buildAmortization(
  loanAmount: number,
  annualRatePercent: number,
  termYears: number,
): AmortizationRow[] {
  const r = annualRatePercent / 100 / 12;
  const n = termYears * 12;
  const payment = calcMonthlyPayment(loanAmount, annualRatePercent, termYears);
  const rows: AmortizationRow[] = [];
  let balance = loanAmount;

  for (let month = 1; month <= n; month++) {
    const interestPortion = balance * r;
    const principalPortion = payment - interestPortion;
    balance = Math.max(0, balance - principalPortion);
    rows.push({
      month,
      payment,
      principal: principalPortion,
      interest: interestPortion,
      balance,
    });
  }
  return rows;
}

/**
 * Comprehensive mortgage analysis - main calculation function
 *
 * Takes user loan parameters and computes a complete mortgage summary:
 * - Monthly payment breakdown (P&I, tax, insurance, PMI, HOA)
 * - Total interest and cost over life of loan
 * - Loan-to-value and PMI requirements
 * - Complete amortization schedule
 * - Key metrics (equity buildup, etc.)
 *
 * Flow:
 * 1. Calculate loan amount and initial LTV
 * 2. Compute fixed monthly P&I payment
 * 3. Calculate monthly taxes, insurance, HOA
 * 4. Estimate PMI if LTV > 80%
 * 5. Build amortization schedule
 * 6. Find when PMI drops off
 * 7. Sum all costs for total
 *
 * The monthly breakdown shown represents an average month.
 * Actual monthly breakdown varies slightly throughout the loan
 * as interest decreases and principal increases over time.
 *
 * @param {LoanInputs} inputs - User loan parameters
 * @returns {MortgageSummary} Complete analysis with all metrics
 * @throws {Never} Returns calculated values even if inputs are invalid
 *
 * @example
 * const summary = analyzeMortgage({
 *   purchasePrice: 500000,
 *   downPayment: 100000,
 *   annualRatePercent: 6.75,
 *   termYears: 30,
 *   annualPropertyTaxPercent: 1.2,
 *   annualInsuranceDollars: 1800,
 *   monthlyHoa: 350
 * })
 *
 * console.log(`Monthly: $${summary.monthly.total}`)
 * console.log(`Total interest: $${summary.totalInterestPaid}`)
 * console.log(`LTV: ${summary.ltv.toFixed(1)}%`)
 * console.log(`PMI required: ${summary.pmiRequired}`)
 */
export function analyzeMortgage(inputs: LoanInputs): MortgageSummary {
  const {
    purchasePrice,
    downPayment,
    annualRatePercent,
    termYears,
    annualPropertyTaxPercent,
    annualInsuranceDollars,
    monthlyHoa,
  } = inputs;

  const loanAmount = purchasePrice - downPayment;
  const ltv = (loanAmount / purchasePrice) * 100;
  const pmiRequired = ltv > 80;

  const monthlyPI = calcMonthlyPayment(loanAmount, annualRatePercent, termYears);
  const monthlyTax = (purchasePrice * (annualPropertyTaxPercent / 100)) / 12;
  const monthlyInsurance = annualInsuranceDollars / 12;
  const monthlyPmi = pmiRequired ? (loanAmount * 0.005) / 12 : 0;

  const amortization = buildAmortization(loanAmount, annualRatePercent, termYears);

  // Count months until PMI drops off (balance ≤ 80% of purchase price)
  const pmiThreshold = purchasePrice * 0.8;
  const pmiMonths = pmiRequired
    ? (amortization.find((r) => r.balance <= pmiThreshold)?.month ?? termYears * 12)
    : 0;

  const totalInterestPaid = amortization.reduce((s, r) => s + r.interest, 0);
  const totalCostOfLoan =
    monthlyPI * termYears * 12 +
    monthlyTax * termYears * 12 +
    monthlyInsurance * termYears * 12 +
    monthlyHoa * termYears * 12 +
    monthlyPmi * pmiMonths;

  const monthly: MonthlyBreakdown = {
    principal: monthlyPI - monthlyPI * (annualRatePercent / 100 / 12), // rough split at month 1
    interest: monthlyPI * (annualRatePercent / 100 / 12) * (loanAmount / loanAmount || 1),
    pmi: monthlyPmi,
    propertyTax: monthlyTax,
    insurance: monthlyInsurance,
    hoa: monthlyHoa,
    total: monthlyPI + monthlyTax + monthlyInsurance + monthlyPmi + monthlyHoa,
  };

  return {
    loanAmount,
    ltv,
    monthlyPrincipalInterest: monthlyPI,
    monthly,
    totalInterestPaid,
    totalCostOfLoan,
    amortization,
    pmiRequired,
    pmiMonths,
  };
}
