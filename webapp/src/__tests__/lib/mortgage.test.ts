/**
 * mortgage.test.ts
 *
 * Tests for mortgage calculation utilities covering:
 * - calcMonthlyPayment() accuracy
 * - PMI calculation at LTV > 80%
 * - Amortization schedule generation
 * - analyzeMortgage() comprehensive analysis
 * - Edge cases (0% interest, very large loans)
 */

import { describe, it, expect } from 'vitest'
import {
  calcMonthlyPayment,
  calcPmi,
  buildAmortization,
  analyzeMortgage,
  type LoanInputs,
} from '@/lib/mortgage'

describe('Mortgage Calculations', () => {
  describe('calcMonthlyPayment', () => {
    it('should calculate correct monthly payment for standard 30-year loan', () => {
      // $300,000 loan at 6.75% for 30 years should be ~1979.73
      const payment = calcMonthlyPayment(300000, 6.75, 30)
      expect(payment).toBeCloseTo(1979.73, 1)
    })

    it('should calculate correct monthly payment for 15-year loan', () => {
      // $300,000 loan at 6.75% for 15 years should be ~2469.52
      const payment = calcMonthlyPayment(300000, 6.75, 15)
      expect(payment).toBeCloseTo(2469.52, 1)
    })

    it('should calculate correct payment for 20-year loan', () => {
      // $300,000 loan at 6.75% for 20 years
      const payment = calcMonthlyPayment(300000, 6.75, 20)
      expect(payment).toBeGreaterThan(2100)
      expect(payment).toBeLessThan(2300)
    })

    it('should handle 0% interest rate', () => {
      // At 0% interest, payment is simple division
      const payment = calcMonthlyPayment(300000, 0, 30)
      expect(payment).toBeCloseTo(300000 / 360, 2)
    })

    it('should calculate higher rate as higher payment', () => {
      const rate6 = calcMonthlyPayment(300000, 6, 30)
      const rate7 = calcMonthlyPayment(300000, 7, 30)
      expect(rate7).toBeGreaterThan(rate6)
    })

    it('should calculate longer term as lower payment', () => {
      const term15 = calcMonthlyPayment(300000, 6.75, 15)
      const term30 = calcMonthlyPayment(300000, 6.75, 30)
      expect(term30).toBeLessThan(term15)
    })

    it('should handle very large loan amounts', () => {
      const payment = calcMonthlyPayment(10000000, 6.75, 30)
      expect(payment).toBeGreaterThan(0)
      expect(payment).toBeCloseTo(10000000 * (calcMonthlyPayment(1, 6.75, 30)), 0)
    })

    it('should handle very small loan amounts', () => {
      const payment = calcMonthlyPayment(100, 6.75, 30)
      expect(payment).toBeGreaterThan(0)
      expect(payment).toBeCloseTo(0.66, 2)
    })

    it('should handle various interest rates', () => {
      const rates = [3, 4.5, 6, 7.5, 9]
      const payments = rates.map(r => calcMonthlyPayment(300000, r, 30))

      // Verify rates are strictly increasing with interest rate
      for (let i = 0; i < payments.length - 1; i++) {
        expect(payments[i + 1]).toBeGreaterThan(payments[i])
      }
    })
  })

  describe('calcPmi', () => {
    it('should calculate PMI when LTV > 80%', () => {
      // New loan: $300k property, $60k down (80% LTV = $240k loan)
      const pmi = calcPmi(240000, 300000, 240000)
      expect(pmi).toBeCloseTo(100, 0) // $240k * 0.5% / 12
    })

    it('should return 0 PMI when LTV = 80%', () => {
      // Exactly 80% LTV
      const pmi = calcPmi(240000, 300000, 240000)
      // At exactly 80%, PMI drops to 0
      expect(pmi).toBeLessThanOrEqual(0.01)
    })

    it('should return 0 PMI when LTV < 80%', () => {
      // Balance drops below 80% threshold
      const pmi = calcPmi(200000, 300000, 250000)
      expect(pmi).toBe(0)
    })

    it('should return PMI amount for 90% LTV (10% down)', () => {
      // $300k property, $30k down = $270k loan = 90% LTV
      const pmi = calcPmi(270000, 300000, 270000)
      expect(pmi).toBeCloseTo(112.5, 1) // $270k * 0.5% / 12
    })

    it('should decrease payment as loan balance decreases', () => {
      const loan = 270000
      const price = 300000

      const pmiNewBalance = calcPmi(270000, price, loan)
      const pmiAfterPayments = calcPmi(240000, price, loan)

      expect(pmiAfterPayments).toBeLessThanOrEqual(pmiNewBalance)
    })

    it('should handle 95% LTV (5% down)', () => {
      // $300k property, $15k down = $285k loan = 95% LTV
      const pmi = calcPmi(285000, 300000, 285000)
      expect(pmi).toBeCloseTo(118.75, 1)
    })

    it('should drop to 0 when balance reaches 80% of purchase price', () => {
      const price = 300000
      const threshold = price * 0.8 // $240k

      const pmiAboveThreshold = calcPmi(241000, price, 270000)
      const pmiAtThreshold = calcPmi(threshold, price, 270000)

      expect(pmiAboveThreshold).toBeGreaterThan(0)
      expect(pmiAtThreshold).toBe(0)
    })
  })

  describe('buildAmortization', () => {
    it('should generate correct number of rows (360 for 30-year)', () => {
      const schedule = buildAmortization(300000, 6.75, 30)
      expect(schedule).toHaveLength(360)
    })

    it('should generate correct number of rows (180 for 15-year)', () => {
      const schedule = buildAmortization(300000, 6.75, 15)
      expect(schedule).toHaveLength(180)
    })

    it('should have fixed monthly payment', () => {
      const schedule = buildAmortization(300000, 6.75, 30)
      const firstPayment = schedule[0].payment
      const lastPayment = schedule[359].payment

      expect(lastPayment).toBeCloseTo(firstPayment, 2)

      // All payments should be the same
      schedule.forEach(row => {
        expect(row.payment).toBeCloseTo(firstPayment, 2)
      })
    })

    it('should have decreasing interest and increasing principal', () => {
      const schedule = buildAmortization(300000, 6.75, 30)

      const firstInterest = schedule[0].interest
      const lastInterest = schedule[359].interest

      const firstPrincipal = schedule[0].principal
      const lastPrincipal = schedule[359].principal

      // Early months: more interest
      expect(firstInterest).toBeGreaterThan(lastInterest)

      // Late months: more principal
      expect(lastPrincipal).toBeGreaterThan(firstPrincipal)
    })

    it('should end with approximately zero balance', () => {
      const schedule = buildAmortization(300000, 6.75, 30)
      expect(schedule[359].balance).toBeCloseTo(0, 0)
    })

    it('should have principal + interest = payment', () => {
      const schedule = buildAmortization(300000, 6.75, 30)

      schedule.forEach(row => {
        expect(row.principal + row.interest).toBeCloseTo(row.payment, 2)
      })
    })

    it('should decrease balance each month', () => {
      const schedule = buildAmortization(300000, 6.75, 30)

      for (let i = 0; i < schedule.length - 1; i++) {
        expect(schedule[i + 1].balance).toBeLessThan(schedule[i].balance)
      }
    })

    it('should have correct balance calculation', () => {
      const schedule = buildAmortization(300000, 6.75, 30)

      let expectedBalance = 300000
      for (let i = 0; i < 10; i++) {
        expectedBalance -= schedule[i].principal
        expect(schedule[i].balance).toBeCloseTo(expectedBalance, 2)
      }
    })

    it('should handle 0% interest', () => {
      const schedule = buildAmortization(300000, 0, 30)

      // All interest should be 0
      schedule.forEach(row => {
        expect(row.interest).toBe(0)
        expect(row.principal).toBeCloseTo(row.payment, 2)
      })
    })

    it('should handle 15-year term correctly', () => {
      const schedule15 = buildAmortization(300000, 6.75, 15)
      const schedule30 = buildAmortization(300000, 6.75, 30)

      // 15-year should have higher monthly principal
      expect(schedule15[0].principal).toBeGreaterThan(schedule30[0].principal)

      // 15-year should finish in 180 months, not 360
      expect(schedule15[179].balance).toBeCloseTo(0, 0)
    })

    it('should have month numbers starting at 1', () => {
      const schedule = buildAmortization(300000, 6.75, 30)

      expect(schedule[0].month).toBe(1)
      expect(schedule[1].month).toBe(2)
      expect(schedule[359].month).toBe(360)
    })
  })

  describe('analyzeMortgage', () => {
    const baseInputs: LoanInputs = {
      purchasePrice: 500000,
      downPayment: 100000,
      annualRatePercent: 6.75,
      termYears: 30,
      annualPropertyTaxPercent: 1.2,
      annualInsuranceDollars: 1800,
      monthlyHoa: 300,
    }

    it('should calculate correct loan amount', () => {
      const result = analyzeMortgage(baseInputs)
      expect(result.loanAmount).toBe(400000)
    })

    it('should calculate correct LTV percentage', () => {
      const result = analyzeMortgage(baseInputs)
      expect(result.ltv).toBeCloseTo(80, 1)
    })

    it('should identify PMI requirement at LTV > 80%', () => {
      const inputs: LoanInputs = {
        ...baseInputs,
        downPayment: 50000, // 10% down = 90% LTV
      }
      const result = analyzeMortgage(inputs)
      expect(result.pmiRequired).toBe(true)
    })

    it('should not require PMI at LTV <= 80%', () => {
      const inputs: LoanInputs = {
        ...baseInputs,
        downPayment: 100000, // 20% down = 80% LTV
      }
      const result = analyzeMortgage(inputs)
      expect(result.pmiRequired).toBe(false)
    })

    it('should calculate monthly payment breakdown', () => {
      const result = analyzeMortgage(baseInputs)
      const monthly = result.monthly

      expect(monthly.principal).toBeGreaterThan(0)
      expect(monthly.interest).toBeGreaterThan(0)
      expect(monthly.propertyTax).toBeGreaterThan(0)
      expect(monthly.insurance).toBeGreaterThan(0)
      expect(monthly.hoa).toBe(300)
    })

    it('should sum monthly breakdown correctly', () => {
      const result = analyzeMortgage(baseInputs)
      const monthly = result.monthly

      const sum = monthly.principal + monthly.interest + monthly.pmi + monthly.propertyTax + monthly.insurance + monthly.hoa
      expect(sum).toBeCloseTo(monthly.total, 2)
    })

    it('should calculate property tax correctly', () => {
      const result = analyzeMortgage(baseInputs)
      // 1.2% of $500k = $6000/year = $500/month
      expect(result.monthly.propertyTax).toBeCloseTo(500, 0)
    })

    it('should calculate insurance correctly', () => {
      const result = analyzeMortgage(baseInputs)
      // $1800/year = $150/month
      expect(result.monthly.insurance).toBeCloseTo(150, 0)
    })

    it('should calculate total interest paid', () => {
      const result = analyzeMortgage(baseInputs)
      expect(result.totalInterestPaid).toBeGreaterThan(0)
      expect(result.totalInterestPaid).toBeLessThan(result.loanAmount * 1.5)
    })

    it('should calculate total cost of loan', () => {
      const result = analyzeMortgage(baseInputs)
      // Should include principal, interest, taxes, insurance, PMI, HOA
      expect(result.totalCostOfLoan).toBeGreaterThan(result.loanAmount)
    })

    it('should generate complete amortization schedule', () => {
      const result = analyzeMortgage(baseInputs)
      expect(result.amortization).toHaveLength(360)
    })

    it('should calculate PMI drop-off month when LTV <= 80%', () => {
      const inputs: LoanInputs = {
        ...baseInputs,
        downPayment: 50000, // 90% LTV, PMI required
      }
      const result = analyzeMortgage(inputs)
      expect(result.pmiRequired).toBe(true)
      expect(result.pmiMonths).toBeGreaterThan(0)
      expect(result.pmiMonths).toBeLessThanOrEqual(360)
    })

    it('should have 0 PMI months when not required', () => {
      const inputs: LoanInputs = {
        ...baseInputs,
        downPayment: 100000, // 20% down, no PMI
      }
      const result = analyzeMortgage(inputs)
      expect(result.pmiMonths).toBe(0)
    })

    it('should have matching monthly payment to amortization', () => {
      const result = analyzeMortgage(baseInputs)
      const firstAmortRow = result.amortization[0]
      const expectedPI = result.monthlyPrincipalInterest

      expect(firstAmortRow.payment).toBeCloseTo(expectedPI, 2)
    })

    it('should calculate for common scenarios (3% down)', () => {
      const inputs: LoanInputs = {
        purchasePrice: 300000,
        downPayment: 9000, // 3% down
        annualRatePercent: 6.5,
        termYears: 30,
        annualPropertyTaxPercent: 1.0,
        annualInsuranceDollars: 1200,
        monthlyHoa: 0,
      }
      const result = analyzeMortgage(inputs)

      expect(result.loanAmount).toBe(291000)
      expect(result.ltv).toBeCloseTo(97, 0)
      expect(result.pmiRequired).toBe(true)
      expect(result.monthly.total).toBeGreaterThan(0)
    })

    it('should calculate for luxury property (20% down)', () => {
      const inputs: LoanInputs = {
        purchasePrice: 2000000,
        downPayment: 400000, // 20% down
        annualRatePercent: 6.0,
        termYears: 30,
        annualPropertyTaxPercent: 1.5,
        annualInsuranceDollars: 4000,
        monthlyHoa: 500,
      }
      const result = analyzeMortgage(inputs)

      expect(result.pmiRequired).toBe(false)
      expect(result.monthly.total).toBeGreaterThan(8000)
    })

    it('should handle zero HOA', () => {
      const inputs: LoanInputs = {
        ...baseInputs,
        monthlyHoa: 0,
      }
      const result = analyzeMortgage(inputs)
      expect(result.monthly.hoa).toBe(0)
    })

    it('should handle zero insurance', () => {
      const inputs: LoanInputs = {
        ...baseInputs,
        annualInsuranceDollars: 0,
      }
      const result = analyzeMortgage(inputs)
      expect(result.monthly.insurance).toBe(0)
    })

    it('should handle zero property tax', () => {
      const inputs: LoanInputs = {
        ...baseInputs,
        annualPropertyTaxPercent: 0,
      }
      const result = analyzeMortgage(inputs)
      expect(result.monthly.propertyTax).toBe(0)
    })
  })

  describe('Edge Cases', () => {
    it('should handle very high interest rates (15%)', () => {
      const result = analyzeMortgage({
        purchasePrice: 300000,
        downPayment: 60000,
        annualRatePercent: 15,
        termYears: 30,
        annualPropertyTaxPercent: 1,
        annualInsuranceDollars: 1200,
        monthlyHoa: 0,
      })

      expect(result.monthly.total).toBeGreaterThan(0)
      expect(result.totalInterestPaid).toBeGreaterThan(result.loanAmount)
    })

    it('should handle very low interest rates (1%)', () => {
      const result = analyzeMortgage({
        purchasePrice: 300000,
        downPayment: 60000,
        annualRatePercent: 1,
        termYears: 30,
        annualPropertyTaxPercent: 1,
        annualInsuranceDollars: 1200,
        monthlyHoa: 0,
      })

      expect(result.monthly.total).toBeGreaterThan(0)
      expect(result.totalInterestPaid).toBeLessThan(result.loanAmount)
    })

    it('should handle short term (10 years)', () => {
      const result = analyzeMortgage({
        purchasePrice: 300000,
        downPayment: 60000,
        annualRatePercent: 6.5,
        termYears: 10,
        annualPropertyTaxPercent: 1,
        annualInsuranceDollars: 1200,
        monthlyHoa: 0,
      })

      expect(result.amortization).toHaveLength(120)
      expect(result.monthly.total).toBeGreaterThan(2500)
    })

    it('should handle maximum down payment (100%)', () => {
      const result = analyzeMortgage({
        purchasePrice: 300000,
        downPayment: 300000, // Cash purchase
        annualRatePercent: 6.5,
        termYears: 30,
        annualPropertyTaxPercent: 1,
        annualInsuranceDollars: 1200,
        monthlyHoa: 0,
      })

      expect(result.loanAmount).toBe(0)
      expect(result.pmiRequired).toBe(false)
    })

    it('should handle minimal down payment (0%)', () => {
      const result = analyzeMortgage({
        purchasePrice: 300000,
        downPayment: 0,
        annualRatePercent: 6.5,
        termYears: 30,
        annualPropertyTaxPercent: 1,
        annualInsuranceDollars: 1200,
        monthlyHoa: 0,
      })

      expect(result.loanAmount).toBe(300000)
      expect(result.ltv).toBe(100)
      expect(result.pmiRequired).toBe(true)
    })
  })
})
