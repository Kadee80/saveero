/**
 * Textarea UI component - Shadcn UI multi-line text input
 *
 * Styled HTML textarea element for multi-line text entry.
 * Consistent appearance with Input component.
 *
 * Features:
 * - Multi-line text entry
 * - Resizable (browser default)
 * - Consistent styling with Input component
 * - Focus ring for accessibility
 * - Disabled state styling
 * - Configurable row height
 *
 * @module components/ui/textarea
 * @example
 * import { Textarea } from '@/components/ui/textarea'
 *
 * <Textarea placeholder="Enter your message..." rows={5} />
 * <Textarea defaultValue="Pre-filled content" />
 */
import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Textarea component props
 * Extends all standard HTML textarea attributes
 */
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

/**
 * Textarea component - styled multi-line text input
 *
 * Base textarea component with Tailwind styling for consistent appearance.
 * Supports all HTML textarea attributes.
 *
 * Features:
 * - Multi-line text input
 * - Resizable (standard browser behavior)
 * - Rounded corners with border
 * - Padding for comfortable text entry
 * - Focus ring for accessibility
 * - Minimum height (80px)
 * - Disabled state visual feedback
 * - Placeholder text support
 *
 * @param {TextareaProps} props - Standard HTML textarea props
 * @returns {React.ReactElement} Styled textarea element
 *
 * @example
 * <Textarea placeholder="Enter notes..." rows={4} />
 *
 * @example
 * <Textarea
 *   defaultValue="Some pre-filled content"
 *   disabled
 * />
 *
 * @example
 * <Textarea
 *   value={text}
 *   onChange={(e) => setText(e.target.value)}
 *   rows={8}
 *   maxLength={500}
 * />
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    ref={ref}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

export { Textarea }
