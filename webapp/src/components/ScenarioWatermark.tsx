/**
 * ScenarioWatermark - faint background illustration for scenario cards
 *
 * Renders an inline SVG illustration positioned absolutely in the
 * bottom-right of its parent card at low opacity so it reads as a
 * decorative watermark behind the metrics, not a foreground element.
 *
 * Style is flat vector (unDraw-adjacent): single-color line/fill art
 * that picks up its color from the parent via `currentColor`. Pass the
 * scenario's accent color through `color` and we tint to match.
 *
 * Parent must be `relative overflow-hidden` so the watermark clips to
 * the card edges instead of overflowing.
 *
 * @module components/ScenarioWatermark
 */
import { type ReactNode } from 'react'

export type WatermarkScene =
  | 'stay'
  | 'refinance'
  | 'sell_buy'
  | 'rent'
  | 'rent_out_buy'
  | 'shield'
  | 'zap'
  | 'target'

interface ScenarioWatermarkProps {
  scene: WatermarkScene
  /** Tint color — falls back to currentColor if omitted */
  color?: string
  /** Override default opacity (0.07) */
  opacity?: number
  /** Override default size in px */
  size?: number
}

export function ScenarioWatermark({
  scene,
  color,
  opacity = 0.08,
  size = 240,
}: ScenarioWatermarkProps) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -bottom-4 -right-4 -z-10 select-none"
      style={{ color, opacity, width: size, height: size }}
    >
      {SCENES[scene]}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SVG scenes
//
// Each scene uses currentColor for stroke/fill so the parent's `color`
// controls the tint. viewBox is 200x200 except where noted, so all scenes
// render at a consistent visual weight.
// ---------------------------------------------------------------------------

const SCENES: Record<WatermarkScene, ReactNode> = {
  // Cozy house — settled, nothing changes
  stay: (
    <svg
      viewBox="0 0 200 200"
      width="100%"
      height="100%"
      fill="none"
      stroke="currentColor"
      strokeWidth={6}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d="M30 95 L100 40 L170 95 L170 175 L30 175 Z" />
      <rect x="85" y="125" width="30" height="50" />
      <rect x="50" y="110" width="22" height="22" />
      <rect x="128" y="110" width="22" height="22" />
      <line x1="140" y1="55" x2="140" y2="85" />
      <circle cx="148" cy="42" r="5" fill="currentColor" />
      <circle cx="158" cy="28" r="4" fill="currentColor" />
    </svg>
  ),

  // Same house, fresh terms — circular refresh arrows around it
  refinance: (
    <svg
      viewBox="0 0 200 200"
      width="100%"
      height="100%"
      fill="none"
      stroke="currentColor"
      strokeWidth={5}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d="M70 115 L100 88 L130 115 L130 155 L70 155 Z" />
      <rect x="93" y="130" width="14" height="25" />
      <path d="M30 100 A70 70 0 0 1 100 30" />
      <path d="M88 24 L100 30 L94 42" />
      <path d="M170 100 A70 70 0 0 1 100 170" />
      <path d="M112 176 L100 170 L106 158" />
    </svg>
  ),

  // Old house → new house, with an arrow between
  sell_buy: (
    <svg
      viewBox="0 0 220 200"
      width="100%"
      height="100%"
      fill="none"
      stroke="currentColor"
      strokeWidth={5}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d="M15 115 L52 85 L88 115 L88 165 L15 165 Z" />
      <rect x="46" y="135" width="13" height="30" />
      <line x1="98" y1="130" x2="128" y2="130" />
      <path d="M120 122 L128 130 L120 138" />
      <path d="M138 105 L178 65 L218 105 L218 170 L138 170 Z" />
      <rect x="170" y="135" width="14" height="35" />
      <rect x="150" y="118" width="15" height="15" />
    </svg>
  ),

  // Apartment building — multiple units suggests rental income
  rent: (
    <svg
      viewBox="0 0 200 200"
      width="100%"
      height="100%"
      fill="none"
      stroke="currentColor"
      strokeWidth={5}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <rect x="45" y="40" width="110" height="135" />
      <rect x="60" y="55" width="22" height="22" />
      <rect x="118" y="55" width="22" height="22" />
      <rect x="60" y="90" width="22" height="22" />
      <rect x="118" y="90" width="22" height="22" />
      <rect x="60" y="125" width="22" height="22" />
      <rect x="118" y="125" width="22" height="22" />
      <rect x="88" y="155" width="24" height="20" />
    </svg>
  ),

  // Two homes side by side — keep one, buy another
  rent_out_buy: (
    <svg
      viewBox="0 0 220 200"
      width="100%"
      height="100%"
      fill="none"
      stroke="currentColor"
      strokeWidth={5}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d="M10 115 L52 78 L94 115 L94 170 L10 170 Z" />
      <rect x="46" y="135" width="14" height="35" />
      <rect x="22" y="120" width="16" height="16" />
      <rect x="68" y="120" width="16" height="16" />
      <path d="M120 100 L162 60 L204 100 L204 170 L120 170 Z" />
      <rect x="156" y="130" width="14" height="40" />
      <rect x="132" y="115" width="16" height="16" />
      <rect x="178" y="115" width="16" height="16" />
    </svg>
  ),

  // Compare-page motifs — riffs on the existing Shield/Zap/Target hero icons
  shield: (
    <svg
      viewBox="0 0 200 200"
      width="100%"
      height="100%"
      fill="none"
      stroke="currentColor"
      strokeWidth={6}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d="M100 25 L165 50 L165 105 Q165 145 100 175 Q35 145 35 105 L35 50 Z" />
      <path d="M75 100 L92 117 L130 80" />
    </svg>
  ),

  zap: (
    <svg
      viewBox="0 0 200 200"
      width="100%"
      height="100%"
      fill="none"
      stroke="currentColor"
      strokeWidth={6}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d="M115 20 L55 110 L95 110 L80 180 L150 80 L110 80 L125 20 Z" />
    </svg>
  ),

  target: (
    <svg
      viewBox="0 0 200 200"
      width="100%"
      height="100%"
      fill="none"
      stroke="currentColor"
      strokeWidth={6}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <circle cx="100" cy="100" r="70" />
      <circle cx="100" cy="100" r="45" />
      <circle cx="100" cy="100" r="20" />
      <line x1="100" y1="20" x2="100" y2="50" />
      <line x1="100" y1="150" x2="100" y2="180" />
      <line x1="20" y1="100" x2="50" y2="100" />
      <line x1="150" y1="100" x2="180" y2="100" />
    </svg>
  ),
}
