/**
 * Fetches current US mortgage rates from the Federal Reserve (FRED API).
 *
 * Free API key: https://fred.stlouisfed.org/docs/api/api_key.html
 * Set VITE_FRED_API_KEY in your .env file.
 *
 * Series used:
 *   MORTGAGE30US — 30-year fixed rate (weekly, Freddie Mac PMMS)
 *   MORTGAGE15US — 15-year fixed rate (weekly, Freddie Mac PMMS)
 *
 * Falls back to hardcoded rates if the key is missing or the request fails.
 */

export interface CurrentRates {
  rate30yr: number // % e.g. 6.82
  rate15yr: number // % e.g. 6.13
  rate20yr: number // % interpolated — FRED doesn't publish 20yr directly
  asOf: string // ISO date string of the most recent data point
  source: 'fred' | 'fallback'
}

// Routed through Vite's proxy (/fred-proxy → https://api.stlouisfed.org/fred)
// to avoid CORS — FRED blocks direct browser requests.
const FRED_BASE = '/fred-proxy/series/observations'
const API_KEY = import.meta.env.VITE_FRED_API_KEY as string | undefined

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

/** Fetch live rates from FRED. Falls back gracefully if unavailable. */
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
 * Hardcoded fallback rates — update these periodically if FRED is unavailable.
 * These reflect approximate US averages as of early April 2026.
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
