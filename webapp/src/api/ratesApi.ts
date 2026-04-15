/**
 * Mortgage rates API module - Federal Reserve (FRED API) integration
 *
 * Fetches current US mortgage rates from the Federal Reserve Economic Data (FRED) service.
 * Provides weekly rates for 15-year and 30-year fixed mortgages from Freddie Mac PMMS.
 *
 * Setup:
 * - Free FRED API key: https://fred.stlouisfed.org/docs/api/api_key.html
 * - Set VITE_FRED_API_KEY in your .env file
 * - Backend must proxy FRED requests (Vite proxy on dev, cloud function on production)
 *   to avoid CORS restrictions
 *
 * Rates fetched:
 * - MORTGAGE30US: 30-year fixed rate (weekly Freddie Mac PMMS)
 * - MORTGAGE15US: 15-year fixed rate (weekly Freddie Mac PMMS)
 * - MORTGAGE20YR: Interpolated (average of 15-year and 30-year, not published by FRED)
 *
 * Fallback behavior:
 * - If API key is missing, returns hardcoded rates
 * - If FRED API is unreachable, returns hardcoded rates
 * - Errors are caught silently for graceful degradation
 *
 * @module api/ratesApi
 * @example
 * import { fetchCurrentRates } from '@/api/ratesApi'
 *
 * const rates = await fetchCurrentRates()
 * console.log(`30-year: ${rates.rate30yr}%`)
 * console.log(`Source: ${rates.source}`)  // "fred" or "fallback"
 */

/**
 * Current mortgage rates from Federal Reserve
 */
export interface CurrentRates {
  /** 30-year fixed rate as percentage (e.g., 6.82) */
  rate30yr: number
  /** 15-year fixed rate as percentage (e.g., 6.13) */
  rate15yr: number
  /** 20-year fixed rate as percentage (e.g., 6.48) - interpolated, not published by FRED */
  rate20yr: number
  /** ISO date string of the most recent data point from FRED */
  asOf: string
  /** Source of rates: 'fred' = live from Federal Reserve, 'fallback' = hardcoded estimate */
  source: 'fred' | 'fallback'
}

/**
 * FRED API endpoint path - routed through Vite's proxy in dev
 * In production, this is handled by a cloud function to avoid CORS
 * Vite proxy routes /fred-proxy → https://api.stlouisfed.org/fred
 * to work around CORS restrictions on browser requests to FRED.
 *
 * @see https://fred.stlouisfed.org/docs/api/fred/
 */
const FRED_BASE = '/fred-proxy/series/observations'

/**
 * FRED API key from environment
 * Get free key at https://fred.stlouisfed.org/docs/api/api_key.html
 */
const API_KEY = import.meta.env.VITE_FRED_API_KEY as string | undefined

/**
 * Fetch a single mortgage rate series from FRED
 *
 * Internal helper - fetches the most recent observation for a given series ID.
 * FRED returns weekly data in descending order, so limit=1 gets the latest.
 *
 * @param {string} seriesId - FRED series ID (e.g., "MORTGAGE30US", "MORTGAGE15US")
 * @returns {Promise<{value: number; date: string}>} Rate value and observation date
 * @throws {Error} If API key is missing or FRED request fails
 *
 * @example
 * const { value, date } = await fetchSeries('MORTGAGE30US')
 * console.log(`30-year rate: ${value}% as of ${date}`)
 */
async function fetchSeries(
  seriesId: string
): Promise<{value: number; date: string}> {
  if (!API_KEY) throw new Error('No FRED API key')

  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: API_KEY,
    sort_order: 'desc',
    limit: '1',
    file_type: 'json',
  })

  const res = await fetch(`${FRED_BASE}?${params.toString()}`)
  if (!res.ok) throw new Error(`FRED API error: ${res.status}`)

  const data = await res.json()
  const obs = data.observations?.[0]
  if (!obs || obs.value === '.') throw new Error('No data returned')

  return {value: parseFloat(obs.value), date: obs.date}
}

/**
 * Fetch current US mortgage rates from Federal Reserve
 *
 * Fetches 15-year and 30-year rates from FRED (Freddie Mac PMMS weekly data).
 * Interpolates 20-year rate as average of the two (FRED doesn't publish 20-year).
 *
 * Falls back gracefully to estimated rates if:
 * - API key is not configured (VITE_FRED_API_KEY)
 * - FRED API is unreachable or returns an error
 * - Response format is unexpected
 *
 * No errors are thrown - always returns a CurrentRates object,
 * either with live data (source: 'fred') or fallback (source: 'fallback').
 *
 * @returns {Promise<CurrentRates>} Current rates with source information
 * @throws {Never} Never throws - always returns data with fallback if needed
 *
 * @example
 * const rates = await fetchCurrentRates()
 * console.log(`30yr: ${rates.rate30yr}%`)
 * console.log(`Source: ${rates.source}`)  // "fred" or "fallback"
 *
 * if (rates.source === 'fallback') {
 *   console.warn('Using estimated rates - add VITE_FRED_API_KEY for live data')
 * }
 */
export async function fetchCurrentRates(): Promise<CurrentRates> {
  try {
    const [r30, r15] = await Promise.all([
      fetchSeries('MORTGAGE30US'),
      fetchSeries('MORTGAGE15US'),
    ])

    // 20-year isn't published by FRED — interpolate between 15 and 30
    const rate20yr = parseFloat(((r15.value + r30.value) / 2).toFixed(2))

    return {
      rate30yr: r30.value,
      rate15yr: r15.value,
      rate20yr,
      asOf: r30.date,
      source: 'fred',
    }
  } catch {
    return getFallbackRates()
  }
}

/**
 * Hardcoded fallback rates - used when FRED API is unavailable
 *
 * Update these periodically to reflect current market rates.
 * These are approximate US averages as of early April 2026.
 * The 20-year rate is interpolated from 15 and 30-year rates.
 *
 * This function is called when:
 * - VITE_FRED_API_KEY is not configured
 * - FRED API is unreachable
 * - FRED returns an error or unexpected format
 *
 * @returns {CurrentRates} Fallback rates object
 *
 * @internal
 */
function getFallbackRates(): CurrentRates {
  return {
    rate30yr: 6.82,
    rate15yr: 6.13,
    rate20yr: 6.48,
    asOf: '2026-04-03',
    source: 'fallback',
  }
}
