/**
 * InputWizard — a reusable, data-driven step wizard for form-heavy pages.
 *
 * Extracted from the proven OnboardingWizard + FTHBDecisionMap inline-wizard
 * patterns. The #1 demo-feedback theme was that single tall forms overwhelm
 * users; this component is the standard answer — one group of fields per
 * screen, a progress strip, Back / Next / Finish.
 *
 * Consumers: the homeowner DecisionMap, FTHBDecisionMap, and
 * MortgageCalculator. Each supplies its own `steps` (groups of fields) and
 * holds the values in its own state — the wizard is fully controlled and
 * stateless about values, so it doesn't care what the underlying engine or
 * form library is.
 *
 * Value convention — IMPORTANT:
 *   `values` holds CANONICAL values. For `percent` fields that means the
 *   decimal the backend wants (0.067), NOT the whole-number percent.
 *   The wizard converts to/from the whole-number display (6.7) internally,
 *   so consumers never have to juggle toFormShape/fromFormShape — they pass
 *   engine-shaped values straight through.
 *
 * The current step is controlled by the parent (`step` / `onStepChange`)
 * so it survives recalcs and re-renders — e.g. a user who tweaked an
 * Advanced field and ran the engine stays on the Advanced step.
 *
 * @component
 */
import { type ComponentType, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, LayoutGrid, ListChecks, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { getMyLead } from '@/api/leadsApi'
import { HelpTip } from '@/components/HelpTip'
import { useFadeInOnMount } from '@/hooks/useGsapFadeIn'

// ---------------------------------------------------------------------------
// Public types — consumers build their `steps` from these.
// ---------------------------------------------------------------------------

export type FieldKind =
  | 'money'           // prefix "$", integer-ish step
  | 'percent'         // stored as decimal (0.067), displayed as whole number (6.7), suffix "%"
  | 'months'          // suffix "mo"
  | 'years'           // suffix "yr"
  // Stored as months (canonical, what the engine wants) but displayed
  // as years (whole number) with a "yr" suffix. Same pattern as
  // 'percent' — canonical decimal stored, whole-number displayed.
  // Added 2026-06-01 for Van's deck rename of `remaining_term_months`
  // to "Years Remaining on Mortgage" without touching the engine.
  | 'months_as_years'
  | 'number'          // bare number
  | 'bool'            // checkbox

export interface FieldDef {
  /** Key into the consumer's values object. */
  key: string
  label: string
  kind: FieldKind
  /** Optional one-line helper rendered under the field. */
  hint?: string
  /**
   * Optional tooltip slug into @/copy/tooltips. When set, a "?" affordance
   * is rendered next to the label that surfaces plain-English help on
   * hover/focus/tap. Unknown slugs render nothing — safe to add slugs
   * before the copy exists.
   */
  help?: string
}

/** Icon component shape — lucide-react icons satisfy this (className + style). */
type IconComponent = ComponentType<{
  className?: string
  style?: React.CSSProperties
}>

export interface WizardStep {
  title: string
  /** lucide-react icon (or any component taking className + style). */
  icon: IconComponent
  /** Optional sub-line under the step title. */
  description?: string
  /**
   * Optional per-step illustration. Renders inline at the top of the step
   * (~180px square) alongside the heading + description. Path is the
   * basename in /public/illustrations/ without extension — e.g.
   * 'decisionmap_step_home' → /illustrations/decisionmap_step_home.png.
   *
   * Added 2026-06-10 per Van's "feel like a real step wizard" feedback —
   * each step gets its own page treatment rather than the icon-chip-only
   * header pattern.
   */
  illustrationName?: string
  fields: FieldDef[]
}

/** Consumers hold values in this shape — canonical (decimals for percents). */
export type WizardValues = Record<string, number | boolean>

interface InputWizardProps {
  steps: WizardStep[]
  values: WizardValues
  onChange: (key: string, value: number | boolean) => void
  /** Runs on the last step's primary button — typically "recalculate". */
  onFinish: () => void
  /** Current step index (0-based) — controlled by the parent. */
  step: number
  onStepChange: (step: number) => void
  /** Disables the footer buttons + spins the finish icon. */
  loading?: boolean
  /** Primary-button label on the last step. Default "Recalculate". */
  finishLabel?: string
  /** Hex accent for the progress strip + primary buttons. Default dusty blue. */
  accentColor?: string
}

const DEFAULT_ACCENT = '#6b9bc7' // SCENARIO_PALETTE.blue — keeps the import light

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InputWizard({
  steps,
  values,
  onChange,
  onFinish,
  step,
  onStepChange,
  loading = false,
  finishLabel = 'Recalculate',
  accentColor = DEFAULT_ACCENT,
}: InputWizardProps) {
  // Clamp defensively — a consumer that changes its step list shouldn't be
  // able to strand the wizard on an out-of-range index.
  const safeStep = Math.min(Math.max(step, 0), steps.length - 1)
  const current = steps[safeStep]
  const Icon = current.icon
  const isLast = safeStep === steps.length - 1

  // Step-entrance animations. Description + illustration fade in on
  // every step change so the eye lands on what's actually new. The
  // heading is left alone — Katie 2026-06-10: animating the heading
  // re-runs felt clunky and pulled focus from the description copy,
  // which is what actually changes step-to-step in a way the user
  // needs to absorb. Bails out cleanly under prefers-reduced-motion
  // via the underlying hooks.
  const descRef = useRef<HTMLParagraphElement>(null)
  const illustrationRef = useRef<HTMLDivElement>(null)
  useFadeInOnMount(descRef, {
    y: 12,
    duration: 0.5,
    delay: 0.1,
    triggerKey: safeStep,
  })
  useFadeInOnMount(illustrationRef, {
    y: 12,
    duration: 0.6,
    delay: 0,
    triggerKey: safeStep,
  })

  return (
    <section
      // sticky top-0 pins the wizard at the top of the viewport when
      // the user scrolls down past it. Kept simple: no max-h/flex
      // gymnastics. Wizard renders at its natural height; if a
      // particular viewport is shorter than the wizard, the user can
      // still scroll within the page to see the bottom of the card.
      className="sticky top-0 overflow-hidden rounded-xl bg-card shadow-md ring-1 ring-border"
      style={{ borderTopColor: accentColor, borderTopWidth: 4 }}
    >
      <div className="px-6 pt-6 md:px-8 md:pt-8">
        <ProgressStrip
          steps={steps}
          current={safeStep}
          accentColor={accentColor}
        />

        {/* Step heading — larger and more breathing room per Van's deck
            (2026-06-01: "Use larger typography hierarchy. Current
            hierarchy is too flat.").
            Updated 2026-06-10: each step now optionally renders a small
            inline illustration alongside the heading, per the "feel
            like a real step wizard" feedback. When no illustrationName
            is supplied, the layout falls back to the original
            icon-chip-only header. */}
        <header className="mt-8 flex flex-col-reverse gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:min-h-[192px]">
          {/* Heading column. min-h matches the illustration's md:w-48
              so the header row stays a consistent height whether the
              description is one line or three. */}
          <div className="min-w-0 flex-1">
            <div
              className="inline-flex rounded-md p-2"
              style={{ backgroundColor: `${accentColor}1a` }}
            >
              <Icon className="h-5 w-5" style={{ color: accentColor }} />
            </div>
            <h2 className="mt-3 text-2xl font-bold tracking-tight md:text-3xl">
              {current.title}
            </h2>
            {current.description && (
              <p
                ref={descRef}
                className="mt-2 max-w-2xl text-base text-stone-600"
              >
                {current.description}
              </p>
            )}
          </div>
          {current.illustrationName && (
            <div
              ref={illustrationRef}
              className="aspect-square w-32 shrink-0 overflow-hidden rounded-xl ring-1 ring-border shadow-sm sm:w-44 md:w-48"
              style={{ backgroundColor: `${accentColor}0d` }}
            >
              <img
                src={`/illustrations/${current.illustrationName}.png`}
                alt=""
                aria-hidden="true"
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </div>
          )}
        </header>
      </div>

      {/* Step body — natural height. min-h-[420px] is sized for the
          largest step (DM "Tell us about your home", 9 fields → 5 rows
          in 2-col grid) so smaller steps render at the same card
          height. Reduced from 460→420px in 2026-06-10 to give the
          overall card a better chance of fitting in standard laptop
          viewports while sticky-pinned. */}
      <div className="px-6 pb-6 pt-7 md:px-8 md:pb-8">
        <div className="grid min-h-[420px] gap-4 sm:grid-cols-2">
          {current.fields.map((f) => (
            <FieldControl
              key={f.key}
              def={f}
              value={values[f.key]}
              onChange={(v) => onChange(f.key, v)}
            />
          ))}
        </div>
      </div>

      {/* Footer — Back left, primary action right. */}
      <div className="flex items-center justify-between gap-3 border-t border-border bg-stone-50/50 px-6 py-4">
        {safeStep > 0 ? (
          <Button
            type="button"
            variant="ghost"
            disabled={loading}
            onClick={() => onStepChange(safeStep - 1)}
          >
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
        ) : (
          <span className="text-xs text-stone-500">
            Step {safeStep + 1} of {steps.length}
          </span>
        )}

        {isLast ? (
          <Button
            type="button"
            size="lg"
            disabled={loading}
            onClick={onFinish}
            style={{ backgroundColor: accentColor }}
            className="shadow-md"
          >
            <RefreshCw className={cn('mr-1.5 h-4 w-4', loading && 'animate-spin')} />
            {loading ? 'Running…' : finishLabel}
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            disabled={loading}
            onClick={() => onStepChange(safeStep + 1)}
            style={{ backgroundColor: accentColor }}
            className="shadow-md"
          >
            Next <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Progress strip — numbered dots connected by line segments with each step's
// icon + title labeled beneath. Completed steps fill + show a check; the
// active step fills with its label emphasized; future steps stay outline-only
// with muted labels.
//
// Labels only render on md+ viewports — at narrow widths the 7-step
// label row collapses into the title pattern shown next to the icon chip
// below the strip, so the small-screen experience isn't a wall of
// truncated labels.
//
// Per Van's deck (2026-06-01): the bare numbered strip read like a loan
// application; named steps turn it into a guided journey ("Your Home →
// ... → Recommendation") rather than "step 1 of 7."
// ---------------------------------------------------------------------------

function ProgressStrip({
  steps,
  current,
  accentColor,
}: {
  steps: WizardStep[]
  current: number
  accentColor: string
}) {
  const total = steps.length
  return (
    <div
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current + 1}
      aria-label={`Step ${current + 1} of ${total}`}
    >
      {/* Dot row — same dots + connector pattern as before. */}
      <div className="flex items-center gap-2">
        {steps.map((_, i) => {
          const isActive = i === current
          const isDone = i < current
          return (
            <div key={i} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors',
                  isActive || isDone
                    ? 'border-transparent text-white'
                    : 'border-border bg-card text-stone-400',
                )}
                style={
                  isActive || isDone ? { backgroundColor: accentColor } : undefined
                }
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              {i < total - 1 && (
                <span
                  aria-hidden="true"
                  className="h-px flex-1 transition-colors"
                  style={{
                    backgroundColor: isDone ? accentColor : 'var(--border, #e7e5e4)',
                  }}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Step label row — md+ only. Each label sits under its dot
          (flex-1 cells line up with the dot row above). Icon left,
          title right, both styled by step state. */}
      <div className="mt-2 hidden gap-2 md:flex">
        {steps.map((step, i) => {
          const StepIcon = step.icon
          const isActive = i === current
          const isDone = i < current
          return (
            <div
              key={i}
              className={cn(
                'flex min-w-0 flex-1 items-center gap-1 text-xs leading-tight transition-colors',
                isActive ? 'font-semibold' : 'font-normal',
                !isActive && (isDone ? 'text-stone-500' : 'text-stone-400'),
              )}
              style={isActive ? { color: accentColor } : undefined}
            >
              <StepIcon className="h-3 w-3 shrink-0" />
              <span className="truncate">{step.title}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Field control — renders one FieldDef by kind. `percent` fields convert
// between the canonical decimal (in `value`) and the whole-number percent
// (shown in the input).
// ---------------------------------------------------------------------------

function FieldControl({
  def,
  value,
  onChange,
}: {
  def: FieldDef
  value: number | boolean | undefined
  onChange: (v: number | boolean) => void
}) {
  if (def.kind === 'bool') {
    return (
      <div className="flex items-center gap-2 self-end pb-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-input"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>{def.label}</span>
        </label>
        {def.help && <HelpTip slug={def.help} />}
      </div>
    )
  }

  const numericValue = typeof value === 'number' ? value : 0
  const isPercent = def.kind === 'percent'
  // `months_as_years` stores months canonically (what the engine wants)
  // but shows the user whole years. Same pattern as percent (decimal
  // stored / whole-number displayed).
  const isMonthsAsYears = def.kind === 'months_as_years'
  const displayValue = isPercent
    ? Math.round(numericValue * 100 * 1e4) / 1e4
    : isMonthsAsYears
      ? Math.round(numericValue / 12)
      : numericValue

  const prefix = def.kind === 'money' ? '$' : ''
  const suffix =
    def.kind === 'percent' ? '%'
    : def.kind === 'months' ? 'mo'
    : def.kind === 'years' || def.kind === 'months_as_years' ? 'yr'
    : ''
  const step =
    def.kind === 'percent' ? '0.01'
    : def.kind === 'money' ? '100'
    : '1'

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={def.key} className="text-xs font-semibold text-stone-700">
          {def.label}
        </Label>
        {def.help && <HelpTip slug={def.help} />}
      </div>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-stone-500">
            {prefix}
          </span>
        )}
        <Input
          id={def.key}
          type="number"
          step={step}
          className={cn(prefix && 'pl-7', suffix && 'pr-10')}
          value={Number.isFinite(displayValue) ? displayValue : 0}
          onChange={(e) => {
            const raw = e.target.value === '' ? 0 : Number(e.target.value)
            if (Number.isNaN(raw)) return
            // Convert back into canonical units before bubbling up.
            const canonical = isPercent
              ? raw / 100
              : isMonthsAsYears
                ? raw * 12
                : raw
            onChange(canonical)
          }}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-stone-500">
            {suffix}
          </span>
        )}
      </div>
      {def.hint && (
        <p className="text-xs text-stone-500">{def.hint}</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// InputGroupsForm — the dense "all fields at once" view. Same `steps` data
// as the wizard, just rendered as a stack of Card groups with a single
// Recalculate button at the bottom.
//
// This is the view pros (planners / agents / brokers) get by default —
// they're power users and a step wizard would just slow them down. The
// wizard remains the default for everyone else (the demo-feedback theme
// was that consumers find tall forms overwhelming).
// ---------------------------------------------------------------------------

interface InputGroupsFormProps {
  steps: WizardStep[]
  values: WizardValues
  onChange: (key: string, value: number | boolean) => void
  onFinish: () => void
  loading?: boolean
  finishLabel?: string
  accentColor?: string
}

export function InputGroupsForm({
  steps,
  values,
  onChange,
  onFinish,
  loading = false,
  finishLabel = 'Recalculate',
  accentColor = DEFAULT_ACCENT,
}: InputGroupsFormProps) {
  return (
    <div className="space-y-5">
      {steps.map((s) => {
        const Icon = s.icon
        return (
          <Card key={s.title}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Icon className="h-4 w-4" style={{ color: accentColor }} />
                {s.title}
              </CardTitle>
              {s.description && (
                <CardDescription className="text-xs text-stone-600">
                  {s.description}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {s.fields.map((f) => (
                <FieldControl
                  key={f.key}
                  def={f}
                  value={values[f.key]}
                  onChange={(v) => onChange(f.key, v)}
                />
              ))}
            </CardContent>
          </Card>
        )
      })}
      <div className="flex justify-end">
        <Button
          type="button"
          size="lg"
          disabled={loading}
          onClick={onFinish}
          style={{ backgroundColor: accentColor }}
          className="shadow-md"
        >
          <RefreshCw className={cn('mr-1.5 h-4 w-4', loading && 'animate-spin')} />
          {loading ? 'Running…' : finishLabel}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// InputCollector — the component pages actually render. Picks between the
// wizard and the dense form: pros (lead.role === 'pro') default to the
// dense form, everyone else defaults to the wizard. A toggle lets anyone
// flip, and the choice persists in localStorage keyed by `storageKey`.
//
// Once the user has explicitly toggled, their choice wins forever — the
// role-based default only applies until they express a preference.
// ---------------------------------------------------------------------------

export type InputViewMode = 'wizard' | 'form'

interface InputCollectorProps {
  steps: WizardStep[]
  values: WizardValues
  onChange: (key: string, value: number | boolean) => void
  onFinish: () => void
  /** Wizard step index — controlled by the parent (ignored in form view). */
  step: number
  onStepChange: (step: number) => void
  loading?: boolean
  finishLabel?: string
  accentColor?: string
  /** localStorage key the user's view-mode override is persisted under. */
  storageKey: string
}

export function InputCollector({
  storageKey,
  accentColor = DEFAULT_ACCENT,
  ...rest
}: InputCollectorProps) {
  // The user's persisted choice — null until they've toggled at least once.
  const [explicitMode, setExplicitMode] = useState<InputViewMode | null>(() => {
    if (typeof window === 'undefined') return null
    const saved = window.localStorage.getItem(storageKey)
    return saved === 'wizard' || saved === 'form' ? saved : null
  })
  // Role-derived default. Stays 'wizard' until/unless the lead loads as a pro.
  const [roleDefault, setRoleDefault] = useState<InputViewMode>('wizard')

  useEffect(() => {
    let cancelled = false
    getMyLead()
      .then((lead) => {
        if (!cancelled) {
          setRoleDefault(lead.role === 'pro' ? 'form' : 'wizard')
        }
      })
      .catch(() => {
        // Not signed in / no lead row / network — keep the wizard default.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const mode: InputViewMode = explicitMode ?? roleDefault

  function choose(next: InputViewMode) {
    setExplicitMode(next)
    try {
      window.localStorage.setItem(storageKey, next)
    } catch {
      // localStorage can throw in private mode — the in-memory state still
      // updates, the choice just won't survive a reload. Acceptable.
    }
  }

  // We render the toggle + wizard as a Fragment (no wrapping div) so the
  // wizard's containing block becomes the consumer page's outer wrapper
  // — not a div that's only a few pixels taller than the wizard. That
  // matters because InputWizard uses `position: sticky top-0` to pin
  // itself when the user scrolls down to look at results. A sticky
  // element can only stay stuck while its CONTAINING block remains in
  // viewport; with a tightly-fitting wrapper here, the sticky scroll
  // range was effectively zero (the wizard scrolled off with the
  // wrapper). Fragmenting hands the wizard up to the page wrapper
  // which extends well past the results panel.
  return (
    <>
      <ViewModeToggle mode={mode} onChange={choose} accentColor={accentColor} />
      {mode === 'wizard' ? (
        <InputWizard accentColor={accentColor} {...rest} />
      ) : (
        <InputGroupsForm
          accentColor={accentColor}
          steps={rest.steps}
          values={rest.values}
          onChange={rest.onChange}
          onFinish={rest.onFinish}
          loading={rest.loading}
          finishLabel={rest.finishLabel}
        />
      )}
    </>
  )
}

function ViewModeToggle({
  mode,
  onChange,
  accentColor,
}: {
  mode: InputViewMode
  onChange: (m: InputViewMode) => void
  accentColor: string
}) {
  const options: Array<{ value: InputViewMode; label: string; icon: typeof ListChecks }> = [
    { value: 'wizard', label: 'Step-by-step', icon: ListChecks },
    { value: 'form', label: 'All fields', icon: LayoutGrid },
  ]
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="text-xs text-stone-500">Input view</span>
      <div className="inline-flex rounded-md border border-border bg-card p-0.5">
        {options.map((o) => {
          const Icon = o.icon
          const active = mode === o.value
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              aria-pressed={active}
              className={cn(
                'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                active ? 'text-white' : 'text-stone-600 hover:bg-stone-50',
              )}
              style={active ? { backgroundColor: accentColor } : undefined}
            >
              <Icon className="h-3.5 w-3.5" />
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
