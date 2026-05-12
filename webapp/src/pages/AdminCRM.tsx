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
import { useCallback, useEffect, useState } from 'react'
import { UserPlus, X } from 'lucide-react'
import {
  adminUpdateLead,
  listAllLeads,
  type ActivityLogEntry,
  type Lead,
  type LeadIntent,
  type LeadRole,
  type LeadStatus,
} from '@/api/leadsApi'
import { Button } from '@/components/ui/button'
import { SCENARIO_PALETTE } from '@/lib/chartPalette'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Display helpers — humanize the enum values so the kanban reads like
// natural language instead of database internals.
// ---------------------------------------------------------------------------

// Live funnel — the four statuses a lead progresses through as the user
// engages with the product. Rendered as the primary 4-column Kanban.
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

// Resolved states — terminal, only reachable via admin action. Rendered
// as a secondary 2-column row beneath the main Kanban so the funnel
// stays visually distinct from "deals already booked or set aside."
const RESOLVED_COLUMNS: ReadonlyArray<{
  status: LeadStatus
  label: string
  color: string
}> = [
  { status: 'converted', label: 'Converted', color: SCENARIO_PALETTE.amber },
  { status: 'lost',      label: 'Lost',      color: '#78716c'              }, // warm stone-500
]

const ALL_COLUMNS = [...STATUS_COLUMNS, ...RESOLVED_COLUMNS]

const STATUS_LABEL: Record<LeadStatus, string> = Object.fromEntries(
  ALL_COLUMNS.map((c) => [c.status, c.label]),
) as Record<LeadStatus, string>

const STATUS_COLOR: Record<LeadStatus, string> = Object.fromEntries(
  ALL_COLUMNS.map((c) => [c.status, c.color]),
) as Record<LeadStatus, string>

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

/**
 * Best-effort "when did this lead enter their current status."
 *
 * Walks the activity_log in reverse chronological order looking for the
 * most recent entry whose kind matches the current status — that's the
 * transition timestamp. For 'new' (the entry status) we fall back to
 * created_at; for anything else we fall back to updated_at if no
 * matching entry exists (which would mean the row was patched without
 * leaving an audit trail — shouldn't happen with the current code but
 * we handle it gracefully).
 */
function stageEnteredAt(lead: Lead): string {
  if (lead.status === 'new') return lead.created_at
  const matcher = STAGE_MATCHERS[lead.status]
  if (matcher) {
    for (let i = lead.activity_log.length - 1; i >= 0; i--) {
      if (matcher(lead.activity_log[i].kind)) {
        return lead.activity_log[i].at
      }
    }
  }
  return lead.updated_at
}

const STAGE_MATCHERS: Partial<Record<LeadStatus, (kind: string) => boolean>> = {
  enriched:  (k) => k === 'completed_wizard' || k === 'admin_marked_enriched',
  active:    (k) => k.startsWith('ran_') || k.startsWith('saved_') || k === 'admin_marked_active',
  engaged:   (k) => k.startsWith('clicked_contact_') || k === 'admin_marked_engaged',
  converted: (k) => k === 'admin_marked_converted',
  lost:      (k) => k === 'admin_marked_lost',
}

/** Short, urgency-coded duration string — "just now" / "3h" / "2d". */
function durationLabel(iso: string): string {
  const ms = Date.now() - +new Date(iso)
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminCRM() {
  const [leads, setLeads] = useState<Lead[] | null>(null)
  const [error, setError] = useState<'forbidden' | 'other' | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [selected, setSelected] = useState<Lead | null>(null)

  // Pulled out as a callback so the LeadDrawer's status editor can
  // trigger a refresh after a successful patch without re-mounting the
  // whole page or duplicating the fetch logic.
  const refresh = useCallback(() => {
    listAllLeads()
      .then((rows) => setLeads(rows))
      .catch((err: unknown) => {
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
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

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
    `${counts.converted} converted`,
    `${counts.lost} lost`,
  ]

  // After the drawer successfully patches a lead, the backend hands us
  // the new row. We splice it into the leads list in place so the
  // Kanban reflects the new status without a full network round-trip,
  // and re-point `selected` at the fresh object so the drawer's own
  // body re-renders against the updated lead (new status, new activity
  // entry from the admin action, etc.).
  function handleAfterUpdate(updated: Lead) {
    setLeads((prev) =>
      prev ? prev.map((l) => (l.id === updated.id ? updated : l)) : prev,
    )
    setSelected(updated)
  }

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-8 p-6 md:py-10">
        <header>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Leads</h1>
          <p className="mt-2 text-sm text-stone-600">
            {subtitleParts.join(' · ')}
          </p>
        </header>

        {/* Live funnel — the four active statuses. */}
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

        {/* Resolved row — terminal states reached only via admin action.
            Visually separated by a horizontal rule + smaller eyebrow so
            it reads as "history" rather than part of the active funnel. */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              Resolved
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {RESOLVED_COLUMNS.map(({ status, label, color }) => {
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
      </div>

      {selected && (
        <LeadDrawer
          lead={selected}
          onClose={() => setSelected(null)}
          onUpdate={handleAfterUpdate}
        />
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
      {/* Urgency cue — time the lead has been at its current stage.
          Reads as "1d in stage" / "3h in stage". For 'new' leads the
          stage-entry timestamp is created_at, so this also doubles as
          a how-fresh-is-this-signup signal. */}
      <p className="mt-1 text-xs text-stone-500">
        {durationLabel(stageEnteredAt(lead))} in stage
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
  /** Called with the updated lead after a successful admin patch. */
  onUpdate: (updated: Lead) => void
}

function LeadDrawer({ lead, onClose, onUpdate }: LeadDrawerProps) {
  // Resolve color from the unified label/color maps so this works for
  // both the live-funnel statuses and the resolved ones.
  const accentColor = STATUS_COLOR[lead.status] ?? SCENARIO_PALETTE.violet

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
              {STATUS_LABEL[lead.status] ?? lead.status}
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
            <DetailRow
              term="Email"
              value={
                lead.email ? (
                  <a
                    href={`mailto:${lead.email}`}
                    className="break-all text-sm font-medium underline underline-offset-2 hover:opacity-80"
                    style={{ color: accentColor }}
                  >
                    {lead.email}
                  </a>
                ) : (
                  <span className="text-stone-400">—</span>
                )
              }
            />
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
            <DetailRow
              term="In stage"
              value={
                <span style={{ color: accentColor }}>
                  {durationLabel(stageEnteredAt(lead))}
                </span>
              }
            />
          </dl>

          {/* Status editor — admin can move a lead between any statuses,
              including the resolved ones, and attach an optional note
              that gets recorded on the activity_log. */}
          <StatusEditor lead={lead} onUpdate={onUpdate} />

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

// ---------------------------------------------------------------------------
// Status editor — sits inside the drawer. Compact "Change status" panel
// with a row of status pills, an optional note field, and a Save button.
// Selecting the current status is a no-op submit (we just close edit
// mode). Submitting a different status calls the admin patch endpoint.
// ---------------------------------------------------------------------------

interface StatusEditorProps {
  lead: Lead
  onUpdate: (updated: Lead) => void
}

function StatusEditor({ lead, onUpdate }: StatusEditorProps) {
  const [draftStatus, setDraftStatus] = useState<LeadStatus>(lead.status)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // If the parent passes us a fresh lead (e.g. after our own patch
  // resolves), reset our local draft to match. Prevents the editor from
  // showing a stale draft after a successful save.
  useEffect(() => {
    setDraftStatus(lead.status)
    setNote('')
    setError(null)
  }, [lead.id, lead.status])

  const dirty = draftStatus !== lead.status || note.trim().length > 0

  async function handleSave() {
    if (!dirty) return
    setSaving(true)
    setError(null)
    try {
      const trimmedNote = note.trim()
      const updated = await adminUpdateLead(lead.id, {
        status: draftStatus,
        note: trimmedNote || undefined,
      })
      onUpdate(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-8 rounded-lg border border-border bg-card/40 p-4">
      <h3 className="text-sm font-semibold tracking-tight">Change status</h3>
      <p className="mt-1 text-xs text-stone-500">
        Admin edits are logged to the activity timeline.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {ALL_COLUMNS.map((col) => {
          const selected = draftStatus === col.status
          return (
            <button
              key={col.status}
              type="button"
              onClick={() => setDraftStatus(col.status)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                selected
                  ? 'text-white'
                  : 'border-border bg-card text-stone-700 hover:bg-stone-50',
              )}
              style={
                selected
                  ? { backgroundColor: col.color, borderColor: col.color }
                  : undefined
              }
            >
              {col.label}
            </button>
          )
        })}
      </div>

      <div className="mt-4">
        <label
          htmlFor="status-note"
          className="text-xs font-medium uppercase tracking-wide text-stone-500"
        >
          Note (optional)
        </label>
        <textarea
          id="status-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="e.g. Closed with FP Smith last Thursday."
          className="mt-1.5 w-full rounded-md border border-border bg-card px-3 py-2 text-sm placeholder:text-stone-400 focus:border-stone-400 focus:outline-none"
        />
      </div>

      {error && (
        <p className="mt-3 text-xs" style={{ color: '#b85844' }}>
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!dirty || saving}
          onClick={handleSave}
          style={
            dirty && !saving
              ? { backgroundColor: STATUS_COLOR[draftStatus] }
              : undefined
          }
        >
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
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
