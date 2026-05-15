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
import { type ComponentType, useEffect, useState } from 'react'
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

// ---------------------------------------------------------------------------
// Public types — consumers build their `steps` from these.
// ---------------------------------------------------------------------------

export type FieldKind =
  | 'money'    // prefix "$", integer-ish step
  | 'percent'  // stored as decimal (0.067), displayed as whole number (6.7), suffix "%"
  | 'months'   // suffix "mo"
  | 'years'    // suffix "yr"
  | 'number'   // bare number
  | 'bool'     // checkbox

export interface FieldDef {
  /** Key into the consumer's values object. */
  key: string
  label: string
  kind: FieldKind
  /** Optional one-line helper rendered under the field. */
  hint?: string
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

  return (
    <section
      className="overflow-hidden rounded-xl bg-card shadow-md ring-1 ring-border"
      style={{ borderTopColor: accentColor, borderTopWidth: 4 }}
    >
      <div className="p-6 md:p-8">
        <ProgressStrip
          current={safeStep}
          total={steps.length}
          accentColor={accentColor}
        />

        <header className="mt-6">
          <div
            className="inline-flex rounded-md p-2"
            style={{ backgroundColor: `${accentColor}1a` }}
          >
            <Icon className="h-5 w-5" style={{ color: accentColor }} />
          </div>
          <h2 className="mt-3 text-xl font-bold tracking-tight">
            {current.title}
          </h2>
          {current.description && (
            <p className="mt-1 text-sm text-stone-600">{current.description}</p>
          )}
        </header>

        {/* Step body. min-h keeps the card height stable across steps so
            the footer doesn't jump as the user clicks Next. */}
        <div className="mt-5 min-h-[260px]">
          <div className="grid gap-4 sm:grid-cols-2">
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
// Progress strip — N numbered dots connected by line segments. Completed
// steps fill + show a check; the active step fills; future steps are outline.
// ---------------------------------------------------------------------------

function ProgressStrip({
  current,
  total,
  accentColor,
}: {
  current: number
  total: number
  accentColor: string
}) {
  const dots = Array.from({ length: total }, (_, i) => i)
  return (
    <div
      className="flex items-center gap-2"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current + 1}
      aria-label={`Step ${current + 1} of ${total}`}
    >
      {dots.map((n, i) => {
        const isActive = n === current
        const isDone = n < current
        return (
          <div key={n} className="flex flex-1 items-center gap-2">
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
              {isDone ? <Check className="h-3.5 w-3.5" /> : n + 1}
            </span>
            {i < dots.length - 1 && (
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
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-input"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{def.label}</span>
      </label>
    )
  }

  const numericValue = typeof value === 'number' ? value : 0
  const isPercent = def.kind === 'percent'
  // Percent fields store a decimal but display a whole number.
  const displayValue = isPercent
    ? Math.round(numericValue * 100 * 1e4) / 1e4
    : numericValue

  const prefix = def.kind === 'money' ? '$' : ''
  const suffix =
    def.kind === 'percent' ? '%'
    : def.kind === 'months' ? 'mo'
    : def.kind === 'years' ? 'yr'
    : ''
  const step =
    def.kind === 'percent' ? '0.01'
    : def.kind === 'money' ? '100'
    : '1'

  return (
    <div className="space-y-1">
      <Label htmlFor={def.key} className="text-xs font-semibold text-stone-700">
        {def.label}
      </Label>
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
            onChange(isPercent ? raw / 100 : raw)
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

  return (
    <div className="space-y-3">
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
    </div>
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
