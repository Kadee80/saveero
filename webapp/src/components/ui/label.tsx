/**
 * Label UI component - Shadcn UI form label
 *
 * Semantic HTML label element with consistent styling.
 * Built on Radix UI's Label primitive with accessibility features.
 *
 * Features:
 * - Semantic HTML <label> with proper htmlFor binding
 * - Consistent text styling
 * - Disabled state support
 * - Accessibility: proper focus and cursor behavior
 * - Peer-dependent styling for form field relationships
 *
 * @module components/ui/label
 * @example
 * import { Label } from '@/components/ui/label'
 * import { Input } from '@/components/ui/input'
 *
 * <div>
 *   <Label htmlFor="name">Full Name</Label>
 *   <Input id="name" />
 * </div>
 */
import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * CVA definition for label variants
 */
const labelVariants = cva(
  'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
)

/**
 * Label component - semantic form label
 *
 * Built on Radix UI's Label primitive with consistent Tailwind styling.
 * Use with htmlFor prop to connect to form inputs.
 *
 * Features:
 * - Semantic HTML <label> element
 * - Proper focus management
 * - Cursor and disabled state styling
 * - Accessible via htmlFor / id binding
 * - Peer-based styling for dependent form fields
 *
 * @param {React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>} props - Label props
 * @returns {React.ReactElement} Label element
 *
 * @example
 * <Label htmlFor="email">Email Address</Label>
 * <Input id="email" type="email" />
 *
 * @example
 * <Label>
 *   <input type="checkbox" /> Accept terms
 * </Label>
 */
const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn(labelVariants(), className)} {...props} />
))
Label.displayName = LabelPrimitive.Root.displayName

export { Label }
