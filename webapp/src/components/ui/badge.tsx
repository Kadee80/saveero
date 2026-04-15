/**
 * Badge UI component - Shadcn UI status badge
 *
 * Compact visual indicator for status, labels, or categories.
 * Multiple style variants for different semantic meanings.
 *
 * Variants:
 * - default: Primary badge (blue background)
 * - secondary: Secondary badge (gray background)
 * - destructive: Danger/error badge (red background)
 * - outline: Outlined badge (border only)
 *
 * Features:
 * - Rounded pill shape
 * - Semantic color coding
 * - Flexible content (text, icons, etc.)
 * - Focus state for accessibility
 * - Inline display (inline-flex)
 *
 * @module components/ui/badge
 * @example
 * import { Badge } from '@/components/ui/badge'
 *
 * <Badge>Active</Badge>
 * <Badge variant="secondary">Draft</Badge>
 * <Badge variant="destructive">Error</Badge>
 * <Badge variant="outline">Info</Badge>
 */
import * as React from 'react'
import {cva, type VariantProps} from 'class-variance-authority'
import {cn} from '@/lib/utils'

/**
 * CVA definition for badge variants
 */
const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground',
        outline: 'text-foreground',
      },
    },
    defaultVariants: {variant: 'default'},
  }
)

/**
 * Badge component props
 *
 * Extends HTML div attributes with badge variant option
 */
export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

/**
 * Badge component - status/label badge
 *
 * Compact visual indicator for status, labels, or categories.
 * Supports multiple style variants for semantic meaning.
 *
 * Features:
 * - Rounded pill shape (inline-flex)
 * - Multiple color variants (default, secondary, destructive, outline)
 * - Flexible content (text, icons, numbers)
 * - Focus state for accessibility
 * - Custom className support
 *
 * @param {BadgeProps} props - Badge props including variant
 * @returns {React.ReactElement} Badge element
 *
 * @example
 * <Badge>Active</Badge>
 *
 * @example
 * <Badge variant="secondary">Draft</Badge>
 *
 * @example
 * <Badge variant="destructive">Error</Badge>
 *
 * @example
 * <Badge variant="outline">Info Badge</Badge>
 */
function Badge({className, variant, ...props}: BadgeProps) {
  return <div className={cn(badgeVariants({variant}), className)} {...props} />
}

export {Badge, badgeVariants}
