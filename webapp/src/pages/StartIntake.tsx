/**
 * StartIntake — anonymous-friendly wrapper around OnboardingWizard.
 *
 * Mounted at `/start`. This is the screen every Landing-page CTA points
 * to (Hero, Closing, top-nav "Get started"). It walks the visitor
 * through the same intake questions the post-signup wizard asks, then
 * routes them into the right calculator for their persona — instead of
 * dropping them cold on the homeowner Decision Map, which is the
 * busiest of the engines and confusing without context.
 *
 * Why a separate wrapper instead of just reusing OnboardingWizard
 * directly: the post-signup mount writes to the lead row via
 * `updateMyLead`. Here there is no lead row yet, so we stash the
 * assembled body in localStorage and rely on the App.tsx
 * session-mount effect to replay it once the user signs up.
 *
 * Routing fork on completion:
 *   role === 'first_time_buyer'  → /fthb-decision-map
 *   role === 'pro'               → /decision-map (pros explore the
 *                                  homeowner engine; pro surfaces are
 *                                  Phase E)
 *   role === 'homeowner' / null  → /decision-map (the original default)
 *
 * Signed-in users hitting /start are redirected to the dashboard —
 * the authed intake lives there (Dashboard mounts OnboardingWizard
 * inline when the lead is incomplete) so we keep one path per session
 * state instead of two slightly different ones.
 *
 * @module pages/StartIntake
 */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import OnboardingWizard, {
  type OnboardingBody,
} from '@/pages/OnboardingWizard'
import { stashAnonOnboarding } from '@/api/anonStash'
import { useSession } from '@/api/auth'

/**
 * Maps the wizard's derived role onto the destination URL. Centralised
 * so the redirect logic and the replay-on-signup logic (in App.tsx) can
 * use the exact same fork.
 */
export function destinationForRole(
  role: OnboardingBody['role'] | undefined,
): string {
  if (role === 'first_time_buyer') return '/fthb-decision-map'
  // Pros + current homeowners + unknown all land on the homeowner
  // Decision Map. Pros don't have a dedicated surface yet (Phase E)
  // and the homeowner engine is the most general — safer default than
  // sending them at an FTHB calculator they didn't ask for.
  return '/decision-map'
}

export default function StartIntake() {
  const session = useSession()
  const navigate = useNavigate()

  // Signed-in users don't belong here. The post-signup wizard already
  // runs inline on the Dashboard for users whose lead is still
  // incomplete. Avoid two parallel intake paths by punting them home.
  useEffect(() => {
    if (session) navigate('/', { replace: true })
  }, [session, navigate])

  // Avoid a frame of the wizard rendering before the redirect fires.
  if (session) return null

  return (
    <OnboardingWizard
      // No lead row yet — the wizard handles `null` gracefully (it just
      // shows empty inputs).
      lead={null}
      onSubmit={async (body) => {
        // Anonymous submit = stash + return. The session-mount effect
        // in App.tsx replays the stash via updateMyLead once the user
        // signs up. Never throws — localStorage failures are silently
        // absorbed, the user still advances to the calculator.
        stashAnonOnboarding(body)
      }}
      onComplete={(body) => {
        // Route based on what they picked. The wizard already fired
        // 'Onboarding Completed' to Mixpanel before calling us.
        navigate(destinationForRole(body.role), { replace: true })
      }}
    />
  )
}
