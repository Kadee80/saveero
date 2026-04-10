/**
 * Pure mortgage math — no side effects, fully unit-testable.
 */

export interface LoanInputs {
  purchasePrice: number;    // $
  downPayment: number;      // $
  annualRatePercent: number; // e.g. 6.75
  termYears: number;        // 15 | 20 | 30
  annualPropertyTaxPercent: number; // % of purchase price, e.g. 1.2
  annualInsuranceDollars: number;   // $ per year
  monthlyHoa: number;       // $ per month
}

export interface MonthlyBreakdown {
  principal: number;
  interest: number;
  pmi: number;
  propertyTax: number;
  insurance: number;
  hoa: number;
  total: number;
}

export interface AmortizationRow {
  month: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
}

export interface MortgageSummary {
  loanAmount: number;
  ltv: number;               // loan-to-value ratio %
  monthlyPrincipalInterest: number;
  monthly: MonthlyBreakdown;
  totalInterestPaid: number;
  totalCostOfLoan: number;   // all payments over life of loan
  amortization: AmortizationRow[];
  pmiRequired: boolean;
  pmiMonths: number;         // months until LTV reaches 80%
}

/** Monthly payment for a fixed-rate mortgage (P&I only). */
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
 * PMI estimate: ~0.5% of loan per year when LTV > 80%.
 * Drops to $0 once balance reaches 80% of original purchase price.
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

/** Full amortization schedule. */
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

/** Compute the full mortgage summary from user inputs. */
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
