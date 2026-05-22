/**
 * ContactPipelineButton - lead-gen CTA button for partner pipelines
 *
 * Renders a small outline-style button labeled "Contact a {pipeline}" with a
 * pipeline-specific icon. Currently a no-op placeholder — wired up later when
 * the lead-capture flow exists.
 *
 * Used across DecisionMap (per scenario card + recommendation) and
 * ScenarioComparison (per scenario tile) to surface the right professional at
 * the moment a user is staring at the relevant decision.
 *
 * @module components/ContactPipelineButton
 */
import { Briefcase, Landmark, MapPin, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { trackActivity, updateMyLead } from '@/api/leadsApi'
import { analytics } from '@/analytics/mixpanel'

export type Pipeline = 'financial-planner' | 'real-estate-agent' | 'mortgage-broker'

interface PipelineConfig {
  label: string
  icon: LucideIcon
  /** Hover tint — kept light-touch, distinct per pipeline */
  hoverClass: string
}

const PIPELINE_CONFIG: Record<Pipeline, PipelineConfig> = {
  'financial-planner': {
    label: 'Contact a Financial Planner',
    icon: Briefcase,
    hoverClass: 'hover:border-blue-400 hover:text-blue-700',
  },
  'real-estate-agent': {
    label: 'Contact a Real Estate Agent',
    icon: MapPin,
    hoverClass: 'hover:border-emerald-400 hover:text-emerald-700',
  },
  'mortgage-broker': {
    label: 'Contact a Mortgage Broker',
    icon: Landmark,
    hoverClass: 'hover:border-violet-400 hover:text-violet-700',
  },
}

interface ContactPipelineButtonProps {
  pipeline: Pipeline
  /** Optional override label (e.g. shorter text in tight spaces) */
  label?: string
  className?: string
  /** Defaults to sm; pass 'default' for higher-prominence placements */
  size?: 'sm' | 'default'
}

export function ContactPipelineButton({
  pipeline,
  label,
  className,
  size = 'sm',
}: ContactPipelineButtonProps) {
  const config = PIPELINE_CONFIG[pipeline]
  const Icon = config.icon
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      className={cn('transition-colors', config.hoverClass, className)}
      onClick={() => {
        // Two-fold CRM update, both fire-and-forget so the click feels
        // instant:
        //   1) Append a 'clicked_contact_<pipeline>' activity entry. The
        //      backend's status ladder bumps the lead to 'engaged' on any
        //      kind starting with 'clicked_contact_'.
        //   2) Patch the lead's `pipeline` field so the CRM Kanban can
        //      show which partner specialty the user is interested in.
        //      Hyphenated form preserved as the stored value; the
        //      activity kind uses underscores to match our event-naming
        //      convention.
        const kind = `clicked_contact_${pipeline.replace(/-/g, '_')}`
        trackActivity(kind, { pipeline })
        // Product analytics — the engaged-lead conversion moment.
        analytics.track(analytics.EVENTS.PARTNER_CONTACTED, { pipeline })
        updateMyLead({ pipeline }).catch((err) => {
          console.warn('[lead] pipeline update failed:', err)
        })
      }}
    >
      <Icon className="h-4 w-4" />
      {label ?? config.label}
    </Button>
  )
}
