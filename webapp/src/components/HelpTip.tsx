/**
 * HelpTip — small "?" affordance next to a label that surfaces plain-English
 * help on hover, focus, or tap.
 *
 * Pass either:
 *   - a tooltip slug (looked up in @/copy/tooltips), OR
 *   - inline text via `text`
 *
 * Slug is preferred — keeps all copy in one editable file. `text` is the
 * escape hatch for one-off labels that don't deserve a slug.
 *
 * Renders nothing if the resolved copy is empty. That means a label can
 * unconditionally pass a slug (`<HelpTip slug={...} />`) and the "?" only
 * appears once copy actually exists — no half-finished state where users
 * see a question mark that doesn't do anything.
 *
 * Accessibility:
 *   - The trigger is a real <button> with `type="button"` so it doesn't
 *     accidentally submit enclosing forms.
 *   - aria-label is set to "More info" so screen readers describe it.
 *   - Radix's TooltipContent auto-wires aria-describedby.
 *   - Focusable via Tab; tooltip opens on focus too.
 */
import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { tooltipFor } from '@/copy/tooltips'

interface HelpTipProps {
  /** Slug into @/copy/tooltips. Preferred over `text`. */
  slug?: string
  /** Inline copy. Used when slug isn't set or doesn't resolve. */
  text?: string
  /** Optional Tailwind classes for the trigger button (sizing/spacing). */
  className?: string
  /** Optional aria-label override (default "More info"). */
  label?: string
}

export function HelpTip({ slug, text, className, label = 'More info' }: HelpTipProps) {
  const copy = text ?? tooltipFor(slug)
  if (!copy) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            // Reset default button chrome and tuck close to the label
            'inline-flex h-4 w-4 items-center justify-center rounded-full',
            'text-stone-400 hover:text-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400',
            'cursor-help align-middle',
            className,
          )}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" align="start">
        {copy}
      </TooltipContent>
    </Tooltip>
  )
}

export default HelpTip
