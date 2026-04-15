/**
 * Button UI component - Shadcn UI button with variants
 *
 * Flexible button component with multiple style variants and sizes.
 * Based on Shadcn UI button with CVA (Class Variance Authority) for variant management.
 *
 * Variants:
 * - default: Primary button (blue background)
 * - destructive: Danger button (red background)
 * - outline: Bordered button
 * - secondary: Secondary button (gray background)
 * - ghost: No background, hover only
 * - link: Text link style
 *
 * Sizes:
 * - default: Standard size (h-10)
 * - sm: Small button (h-9)
 * - lg: Large button (h-11)
 * - icon: Square icon button (h-10 w-10)
 *
 * Features:
 * - Accessibility: Focus ring, disabled state handling
 * - Composition: asChild prop for polymorphic rendering
 * - Customizable: className prop for additional styling
 *
 * @module components/ui/button
 * @example
 * import { Button } from '@/components/ui/button'
 *
 * <Button>Click me</Button>
 * <Button variant="destructive">Delete</Button>
 * <Button size="sm">Small button</Button>
 * <Button asChild><Link to="/page">Link Button</Link></Button>
 */
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * CVA definition for button variants
 * Defines base styles and all style combinations
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:     'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:     'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary:   'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost:       'hover:bg-accent hover:text-accent-foreground',
        link:        'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm:      'h-9 rounded-md px-3',
        lg:      'h-11 rounded-md px-8',
        icon:    'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

/**
 * Button component props
 *
 * Extends HTML button attributes with variant and size options.
 * The asChild prop allows using the button styles on other elements (links, etc.)
 */
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** If true, render as child element (for polymorphic buttons like links) */
  asChild?: boolean
}

/**
 * Button component - styled interactive button
 *
 * Flexible button with multiple visual variants and sizes.
 * Supports polymorphic rendering via asChild prop.
 *
 * Features:
 * - Multiple style variants (default, destructive, outline, secondary, ghost, link)
 * - Multiple sizes (default, sm, lg, icon)
 * - Full accessibility support (focus ring, disabled states)
 * - asChild prop for rendering as different elements (links, custom components)
 * - Custom className support with CVA variant merging
 *
 * @param {ButtonProps} props - Button props including variant and size
 * @returns {React.ReactElement} Button element
 *
 * @example
 * <Button>Default button</Button>
 *
 * @example
 * <Button variant="destructive">Delete</Button>
 *
 * @example
 * <Button size="sm" variant="outline">Small outline</Button>
 *
 * @example
 * <Button asChild>
 *   <Link to="/page">Link as button</Link>
 * </Button>
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
