/**
 * Card UI components - Shadcn UI card primitives
 *
 * Provides a set of composable card components for creating structured content containers.
 * Based on Shadcn UI card implementation with Tailwind styling.
 *
 * Components:
 * - Card: Container with border, background, shadow
 * - CardHeader: Top section with padding
 * - CardTitle: Card heading
 * - CardDescription: Subtitle or description text
 * - CardContent: Main content area
 * - CardFooter: Bottom section with flex layout
 *
 * All components are forwardRef enabled for advanced use cases.
 *
 * @module components/ui/card
 * @example
 * import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
 *
 * <Card>
 *   <CardHeader>
 *     <CardTitle>Title</CardTitle>
 *   </CardHeader>
 *   <CardContent>Content here</CardContent>
 * </Card>
 */
import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Card component - root container for card content
 *
 * Base card wrapper with rounded border, background color, and shadow.
 * Accepts any HTML div attributes for additional customization.
 *
 * @param {React.HTMLAttributes<HTMLDivElement>} props - Standard HTML div props
 * @returns {React.ReactElement} Card container element
 *
 * @example
 * <Card className="w-96">
 *   <CardContent>Card content</CardContent>
 * </Card>
 */
const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)} {...props} />
  )
)
Card.displayName = 'Card'

/**
 * CardHeader component - top section of a card
 *
 * Container for the card's header content with flexbox column layout
 * and spacing between child elements. Typically contains CardTitle and CardDescription.
 *
 * @param {React.HTMLAttributes<HTMLDivElement>} props - Standard HTML div props
 * @returns {React.ReactElement} Card header element
 *
 * @example
 * <CardHeader>
 *   <CardTitle>Card Title</CardTitle>
 *   <CardDescription>Subtitle</CardDescription>
 * </CardHeader>
 */
const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  )
)
CardHeader.displayName = 'CardHeader'

/**
 * CardTitle component - heading within card header
 *
 * Semantic H3 heading with large, bold, tracked text styling.
 * Provides visual hierarchy for card titles.
 *
 * @param {React.HTMLAttributes<HTMLHeadingElement>} props - Standard HTML heading props
 * @returns {React.ReactElement} H3 heading element
 *
 * @example
 * <CardTitle>My Card Title</CardTitle>
 */
const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />
  )
)
CardTitle.displayName = 'CardTitle'

/**
 * CardDescription component - subtitle or secondary text in card header
 *
 * Smaller, muted text for supplementary information.
 * Use below CardTitle for descriptions or additional context.
 *
 * @param {React.HTMLAttributes<HTMLParagraphElement>} props - Standard HTML paragraph props
 * @returns {React.ReactElement} Paragraph element
 *
 * @example
 * <CardDescription>This is a description of the card</CardDescription>
 */
const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  )
)
CardDescription.displayName = 'CardDescription'

/**
 * CardContent component - main content section of a card
 *
 * Wrapper for the card's primary content with padding.
 * No padding on top (pt-0) to provide visual spacing between header and content.
 *
 * @param {React.HTMLAttributes<HTMLDivElement>} props - Standard HTML div props
 * @returns {React.ReactElement} Content container element
 *
 * @example
 * <CardContent>
 *   <p>Main card content goes here</p>
 * </CardContent>
 */
const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  )
)
CardContent.displayName = 'CardContent'

/**
 * CardFooter component - bottom section of a card
 *
 * Flexbox container for footer content with centered items.
 * Useful for action buttons or secondary information at card bottom.
 * No padding on top (pt-0) for visual flow.
 *
 * @param {React.HTMLAttributes<HTMLDivElement>} props - Standard HTML div props
 * @returns {React.ReactElement} Footer container element
 *
 * @example
 * <CardFooter>
 *   <Button>Save</Button>
 *   <Button variant="outline">Cancel</Button>
 * </CardFooter>
 */
const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  )
)
CardFooter.displayName = 'CardFooter'

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter }
