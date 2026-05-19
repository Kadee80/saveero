/**
 * Tooltip primitive — thin shadcn-style wrapper over @radix-ui/react-tooltip.
 *
 * Why Radix and not a hand-rolled CSS tooltip:
 *   - Keyboard accessible by default (focus shows the tip)
 *   - Touch behavior: tap-and-hold or tap-once shows on mobile
 *   - aria-describedby wiring is automatic
 *   - Portal-based so the tip can escape overflow-hidden parents
 *
 * Saveero is consumer-facing with a lot of dense financial vocabulary; this
 * is the right place to spend the ~10kb.
 *
 * Usage — always under a TooltipProvider (App.tsx mounts one at the root):
 *
 *   <Tooltip>
 *     <TooltipTrigger asChild>
 *       <button aria-label="What is this?"><HelpCircle /></button>
 *     </TooltipTrigger>
 *     <TooltipContent>Plain-English explanation here.</TooltipContent>
 *   </Tooltip>
 *
 * For the common case (a "?" icon next to a label), use the higher-level
 * <HelpTip text="..."/> component in @/components/HelpTip — it bundles the
 * trigger + icon + content into one prop.
 */
import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'

const TooltipProvider = TooltipPrimitive.Provider
const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        // Layout — narrow enough to be readable, wide enough to fit a
        // sentence-and-a-half without wrapping to four lines.
        'z-50 max-w-xs rounded-md border border-stone-200 bg-white px-3 py-2',
        // Type
        'text-xs leading-relaxed text-stone-700 shadow-md',
        // Tail animations from shadcn defaults — gentle fade/scale
        'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
        'data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
