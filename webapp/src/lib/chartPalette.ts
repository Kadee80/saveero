/**
 * Saveero chart palette — colors tuned to match the cream/sage/terracotta
 * scenario illustrations. Same hue families as the old vivid Tailwind 500
 * tones (blue/violet/emerald/amber/rose) but dustier and warmer so charts
 * sit alongside the illustration set without clashing.
 *
 * Centralized so DecisionMap, ScenarioComparison, and any future chart
 * surface stay visually consistent.
 *
 * @module lib/chartPalette
 */

/**
 * Identity colors used both for per-scenario card accents AND as the data
 * series fill in scenario-tied charts. Order matches the canonical scenario
 * ordering: stay, refinance, sell_buy, rent, rent_out_buy.
 */
export const SCENARIO_PALETTE = {
  /** stay — dusty sky blue */
  blue: '#6b9bc7',
  /** refinance — muted plum */
  violet: '#9b7ca5',
  /** sell_buy — sage green */
  emerald: '#7ea76a',
  /** rent — warm mustard / sunshine yellow */
  amber: '#d9a13d',
  /** rent_out_buy — terracotta */
  rose: '#c8704c',
} as const

/**
 * Extended series for charts that need more than 5 colors (e.g. wealth-
 * source pie). Continues the warm/dusty palette into rose-pink and
 * dusty-indigo.
 */
export const CHART_SERIES = [
  SCENARIO_PALETTE.blue,
  SCENARIO_PALETTE.violet,
  SCENARIO_PALETTE.emerald,
  SCENARIO_PALETTE.amber,
  SCENARIO_PALETTE.rose,
  '#c4869a', // dusty rose
  '#7587b3', // dusty indigo
] as const

/** Muted red for negative / cost dimensions (e.g. interest paid, PMI). */
export const CHART_NEGATIVE = '#b85844'

/** Recharts <Tooltip contentStyle> tuned to the warm chrome. */
export const TOOLTIP_STYLE = {
  backgroundColor: '#fbf6ed', // warm cream — matches --background
  border: '1px solid #e8dcc9', // warm beige — matches --border
} as const
