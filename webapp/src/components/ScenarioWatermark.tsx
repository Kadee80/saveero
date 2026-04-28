/**
 * ScenarioWatermark - illustrative scene tucked into the card corner
 *
 * Renders a small multi-color SVG illustration positioned absolutely
 * in the bottom-right of its parent card. These are real pictures —
 * cream-walled houses with warm roofs, sky/sun accents, scenario props
 * — not iconic line art. The scenario's accent color controls the
 * dominant element (roof, shield, target) via `currentColor`; the
 * surrounding atmosphere uses fixed warm/cool palette colors so each
 * scene reads as a small painting.
 *
 * Parent must be `relative isolate overflow-hidden` so the illustration
 * clips to the card edges and the negative `z-index` stays scoped.
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
  /** Tint color for the dominant element (roof, shield, etc.) */
  color?: string
  /** Override default opacity (0.22) */
  opacity?: number
  /** Override default size in px */
  size?: number
}

export function ScenarioWatermark({
  scene,
  color,
  opacity = 0.22,
  size = 280,
}: ScenarioWatermarkProps) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -bottom-6 -right-6 -z-10 select-none"
      style={{ color, opacity, width: size, height: size }}
    >
      {SCENES[scene]}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Palette — fixed accents that pair with any scenario tint
// ---------------------------------------------------------------------------
// sky    sky blue, gradient top
// horizon warm cream, gradient bottom
// grass  soft green
// sun    warm yellow
// cloud  white
// wall   warm cream
// door   wood brown
// window glass yellow (lit) or sky blue (daylit)
// trim   slate (subtle outlines)
const C = {
  sky: '#cfe8ff',
  horizon: '#fff5dc',
  grass: '#b8e0a6',
  sun: '#ffd166',
  cloud: '#ffffff',
  wall: '#fff5e6',
  door: '#8d5524',
  doorKnob: '#ffd166',
  windowLit: '#ffd166',
  windowDay: '#bcdcff',
  trim: '#5a6677',
  shadow: 'rgba(0,0,0,0.08)',
  red: '#e76f51',
  green: '#2a9d8f',
}

// ---------------------------------------------------------------------------
// Reusable scene fragments
// ---------------------------------------------------------------------------
const Sky = () => (
  <>
    <rect x="0" y="0" width="240" height="200" fill={C.sky} />
    <rect x="0" y="120" width="240" height="80" fill={C.horizon} />
    <ellipse cx="120" cy="186" rx="130" ry="14" fill={C.grass} opacity="0.85" />
  </>
)

const Sun = ({ cx = 205, cy = 40 }: { cx?: number; cy?: number }) => (
  <g>
    <circle cx={cx} cy={cy} r="14" fill={C.sun} />
    <g stroke={C.sun} strokeWidth="2.5" strokeLinecap="round">
      <line x1={cx - 22} y1={cy} x2={cx - 28} y2={cy} />
      <line x1={cx + 22} y1={cy} x2={cx + 28} y2={cy} />
      <line x1={cx} y1={cy - 22} x2={cx} y2={cy - 28} />
      <line x1={cx - 16} y1={cy - 16} x2={cx - 21} y2={cy - 21} />
      <line x1={cx + 16} y1={cy - 16} x2={cx + 21} y2={cy - 21} />
    </g>
  </g>
)

const Cloud = ({ x = 50, y = 35, scale = 1 }: { x?: number; y?: number; scale?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <ellipse cx="0" cy="0" rx="22" ry="10" fill={C.cloud} />
    <ellipse cx="18" cy="2" rx="14" ry="7" fill={C.cloud} />
    <ellipse cx="-15" cy="3" rx="10" ry="6" fill={C.cloud} />
  </g>
)

// ---------------------------------------------------------------------------
// SVG scenes
// ---------------------------------------------------------------------------

const SCENES: Record<WatermarkScene, ReactNode> = {
  // Cozy lived-in house — sun, clouds, smoke from chimney
  stay: (
    <svg viewBox="0 0 240 200" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <Sky />
      <Sun />
      <Cloud x={55} y={35} />
      <Cloud x={155} y={22} scale={0.7} />
      {/* house body */}
      <rect x="62" y="108" width="118" height="68" fill={C.wall} stroke={C.trim} strokeWidth="2" />
      {/* roof — scenario accent */}
      <path d="M52 112 L121 58 L190 112 Z" fill="currentColor" stroke={C.trim} strokeWidth="2" strokeLinejoin="round" />
      {/* chimney */}
      <rect x="156" y="68" width="12" height="22" fill="currentColor" stroke={C.trim} strokeWidth="2" />
      {/* smoke */}
      <circle cx="167" cy="56" r="6" fill={C.cloud} opacity="0.85" />
      <circle cx="174" cy="42" r="5" fill={C.cloud} opacity="0.7" />
      <circle cx="180" cy="30" r="4" fill={C.cloud} opacity="0.55" />
      {/* windows */}
      <rect x="76" y="124" width="22" height="20" fill={C.windowLit} stroke={C.trim} strokeWidth="2" />
      <line x1="87" y1="124" x2="87" y2="144" stroke={C.trim} strokeWidth="1.5" />
      <line x1="76" y1="134" x2="98" y2="134" stroke={C.trim} strokeWidth="1.5" />
      <rect x="144" y="124" width="22" height="20" fill={C.windowLit} stroke={C.trim} strokeWidth="2" />
      <line x1="155" y1="124" x2="155" y2="144" stroke={C.trim} strokeWidth="1.5" />
      <line x1="144" y1="134" x2="166" y2="134" stroke={C.trim} strokeWidth="1.5" />
      {/* door */}
      <rect x="108" y="138" width="26" height="38" fill={C.door} stroke={C.trim} strokeWidth="2" />
      <circle cx="129" cy="158" r="2" fill={C.doorKnob} />
      {/* welcome mat */}
      <rect x="103" y="174" width="36" height="4" fill={C.red} />
    </svg>
  ),

  // Same house, fresh terms — circular arrows + sparkle for "renewed"
  refinance: (
    <svg viewBox="0 0 240 200" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <Sky />
      <Sun cx={40} cy={38} />
      <Cloud x={170} y={32} scale={0.85} />
      {/* house */}
      <rect x="82" y="118" width="98" height="58" fill={C.wall} stroke={C.trim} strokeWidth="2" />
      <path d="M74 122 L131 76 L188 122 Z" fill="currentColor" stroke={C.trim} strokeWidth="2" strokeLinejoin="round" />
      <rect x="118" y="142" width="26" height="34" fill={C.door} stroke={C.trim} strokeWidth="2" />
      <circle cx="139" cy="160" r="2" fill={C.doorKnob} />
      <rect x="92" y="130" width="18" height="16" fill={C.windowDay} stroke={C.trim} strokeWidth="2" />
      <rect x="152" y="130" width="18" height="16" fill={C.windowDay} stroke={C.trim} strokeWidth="2" />
      {/* refresh arrows wrapping the house */}
      <g fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M30 130 A100 100 0 0 1 130 30" />
        <path d="M118 22 L130 30 L122 42" />
        <path d="M210 70 A100 100 0 0 1 130 170" />
        <path d="M138 178 L130 170 L142 162" />
      </g>
      {/* dollar sparkle */}
      <g transform="translate(28 78)">
        <circle r="14" fill={C.sun} stroke={C.trim} strokeWidth="2" />
        <text x="0" y="5" textAnchor="middle" fontSize="16" fontWeight="700" fill={C.trim}>$</text>
      </g>
    </svg>
  ),

  // Old house → moving truck → new house
  sell_buy: (
    <svg viewBox="0 0 240 200" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <Sky />
      <Cloud x={200} y={30} scale={0.6} />
      {/* old house — left, smaller */}
      <rect x="14" y="120" width="58" height="56" fill={C.wall} stroke={C.trim} strokeWidth="2" />
      <path d="M8 124 L43 92 L78 124 Z" fill="currentColor" stroke={C.trim} strokeWidth="2" strokeLinejoin="round" />
      <rect x="36" y="142" width="14" height="34" fill={C.door} stroke={C.trim} strokeWidth="2" />
      <rect x="20" y="130" width="12" height="12" fill={C.windowDay} stroke={C.trim} strokeWidth="1.5" />
      <rect x="54" y="130" width="12" height="12" fill={C.windowDay} stroke={C.trim} strokeWidth="1.5" />
      {/* SOLD sign */}
      <g transform="translate(78 100)">
        <line x1="0" y1="0" x2="0" y2="40" stroke={C.trim} strokeWidth="2" />
        <rect x="-2" y="0" width="38" height="22" fill={C.red} stroke={C.trim} strokeWidth="2" />
        <text x="17" y="15" textAnchor="middle" fontSize="11" fontWeight="700" fill={C.cloud}>SOLD</text>
      </g>
      {/* arrow */}
      <g stroke={C.trim} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <line x1="92" y1="138" x2="128" y2="138" />
        <path d="M120 130 L130 138 L120 146" />
      </g>
      {/* new house — right, bigger */}
      <rect x="138" y="110" width="84" height="66" fill={C.wall} stroke={C.trim} strokeWidth="2" />
      <path d="M130 114 L180 70 L230 114 Z" fill="currentColor" stroke={C.trim} strokeWidth="2" strokeLinejoin="round" />
      <rect x="172" y="138" width="22" height="38" fill={C.door} stroke={C.trim} strokeWidth="2" />
      <circle cx="190" cy="158" r="2" fill={C.doorKnob} />
      <rect x="146" y="124" width="16" height="14" fill={C.windowLit} stroke={C.trim} strokeWidth="1.5" />
      <rect x="204" y="124" width="16" height="14" fill={C.windowLit} stroke={C.trim} strokeWidth="1.5" />
    </svg>
  ),

  // Apartment building — units lit at different intensities = rental income
  rent: (
    <svg viewBox="0 0 240 200" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <Sky />
      <Cloud x={50} y={32} scale={0.8} />
      <Sun cx={200} cy={42} />
      {/* building body */}
      <rect x="58" y="48" width="124" height="128" fill={C.wall} stroke={C.trim} strokeWidth="2" />
      {/* roof cap */}
      <rect x="50" y="40" width="140" height="14" fill="currentColor" stroke={C.trim} strokeWidth="2" />
      {/* windows — alternating lit/day */}
      <g stroke={C.trim} strokeWidth="2">
        <rect x="74" y="62" width="22" height="22" fill={C.windowLit} />
        <rect x="108" y="62" width="22" height="22" fill={C.windowDay} />
        <rect x="142" y="62" width="22" height="22" fill={C.windowLit} />
        <rect x="74" y="98" width="22" height="22" fill={C.windowDay} />
        <rect x="108" y="98" width="22" height="22" fill={C.windowLit} />
        <rect x="142" y="98" width="22" height="22" fill={C.windowDay} />
        <rect x="74" y="134" width="22" height="22" fill={C.windowLit} />
        <rect x="142" y="134" width="22" height="22" fill={C.windowLit} />
      </g>
      {/* entrance */}
      <rect x="108" y="134" width="22" height="42" fill={C.door} stroke={C.trim} strokeWidth="2" />
      <circle cx="125" cy="156" r="2" fill={C.doorKnob} />
      {/* small "FOR RENT" placard */}
      <g transform="translate(190 95)">
        <rect width="34" height="20" rx="2" fill={C.green} stroke={C.trim} strokeWidth="1.5" />
        <text x="17" y="14" textAnchor="middle" fontSize="9" fontWeight="700" fill={C.cloud}>RENT</text>
      </g>
    </svg>
  ),

  // Two homes — keep one (rent it out, $ above) and buy the other
  rent_out_buy: (
    <svg viewBox="0 0 240 200" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <Sky />
      <Cloud x={60} y={28} scale={0.7} />
      <Cloud x={190} y={38} scale={0.8} />
      {/* left house — kept and rented */}
      <rect x="14" y="120" width="86" height="56" fill={C.wall} stroke={C.trim} strokeWidth="2" />
      <path d="M8 124 L57 84 L106 124 Z" fill="currentColor" stroke={C.trim} strokeWidth="2" strokeLinejoin="round" />
      <rect x="48" y="142" width="18" height="34" fill={C.door} stroke={C.trim} strokeWidth="2" />
      <rect x="22" y="132" width="14" height="14" fill={C.windowLit} stroke={C.trim} strokeWidth="1.5" />
      <rect x="78" y="132" width="14" height="14" fill={C.windowLit} stroke={C.trim} strokeWidth="1.5" />
      {/* $ over left house = rental income */}
      <g transform="translate(57 70)">
        <circle r="11" fill={C.green} stroke={C.trim} strokeWidth="2" />
        <text x="0" y="4" textAnchor="middle" fontSize="13" fontWeight="700" fill={C.cloud}>$</text>
      </g>
      {/* right house — newly bought */}
      <rect x="134" y="118" width="92" height="58" fill={C.wall} stroke={C.trim} strokeWidth="2" />
      <path d="M126 122 L180 78 L234 122 Z" fill="currentColor" stroke={C.trim} strokeWidth="2" strokeLinejoin="round" />
      <rect x="170" y="140" width="22" height="36" fill={C.door} stroke={C.trim} strokeWidth="2" />
      <circle cx="187" cy="158" r="2" fill={C.doorKnob} />
      <rect x="142" y="130" width="14" height="14" fill={C.windowDay} stroke={C.trim} strokeWidth="1.5" />
      <rect x="204" y="130" width="14" height="14" fill={C.windowDay} stroke={C.trim} strokeWidth="1.5" />
      {/* key over right house = newly purchased */}
      <g transform="translate(180 64) rotate(-25)" stroke={C.trim} strokeWidth="2" fill={C.sun}>
        <circle cx="0" cy="0" r="6" />
        <rect x="6" y="-2" width="18" height="4" />
        <rect x="20" y="2" width="3" height="5" />
      </g>
    </svg>
  ),

  // Shield with checkmark — protected, conservative
  shield: (
    <svg viewBox="0 0 240 200" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <Sky />
      <Cloud x={42} y={32} scale={0.7} />
      <Cloud x={200} y={28} scale={0.6} />
      {/* shield */}
      <path
        d="M120 30 L186 56 L186 110 Q186 152 120 178 Q54 152 54 110 L54 56 Z"
        fill="currentColor"
        stroke={C.trim}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* inner shield band */}
      <path
        d="M120 46 L172 66 L172 108 Q172 142 120 162 Q68 142 68 108 L68 66 Z"
        fill="none"
        stroke={C.cloud}
        strokeWidth="2"
        strokeOpacity="0.7"
      />
      {/* checkmark */}
      <path
        d="M88 108 L110 130 L154 84"
        fill="none"
        stroke={C.cloud}
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),

  // Lightning bolt with energy halo — best monthly affordability
  zap: (
    <svg viewBox="0 0 240 200" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <Sky />
      <Cloud x={50} y={30} scale={0.7} />
      {/* energy halo rings */}
      <circle cx="120" cy="100" r="80" fill="none" stroke={C.sun} strokeWidth="3" strokeDasharray="4 6" opacity="0.55" />
      <circle cx="120" cy="100" r="58" fill="none" stroke={C.sun} strokeWidth="2" strokeDasharray="3 5" opacity="0.7" />
      {/* bolt */}
      <path
        d="M138 22 L72 116 L114 116 L96 178 L172 84 L128 84 L148 22 Z"
        fill="currentColor"
        stroke={C.trim}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* sparks */}
      <circle cx="40" cy="60" r="3" fill={C.sun} />
      <circle cx="200" cy="80" r="4" fill={C.sun} />
      <circle cx="60" cy="160" r="3" fill={C.sun} />
      <circle cx="195" cy="170" r="3" fill={C.sun} />
    </svg>
  ),

  // Bullseye target with arrow striking center — best long-term
  target: (
    <svg viewBox="0 0 240 200" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <Sky />
      <Cloud x={42} y={30} scale={0.65} />
      <Cloud x={200} y={38} scale={0.6} />
      {/* outer ring */}
      <circle cx="120" cy="104" r="74" fill={C.cloud} stroke={C.trim} strokeWidth="3" />
      <circle cx="120" cy="104" r="74" fill="currentColor" opacity="0.18" />
      {/* mid ring */}
      <circle cx="120" cy="104" r="52" fill="currentColor" opacity="0.45" stroke={C.trim} strokeWidth="2" />
      {/* inner ring */}
      <circle cx="120" cy="104" r="30" fill={C.cloud} stroke={C.trim} strokeWidth="2" />
      {/* bullseye */}
      <circle cx="120" cy="104" r="12" fill={C.red} stroke={C.trim} strokeWidth="2" />
      {/* arrow shaft */}
      <line x1="184" y1="40" x2="124" y2="100" stroke={C.door} strokeWidth="5" strokeLinecap="round" />
      {/* arrow fletching */}
      <polygon points="184,40 196,32 200,46 188,52" fill={C.red} stroke={C.trim} strokeWidth="1.5" strokeLinejoin="round" />
      {/* arrow head */}
      <polygon points="124,100 132,96 130,108" fill={C.trim} />
    </svg>
  ),
}
