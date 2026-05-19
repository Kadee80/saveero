/**
 * SignupPrompt — inline call-to-action shown to anonymous users at the
 * points where they'd otherwise hit the auth wall.
 *
 * Two flavors:
 *   variant="banner" — wide horizontal card that sits at the end of a
 *                      results page. Lower-pressure; reads as "and one
 *                      more thing." Used at the bottom of DecisionMap /
 *                      FTHB result panes.
 *   variant="action" — compact card that REPLACES an action affordance
 *                      (e.g. swaps out the Save bar). Higher-pressure,
 *                      since the user just tried to do the thing.
 *
 * Both link to /login. The Login page already handles the signup tab.
 * Once the user signs up, App.tsx replays whatever's in the anon stash
 * — so the analysis they just ran shows up pre-saved.
 */
import { Link } from 'react-router-dom'
import { Sparkles, ArrowRight, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SignupPromptProps {
  variant?: 'banner' | 'action'
  /** Headline. Defaults pick sensible copy per variant. */
  title?: string
  /** Body copy. Defaults pick sensible copy per variant. */
  body?: string
  /** Primary-button label. Defaults to "Create free account". */
  primaryLabel?: string
}

export function SignupPrompt({
  variant = 'banner',
  title,
  body,
  primaryLabel = 'Create free account',
}: SignupPromptProps) {
  const headline =
    title ?? (variant === 'action'
      ? 'Save this scenario to your account'
      : 'Want to keep this analysis?')
  const description =
    body ?? (variant === 'action'
      ? "Free account. We'll save what you just ran so it's there next time."
      : 'Create a free account to save scenarios, compare them side-by-side, and connect with a vetted partner when you’re ready to act.')

  const Icon = variant === 'action' ? Save : Sparkles

  return (
    <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50/80 to-stone-50 p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-amber-100 p-2 text-amber-700">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-stone-900">{headline}</h3>
            <p className="mt-0.5 text-sm leading-relaxed text-stone-600">
              {description}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild size="sm" variant="ghost">
            <Link to="/login?mode=signin">Sign in</Link>
          </Button>
          <Button asChild size="sm" className="shadow-sm">
            <Link to="/login?mode=signup">
              {primaryLabel}
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

export default SignupPrompt
