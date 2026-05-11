/**
 * OnboardingWizard — one-screen post-signup capture for role + intent.
 *
 * Phase B of the CRM build. Renders inline on the Dashboard the first
 * time a freshly-signed-up user lands there: their `leads` row was
 * seeded at signup with role='unknown' / intent='unknown', and this
 * wizard exists to turn those into real values so the downstream CRM
 * (pipeline routing, partner matching, etc.) has something to work
 * with.
 *
 * Design intent:
 *   - One screen, no multi-step flow. Two questions, one Continue
 *     button. Sub-30-second commitment, framed as "helps us tailor
 *     what you see" rather than "fill out our CRM."
 *   - Visual language matches Landing / Dashboard — warm cream
 *     background, dusty-blue primary, rounded-xl shadowed card.
 *   - Once submitted, the Dashboard refetches the lead and the
 *     hub layout replaces this wizard. The wizard never shows again
 *     because role/intent are no longer 'unknown'.
 *
 * @component
 * @param {Object} props
 * @param {() => void} props.onComplete - Called after a successful PUT.
 *   Parent should refetch the lead so the hub renders next.
 * @returns {JSX.Element}
 */
import { useState } from 'react'
import { Briefcase, Home, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SCENARIO_PALETTE } from '@/lib/chartPalette'
import {
  updateMyLead,
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
    blurb: "Thinking about selling and buying somewhere new.",
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OnboardingWizard({
  onComplete,
}: {
  onComplete: () => void
}) {
  const [role, setRole] = useState<RoleOption['value'] | null>(null)
  const [intent, setIntent] = useState<IntentOption['value'] | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = role !== null && intent !== null && !submitting

  async function handleSubmit() {
    if (role === null || intent === null) return
    setSubmitting(true)
    setError(null)
    try {
      await updateMyLead({ role, intent })
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
          {/* Header */}
          <header>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              Tell us about your situation
            </h1>
            <p className="mt-2 text-sm text-stone-600">
              30 seconds — helps us tailor what you see.
            </p>
          </header>

          {/* Role question */}
          <section className="mt-7">
            <p className="text-sm font-semibold tracking-tight">I'm a…</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {ROLE_OPTIONS.map((opt) => {
                const Icon = opt.icon
                const selected = role === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRole(opt.value)}
                    aria-pressed={selected}
                    className={cn(
                      'flex flex-col items-start gap-2 rounded-lg bg-card p-4 text-left shadow-sm ring-1 transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2',
                      selected ? 'ring-2' : 'ring-border',
                    )}
                    style={
                      selected
                        ? {
                            // Selected ring uses the dusty-blue accent so the
                            // pick reads at-a-glance against the cream card.
                            // Inline so we can reuse SCENARIO_PALETTE without
                            // adding a Tailwind safelist entry.
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
                      <p className="mt-0.5 text-xs text-stone-600">
                        {opt.blurb}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Intent question */}
          <section className="mt-7">
            <p className="text-sm font-semibold tracking-tight">
              What brought you in?
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {INTENT_OPTIONS.map((opt) => {
                const selected = intent === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setIntent(opt.value)}
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
          </section>

          {/* Submit */}
          <div className="mt-8">
            <Button
              type="button"
              size="lg"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full text-base shadow-lg transition-shadow hover:shadow-xl"
              style={{ backgroundColor: SCENARIO_PALETTE.blue }}
            >
              {submitting ? (
                <>Saving…</>
              ) : (
                <>
                  Continue <ArrowRight className="ml-1 h-4 w-4" />
                </>
              )}
            </Button>
            {error && (
              <p
                className="mt-3 text-center text-sm"
                style={{ color: '#b85844' }}
              >
                {error}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
