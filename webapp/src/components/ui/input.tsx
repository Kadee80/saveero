/**
 * Input UI component - Shadcn UI text input field
 *
 * Styled HTML input element with consistent appearance across the app.
 * Supports all standard HTML input types and attributes.
 *
 * Features:
 * - Consistent styling with rounded border and padding
 * - Focus ring for accessibility
 * - Placeholder text support
 * - Disabled state styling
 * - File input styling with custom appearance
 * - Full HTML input type support (text, email, number, password, etc.)
 *
 * @module components/ui/input
 * @example
 * import { Input } from '@/components/ui/input'
 *
 * <Input type="text" placeholder="Enter text..." />
 * <Input type="email" placeholder="Email address" />
 * <Input type="number" placeholder="0" />
 * <Input type="password" placeholder="Password" />
 */
import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Input component props
 * Extends all standard HTML input attributes
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

/**
 * Input component - styled text input field
 *
 * Base input component with Tailwind styling for consistent appearance.
 * Supports all HTML input types and attributes.
 *
 * Features:
 * - Flexible width (w-full)
 * - Rounded corners with border
 * - Padding for comfortable text entry
 * - Focus ring for accessibility
 * - Disabled state visual feedback
 * - File input custom styling
 *
 * @param {InputProps} props - Standard HTML input props
 * @returns {React.ReactElement} Styled input element
 *
 * @example
 * <Input type="text" placeholder="Name" />
 *
 * @example
 * <Input type="number" defaultValue={100} min={0} max={500} />
 *
 * @example
 * <Input
 *   type="email"
 *   placeholder="user@example.com"
 *   required
 * />
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    ref={ref}
    {...props}
  />
))
Input.displayName = 'Input'

export { Input }
