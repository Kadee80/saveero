/**
 * AdminCRM — internal admin Kanban-style CRM dashboard.
 *
 * Phase C of the CRM build (Phase A shipped lead capture; Phase B is the
 * user-facing wizard, in flight in parallel). This page is the surface
 * Katie shows Van and the early influencer for testing — so the
 * priorities are: visualize the funnel at a glance, keep it on-brand
 * (warm cream/sage palette, same card chrome as Dashboard/Landing), and
 * make a single lead's full state readable in one click.
 *
 * Access control is server-side via RLS on GET /api/leads (admins only).
 * Non-admins who somehow load this route just see the 403 empty state.
 *
 * Kanban columns are limited to the four "live" statuses for now:
 *   new → enriched → active → engaged
 * 'converted' and 'lost' are intentionally omitted until Phase D wires up
 * the actions that drive those transitions — showing empty terminal
 * columns would only add noise to the influencer demo.
 *
 * @component
 * @returns {JSX.Element} The admin CRM dashboard
 */
import { useEffect, useState } from 'react'
import { UserPlus, X } from 'lucide-react'
import {
  listAllLeads,
  type ActivityLogEntry,
  type Lead,
  type LeadIntent,
  type LeadRole,
  type LeadStatus,
} from '@/api/leadsApi'
import { SCENARIO_PALETTE } from '@/lib/chartPalette'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Display helpers — humanize the enum values so the kanban reads like
// natural language instead of database internals.
// ---------------------------------------------------------------------------

const STATUS_COLUMNS: ReadonlyArray<{
  status: LeadStatus
  label: string
  color: string
}> = [
  { status: 'new',      label: 'New',      color: SCENARIO_PALETTE.blue    },
  { status: 'enriched', label: 'Enriched', color: SCENARIO_PALETTE.violet  },
  { status: 'active',   label: 'Active',   color: SCENARIO_PALETTE.emerald },
  { status: 'engaged',  label: 'Engaged',  color: SCENARIO_PALETTE.rose    },
]

const ROLE_LABEL: Record<LeadRole, string> = {
  homeowner: 'Homeowner',
  pro:       'Pro',
  unknown:   'Unknown role',
}

const INTENT_LABEL: Record<LeadIntent, string> = {
  considering_move: 'Considering a move',
  refinance:        'Refinance',
  rental_explore:   'Exploring renting',
  curious:          'Curious',
  unknown:          'Unknown intent',
}

const PIPELINE_COLOR: Record<string, string> = {
  planner: SCENARIO_PALETTE.blue,
  agent:   SCENARIO_PALETTE.emerald,
  broker:  SCENARIO_PALETTE.amber,
}

/** snake_case → Title case for activity event slugs. */
function humanizeKind(kind: string): string {
  if (!kind) return 'Event'
  const spaced = kind.replace(/_/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** "today" / "yesterday" / "Nd ago" / fallback date — mirrors Dashboard. */
function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - +new Date(iso)) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminCRM() {
  const [leads, setLeads] = useState<Lead[] | null>(null)
  const [error, setError] = useState<'forbidden' | 'other' | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [selected, setSelected] = useState<Lead | null>(null)

  useEffect(() => {
    let cancelled = false
    listAllLeads()
      .then((rows) => {
        if (cancelled) return
        setLeads(rows)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : String(err)
        // Backend wraps errors as "list leads failed (403)" etc. — sniff
        // for the status code rather than relying on response objects.
        if (msg.includes('403')) {
          setError('forbidden')
        } else {
          setError('other')
          setErrorMsg(msg)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Close drawer with Escape.
  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  // ---- Error states ----
  if (error === 'forbidden') {
    return (
      <CenteredCard>
        <p className="text-base font-semibold">Admin access required</p>
        <p className="mt-2 text-sm text-stone-600">
          Ask Katie to set <code className="rounded bg-stone-100 px-1 py-0.5 text-xs">role='admin'</code>{' '}
          on your users row.
        </p>
      </CenteredCard>
    )
  }
  if (error === 'other') {
    return (
      <CenteredCard>
        <p className="text-base font-semibold" style={{ color: '#b85844' }}>
          Could not load leads
        </p>
        {errorMsg && (
          <p className="mt-2 text-sm text-stone-600">{errorMsg}</p>
        )}
      </CenteredCard>
    )
  }

  // ---- Loading ----
  if (leads === null) {
    return (
      <div className="mx-auto max-w-7xl space-y-10 p-6 md:py-10">
        <header>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Leads</h1>
          <p className="mt-2 text-sm text-stone-500">Loading leads…</p>
        </header>
      </div>
    )
  }

  // ---- Empty ----
  if (leads.length === 0) {
    return (
      <div className="mx-auto max-w-7xl space-y-10 p-6 md:py-10">
        <header>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Leads</h1>
          <p className="mt-2 text-sm text-stone-600">
            Internal CRM — Saveero signups land here.
          </p>
        </header>
        <CenteredCard>
          <UserPlus className="mx-auto h-8 w-8 text-stone-400" />
          <p className="mt-3 text-base font-semibold">No leads yet</p>
          <p className="mt-1 text-sm text-stone-600">
            New signups will appear here as soon as someone creates an account.
          </p>
        </CenteredCard>
      </div>
    )
  }

  // ---- Populated ----
  const counts: Record<LeadStatus, number> = {
    new: 0, enriched: 0, active: 0, engaged: 0, converted: 0, lost: 0,
  }
  for (const lead of leads) counts[lead.status]++

  const subtitleParts = [
    `${leads.length} total`,
    `${counts.new} new`,
    `${counts.enriched} enriched`,
    `${counts.active} active`,
    `${counts.engaged} engaged`,
  ]

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-8 p-6 md:py-10">
        <header>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Leads</h1>
          <p className="mt-2 text-sm text-stone-600">
            {subtitleParts.join(' · ')}
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {STATUS_COLUMNS.map(({ status, label, color }) => {
            const columnLeads = leads.filter((l) => l.status === status)
            return (
              <KanbanColumn
                key={status}
                label={label}
                color={color}
                leads={columnLeads}
                onSelect={setSelected}
              />
            )
          })}
        </div>
      </div>

      {selected && (
        <LeadDrawer lead={selected} onClose={() => setSelected(null)} />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Centered card — shared empty / error state wrapper.
// ---------------------------------------------------------------------------

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl p-6 md:py-10">
      <div className="mx-auto max-w-md rounded-xl bg-card p-8 text-center shadow-md ring-1 ring-border">
        {children}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Kanban column — labelled vertical stack of cards. Header carries the
// status accent (left border) and a small count badge.
// ---------------------------------------------------------------------------

interface KanbanColumnProps {
  label: string
  color: string
  leads: Lead[]
  onSelect: (lead: Lead) => void
}

function KanbanColumn({ label, color, leads, onSelect }: KanbanColumnProps) {
  return (
    <section className="flex flex-col gap-3">
      <header
        className="flex items-center justify-between rounded-lg bg-card px-3 py-2 shadow-sm ring-1 ring-border"
        style={{ borderLeftColor: color, borderLeftWidth: 4 }}
      >
        <h2 className="text-sm font-semibold tracking-tight">{label}</h2>
        <span
          className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold"
          style={{ backgroundColor: `${color}1a`, color }}
        >
          {leads.length}
        </span>
      </header>

      <div className="flex flex-col gap-3">
        {leads.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-card/40 px-3 py-6 text-center text-xs text-stone-500">
            Nothing here yet
          </p>
        ) : (
          leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              color={color}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Lead card — compact summary. Mirrors the saved-analysis card chrome
// used on the Dashboard so the CRM feels cohesive with the rest of the
// authed app.
// ---------------------------------------------------------------------------

interface LeadCardProps {
  lead: Lead
  color: string
  onSelect: (lead: Lead) => void
}

function LeadCard({ lead, color, onSelect }: LeadCardProps) {
  const lastEntry =
    lead.activity_log.length > 0
      ? lead.activity_log[lead.activity_log.length - 1]
      : null

  return (
    <button
      type="button"
      onClick={() => onSelect(lead)}
      className="block w-full rounded-xl bg-card p-4 text-left shadow-md ring-1 ring-border transition-shadow hover:shadow-lg"
    >
      <p className={cn(
        'text-sm font-semibold tracking-tight',
        !lead.name && 'text-stone-400'
      )}>
        {lead.name || '(no name yet)'}
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Chip>{ROLE_LABEL[lead.role]}</Chip>
        <Chip>{INTENT_LABEL[lead.intent]}</Chip>
      </div>

      {lead.pipeline && (
        <div className="mt-2">
          <PipelineChip pipeline={lead.pipeline} />
        </div>
      )}

      <p className="mt-3 text-xs text-stone-600">
        <span className="font-medium" style={{ color }}>Last:</span>{' '}
        {lastEntry ? humanizeKind(lastEntry.kind) : 'No activity yet'}
      </p>
      <p className="mt-1 text-xs text-stone-500">
        Created {timeAgo(lead.created_at)}
      </p>
    </button>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-700">
      {children}
    </span>
  )
}

function PipelineChip({ pipeline }: { pipeline: string }) {
  const dotColor = PIPELINE_COLOR[pipeline] ?? SCENARIO_PALETTE.violet
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-700">
      <span
        aria-hidden="true"
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: dotColor }}
      />
      {pipeline.charAt(0).toUpperCase() + pipeline.slice(1)}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Lead detail drawer — slides in from the right with a dimmed backdrop.
// Shows every field on the lead plus the activity_log as a vertical
// timeline so an admin can audit the journey end-to-end.
// ---------------------------------------------------------------------------

interface LeadDrawerProps {
  lead: Lead
  onClose: () => void
}

function LeadDrawer({ lead, onClose }: LeadDrawerProps) {
  const accentColor =
    STATUS_COLUMNS.find((c) => c.status === lead.status)?.color ??
    SCENARIO_PALETTE.violet

  // Newest entry first reads more naturally for an audit timeline.
  const entries = [...lead.activity_log].reverse()

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close detail"
        onClick={onClose}
        className="absolute inset-0 bg-stone-900/40"
      />
      <aside
        role="dialog"
        aria-label={`Lead detail for ${lead.name ?? 'unnamed lead'}`}
        className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-card shadow-2xl ring-1 ring-border"
      >
        {/* Header */}
        <div
          className="flex items-start justify-between px-6 py-5"
          style={{ borderTopColor: accentColor, borderTopWidth: 4 }}
        >
          <div className="min-w-0 flex-1">
            <p
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: accentColor }}
            >
              {STATUS_COLUMNS.find((c) => c.status === lead.status)?.label ?? lead.status}
            </p>
            <h2 className={cn(
              'mt-1 truncate text-xl font-bold tracking-tight',
              !lead.name && 'text-stone-400 font-medium'
            )}>
              {lead.name || '(no name yet)'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 pb-8">
          {/* Identity / metadata */}
          <dl className="grid grid-cols-3 gap-y-3 text-sm">
            <DetailRow term="User"     value={<code className="text-xs">{lead.user_id.slice(0, 8)}</code>} />
            <DetailRow term="Role"     value={ROLE_LABEL[lead.role]} />
            <DetailRow term="Intent"   value={INTENT_LABEL[lead.intent]} />
            <DetailRow
              term="Pipeline"
              value={
                lead.pipeline
                  ? <PipelineChip pipeline={lead.pipeline} />
                  : <span className="text-stone-400">—</span>
              }
            />
            <DetailRow term="Created"  value={new Date(lead.created_at).toLocaleString()} />
            <DetailRow term="Updated"  value={new Date(lead.updated_at).toLocaleString()} />
          </dl>

          {/* Activity timeline */}
          <div className="mt-8">
            <h3 className="text-sm font-semibold tracking-tight">Activity</h3>
            {entries.length === 0 ? (
              <p className="mt-3 rounded-lg border border-dashed border-border bg-card/40 px-3 py-6 text-center text-xs text-stone-500">
                No activity yet
              </p>
            ) : (
              <ol className="mt-4 space-y-4">
                {entries.map((entry, idx) => (
                  <TimelineEntry key={idx} entry={entry} accentColor={accentColor} />
                ))}
              </ol>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}

function DetailRow({ term, value }: { term: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="col-span-1 text-xs font-medium uppercase tracking-wide text-stone-500">
        {term}
      </dt>
      <dd className="col-span-2 text-sm text-stone-800">{value}</dd>
    </>
  )
}

function TimelineEntry({
  entry,
  accentColor,
}: {
  entry: ActivityLogEntry
  accentColor: string
}) {
  const hasData = entry.data && Object.keys(entry.data).length > 0
  return (
    <li className="relative pl-6">
      <span
        aria-hidden="true"
        className="absolute left-0 top-1.5 inline-block h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: accentColor }}
      />
      <p className="text-sm font-medium">{humanizeKind(entry.kind)}</p>
      <p className="mt-0.5 text-xs text-stone-500">
        {new Date(entry.at).toLocaleString()}
      </p>
      {hasData && (
        <pre className="mt-2 overflow-x-auto rounded-md bg-stone-50 p-2 text-[11px] leading-relaxed text-stone-700 ring-1 ring-border">
          {JSON.stringify(entry.data, null, 2)}
        </pre>
      )}
    </li>
  )
}
