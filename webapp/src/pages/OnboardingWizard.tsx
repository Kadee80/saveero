/**
 * OnboardingWizard — post-signup, 4-step wizard for lead enrichment.
 *
 * Phase B of the CRM build, polished after the first influencer demo
 * (2026-05-13). The previous version crammed two questions onto a single
 * card; testers consistently overlooked the second question and the
 * submit button felt premature. The wizard now walks the user through
 * one decision at a time:
 *
 *     1. Name      (required to advance — pre-filled from signup metadata)
 *     2. Role      (skippable)
 *     3. Intent    (skippable)
 *     4. Pipeline  (skippable — who they want to be matched with)
 *
 * One PUT lands at the end with whatever was selected, so the wizard
 * still produces a single CRM transition (status `new` → `enriched`)
 * even though the user touched up to four screens.
 *
 * Design intent:
 *   - One question per screen with a calm progress strip up top so the
 *     user always knows how much further they have to go.
 *   - Back is always one click away; Next is the primary affordance.
 *   - Same visual language as Landing / Dashboard — warm cream
 *     background, dusty-blue primary, rounded-xl shadowed card.
 *   - Once the final PUT lands, the Dashboard refetches the lead and
 *     the hub layout replaces this wizard. The wizard never shows again
 *     because role/intent are no longer 'unknown'.
 *
 * @component
 * @param {Object} props
 * @param {Lead | null | undefined} props.lead - Current lead row. Used to
 *   pre-fill the name input so users who provided a name at signup don't
 *   have to retype it. Optional — wizard works without it.
 * @param {() => void} props.onComplete - Called after a successful PUT.
 *   Parent should refetch the lead so the hub renders next.
 * @returns {JSX.Element}
 */
import { useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Building2,
  Check,
  Compass,
  DollarSign,
  Home,
  KeyRound,
  User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SCENARIO_PALETTE } from '@/lib/chartPalette'
import {
  updateMyLead,
  type Lead,
  type LeadIntent,
  type LeadRole,
} from '@/api/leadsApi'

// ---------------------------------------------------------------------------
// UI option shapes — kept local so the wizard owns its own copy + ordering
// rather than leaking these strings into the API module.
// ---------------------------------------------------------------------------

interface RoleOption {
  /** Maps directly to the LeadRole enum. */
  value: Exclude<LeadRole, 'unknown'>
  label: string
  blurb: string
  icon: typeof Home
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    value: 'homeowner',
    label: 'Homeowner',
    blurb: "I'm modeling my own move.",
    icon: Home,
  },
  {
    value: 'pro',
    label: 'Pro',
    blurb: 'Planner, agent, or broker.',
    icon: Briefcase,
  },
]

interface IntentOption {
  value: Exclude<LeadIntent, 'unknown'>
  label: string
  blurb: string
}

const INTENT_OPTIONS: IntentOption[] = [
  {
    value: 'considering_move',
    label: 'Considering a move',
    blurb: 'Thinking about selling and buying somewhere new.',
  },
  {
    value: 'refinance',
    label: 'Refinance',
    blurb: 'Same house, looking at a better rate.',
  },
  {
    value: 'rental_explore',
    label: 'Exploring renting it out',
    blurb: 'Curious whether the home works as income property.',
  },
  {
    value: 'curious',
    label: 'Just curious',
    blurb: 'Kicking the tires — no specific decision yet.',
  },
]

interface PipelineOption {
  /** String column on `leads.pipeline` — these slugs match what the admin
   *  "Edit details" form writes, so admin + user enrichment stay in sync. */
  value: 'financial-planner' | 'real-estate-agent' | 'mortgage-broker'
  label: string
  blurb: string
  icon: typeof Home
}

const PIPELINE_OPTIONS: PipelineOption[] = [
  {
    value: 'financial-planner',
    label: 'Financial planner',
    blurb: 'Frame the move in the context of my whole financial picture.',
    icon: DollarSign,
  },
  {
    value: 'real-estate-agent',
    label: 'Real estate agent',
    blurb: 'Help me actually find a place — or sell one.',
    icon: Building2,
  },
  {
    value: 'mortgage-broker',
    label: 'Mortgage broker',
    blurb: 'Get me real rates and pre-qualification.',
    icon: KeyRound,
  },
]

const TOTAL_STEPS = 4

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface OnboardingWizardProps {
  lead?: Lead | null
  onComplete: () => void
}

export default function OnboardingWizard({
  lead,
  onComplete,
}: OnboardingWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [name, setName] = useState<string>(lead?.name ?? '')
  // Pre-fill role / intent / pipeline from the existing lead row when
  // possible. Normally Dashboard only mounts this wizard when role or
  // intent are still 'unknown', so in practice these initial values come
  // out null — but if a partially-filled lead ever hits the wizard
  // (e.g. admin reset just one field), we don't want to silently wipe
  // the others.
  const [role, setRole] = useState<RoleOption['value'] | null>(
    lead && lead.role !== 'unknown' ? (lead.role as RoleOption['value']) : null,
  )
  const [intent, setIntent] = useState<IntentOption['value'] | null>(
    lead && lead.intent !== 'unknown'
      ? (lead.intent as IntentOption['value'])
      : null,
  )
  const [pipeline, setPipeline] = useState<PipelineOption['value'] | null>(
    (lead?.pipeline as PipelineOption['value']) ?? null,
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmedName = name.trim()
  // Only the name step gates Next. Role / intent / pipeline are optional
  // — Next always advances; nothing selected means that field just
  // doesn't get included in the final PUT.
  const canAdvance = step === 1 ? trimmedName.length > 0 : true
  const isLast = step === TOTAL_STEPS

  function handleBack() {
    if (step === 1 || submitting) return
    setError(null)
    setStep((s) => Math.max(1, s - 1) as 1 | 2 | 3 | 4)
  }

  async function handleNext() {
    setError(null)
    if (!canAdvance) return
    if (!isLast) {
      setStep((s) => (s + 1) as 1 | 2 | 3 | 4)
      return
    }
    // Final step — submit everything the user picked in one PUT. The
    // backend treats omitted fields as "leave alone" and bumps status
    // from 'new' to 'enriched' as soon as role or intent leaves 'unknown'.
    setSubmitting(true)
    try {
      const body: {
        name?: string
        role?: LeadRole
        intent?: LeadIntent
        pipeline?: string
      } = { name: trimmedName }
      if (role !== null) body.role = role
      if (intent !== null) body.intent = intent
      if (pipeline !== null) body.pipeline = pipeline
      await updateMyLead(body)
      onComplete()
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Something went wrong. Try again?'
      setError(msg)
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-[80vh] bg-background px-6 py-12 md:py-20">
      <div className="mx-auto max-w-md">
        <div
          className="rounded-xl bg-card p-6 shadow-lg ring-1 ring-border md:p-8"
          style={{ borderTopColor: SCENARIO_PALETTE.blue, borderTopWidth: 4 }}
        >
          {/* Progress strip */}
          <ProgressStrip current={step} total={TOTAL_STEPS} />

          {/* Step content. min-h keeps the card a stable height so it
              doesn't jump around as the user clicks Next on shorter
              steps. */}
          <div className="mt-6 min-h-[320px]">
            {step === 1 && (
              <NameStep
                value={name}
                onChange={setName}
                onEnter={handleNext}
                canAdvance={canAdvance}
              />
            )}
            {step === 2 && <RoleStep value={role} onChange={setRole} />}
            {step === 3 && <IntentStep value={intent} onChange={setIntent} />}
            {step === 4 && (
              <PipelineStep value={pipeline} onChange={setPipeline} />
            )}
          </div>

          {error && (
            <p
              className="mt-4 text-center text-sm"
              style={{ color: '#b85844' }}
            >
              {error}
            </p>
          )}

          {/* Footer — Back left, primary advance right. Back hidden (not
              just disabled) on step 1 so it doesn't compete visually
              with the single Next button. */}
          <div className="mt-6 flex items-center justify-between gap-3">
            {step > 1 ? (
              <Button
                type="button"
                variant="ghost"
                disabled={submitting}
                onClick={handleBack}
              >
                <ArrowLeft className="mr-1 h-4 w-4" /> Back
              </Button>
            ) : (
              <span />
            )}
            <Button
              type="button"
              size="lg"
              onClick={handleNext}
              disabled={!canAdvance || submitting}
              className="text-base shadow-lg transition-shadow hover:shadow-xl"
              style={{ backgroundColor: SCENARIO_PALETTE.blue }}
            >
              {submitting ? (
                <>Saving…</>
              ) : isLast ? (
                <>
                  Finish <Check className="ml-1 h-4 w-4" />
                </>
              ) : (
                <>
                  Next <ArrowRight className="ml-1 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Progress strip — four numbered dots connected by short line segments.
// The current step is filled with the dusty-blue accent; completed steps
// also fill (so the user can read how far they've come at a glance) and
// future steps are outline-only.
// ---------------------------------------------------------------------------

function ProgressStrip({
  current,
  total,
}: {
  current: number
  total: number
}) {
  const dots = Array.from({ length: total }, (_, i) => i + 1)
  return (
    <div
      className="flex items-center gap-2"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current}
      aria-label={`Step ${current} of ${total}`}
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
                isActive || isDone
                  ? { backgroundColor: SCENARIO_PALETTE.blue }
                  : undefined
              }
            >
              {isDone ? <Check className="h-3.5 w-3.5" /> : n}
            </span>
            {i < dots.length - 1 && (
              <span
                aria-hidden="true"
                className="h-px flex-1 transition-colors"
                style={{
                  backgroundColor: isDone
                    ? SCENARIO_PALETTE.blue
                    : 'var(--border, #e7e5e4)',
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
// Step 1 — Name. Single text input. Enter advances (same as clicking Next)
// so a user who's already pre-filled doesn't have to lift their fingers.
// ---------------------------------------------------------------------------

function NameStep({
  value,
  onChange,
  onEnter,
  canAdvance,
}: {
  value: string
  onChange: (v: string) => void
  onEnter: () => void
  canAdvance: boolean
}) {
  return (
    <section>
      <StepHeader
        icon={User}
        title="What should we call you?"
        blurb="We'll use this in the app and when a partner reaches out. You can change it anytime."
      />
      <div className="mt-6">
        <label htmlFor="onboarding-name" className="sr-only">
          Name
        </label>
        <input
          id="onboarding-name"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canAdvance) {
              e.preventDefault()
              onEnter()
            }
          }}
          placeholder="First name or full name"
          autoFocus
          autoComplete="name"
          className="w-full rounded-lg border border-border bg-card px-4 py-3 text-base placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2"
          style={{ boxShadow: 'none' }}
        />
        <p className="mt-2 text-xs text-stone-500">Required.</p>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Step 2 — Role. Two big tile cards. Pre-existing visual language.
// ---------------------------------------------------------------------------

function RoleStep({
  value,
  onChange,
}: {
  value: RoleOption['value'] | null
  onChange: (v: RoleOption['value']) => void
}) {
  return (
    <section>
      <StepHeader
        icon={Briefcase}
        title="I'm a…"
        blurb="So we can tailor what shows up on your dashboard."
      />
      <div className="mt-5 grid grid-cols-2 gap-3">
        {ROLE_OPTIONS.map((opt) => {
          const Icon = opt.icon
          const selected = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              aria-pressed={selected}
              className={cn(
                'flex flex-col items-start gap-2 rounded-lg bg-card p-4 text-left shadow-sm ring-1 transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2',
                selected ? 'ring-2' : 'ring-border',
              )}
              style={
                selected
                  ? {
                      boxShadow: `0 0 0 2px ${SCENARIO_PALETTE.blue}`,
                      backgroundColor: `${SCENARIO_PALETTE.blue}10`,
                    }
                  : undefined
              }
            >
              <div
                className="inline-flex rounded-md p-2"
                style={{ backgroundColor: `${SCENARIO_PALETTE.blue}1a` }}
              >
                <Icon
                  className="h-5 w-5"
                  style={{ color: SCENARIO_PALETTE.blue }}
                />
              </div>
              <div>
                <p className="text-sm font-semibold tracking-tight">
                  {opt.label}
                </p>
                <p className="mt-0.5 text-xs text-stone-600">{opt.blurb}</p>
              </div>
            </button>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-stone-500">Optional — Next to skip.</p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Step 3 — Intent. Vertical stack of four buttons (more space for blurbs).
// ---------------------------------------------------------------------------

function IntentStep({
  value,
  onChange,
}: {
  value: IntentOption['value'] | null
  onChange: (v: IntentOption['value']) => void
}) {
  return (
    <section>
      <StepHeader
        icon={Compass}
        title="What brought you in?"
        blurb="Helps us point you at the right tool first."
      />
      <div className="mt-5 flex flex-col gap-2">
        {INTENT_OPTIONS.map((opt) => {
          const selected = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              aria-pressed={selected}
              className={cn(
                'rounded-lg bg-card px-4 py-3 text-left shadow-sm ring-1 transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2',
                selected ? 'ring-2' : 'ring-border',
              )}
              style={
                selected
                  ? {
                      boxShadow: `0 0 0 2px ${SCENARIO_PALETTE.blue}`,
                      backgroundColor: `${SCENARIO_PALETTE.blue}10`,
                    }
                  : undefined
              }
            >
              <p className="text-sm font-semibold tracking-tight">
                {opt.label}
              </p>
              <p className="mt-0.5 text-xs text-stone-600">{opt.blurb}</p>
            </button>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-stone-500">Optional — Next to skip.</p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Step 4 — Pipeline. The "who do you want to be matched with" choice.
// Slugs match what the admin "Edit details" form writes so the user-side
// wizard and admin-side enrichment land on the same set of values.
// ---------------------------------------------------------------------------

function PipelineStep({
  value,
  onChange,
}: {
  value: PipelineOption['value'] | null
  onChange: (v: PipelineOption['value']) => void
}) {
  return (
    <section>
      <StepHeader
        icon={DollarSign}
        title="Who do you want to work with?"
        blurb="We'll match you with a Saveero-vetted partner when you're ready."
      />
      <div className="mt-5 flex flex-col gap-2">
        {PIPELINE_OPTIONS.map((opt) => {
          const Icon = opt.icon
          const selected = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              aria-pressed={selected}
              className={cn(
                'flex items-start gap-3 rounded-lg bg-card px-4 py-3 text-left shadow-sm ring-1 transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2',
                selected ? 'ring-2' : 'ring-border',
              )}
              style={
                selected
                  ? {
                      boxShadow: `0 0 0 2px ${SCENARIO_PALETTE.blue}`,
                      backgroundColor: `${SCENARIO_PALETTE.blue}10`,
                    }
                  : undefined
              }
            >
              <div
                className="mt-0.5 inline-flex rounded-md p-2"
                style={{ backgroundColor: `${SCENARIO_PALETTE.blue}1a` }}
              >
                <Icon
                  className="h-4 w-4"
                  style={{ color: SCENARIO_PALETTE.blue }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold tracking-tight">
                  {opt.label}
                </p>
                <p className="mt-0.5 text-xs text-stone-600">{opt.blurb}</p>
              </div>
            </button>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-stone-500">
        Optional — Finish to skip. You can pick later from your dashboard.
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Step header — small icon chip + heading + blurb. Shared across all
// four steps so the wizard reads as one consistent flow rather than four
// disjoint forms.
// ---------------------------------------------------------------------------

function StepHeader({
  icon: Icon,
  title,
  blurb,
}: {
  icon: typeof Home
  title: string
  blurb: string
}) {
  return (
    <header>
      <div
        className="inline-flex rounded-md p-2"
        style={{ backgroundColor: `${SCENARIO_PALETTE.blue}1a` }}
      >
        <Icon
          className="h-5 w-5"
          style={{ color: SCENARIO_PALETTE.blue }}
        />
      </div>
      <h1 className="mt-3 text-2xl font-bold tracking-tight md:text-[1.6rem]">
        {title}
      </h1>
      <p className="mt-2 text-sm text-stone-600">{blurb}</p>
    </header>
  )
}
