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
import { Download, Pencil, Trash2, UserPlus, X } from 'lucide-react'
import {
  adminBulkDeleteLeads,
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
  homeowner:        'Current homeowner',
  first_time_buyer: 'First-time buyer',
  pro:              'Pro',
  unknown:          'Unknown role',
}

const INTENT_LABEL: Record<LeadIntent, string> = {
  considering_move: 'Considering a move',
  refinance:        'Refinance',
  rental_explore:   'Exploring renting',
  curious:          'Curious',
  unknown:          'Unknown intent',
}

// Keys are the canonical long-form slugs written by both the user-side
// OnboardingWizard and the admin-side LeadDetailsCard edit form. The
// older short-form keys (planner / agent / broker) were a no-op fallback
// — they never matched anything actually stored on `leads.pipeline`.
const PIPELINE_COLOR: Record<string, string> = {
  'financial-planner': SCENARIO_PALETTE.blue,
  'real-estate-agent': SCENARIO_PALETTE.emerald,
  'mortgage-broker':   SCENARIO_PALETTE.amber,
}

// Display labels for pipeline slugs. Falls back to a humanized slug
// ("foo-bar" → "Foo bar") for any unknown value so the chip never
// renders raw slugs like "financial-planner" in the UI.
const PIPELINE_LABEL: Record<string, string> = {
  'financial-planner': 'Financial planner',
  'real-estate-agent': 'Real estate agent',
  'mortgage-broker':   'Mortgage broker',
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
// CSV export — "download current view" for the outbound team. All
// client-side: the leads list is already in memory, so there's no need
// for a backend export endpoint.
// ---------------------------------------------------------------------------

/** RFC-4180 cell escaping — quote if the value has a comma, quote, or newline. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** Render a list of leads as a CSV string, reusing the display label maps. */
function leadsToCsv(rows: Lead[]): string {
  const headers = [
    'Name', 'Email', 'Status', 'Role', 'Intent', 'Pipeline',
    'Created', 'Last activity', 'Time in stage',
  ]
  const lines = [headers.map(csvCell).join(',')]
  for (const lead of rows) {
    const lastEntry =
      lead.activity_log.length > 0
        ? lead.activity_log[lead.activity_log.length - 1]
        : null
    const cells = [
      lead.name ?? '',
      lead.email ?? '',
      STATUS_LABEL[lead.status] ?? lead.status,
      ROLE_LABEL[lead.role],
      INTENT_LABEL[lead.intent],
      lead.pipeline ? (PIPELINE_LABEL[lead.pipeline] ?? lead.pipeline) : '',
      new Date(lead.created_at).toLocaleDateString(),
      lastEntry ? humanizeKind(lastEntry.kind) : '',
      durationLabel(stageEnteredAt(lead)),
    ]
    lines.push(cells.map((c) => csvCell(String(c))).join(','))
  }
  // CRLF line endings — what Excel expects from a CSV.
  return lines.join('\r\n')
}

/** Trigger a browser download of `csv` as `filename`. */
function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminCRM() {
  const [leads, setLeads] = useState<Lead[] | null>(null)
  const [error, setError] = useState<'forbidden' | 'other' | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [selected, setSelected] = useState<Lead | null>(null)
  // Multi-select state for bulk delete. Reset to empty after every
  // successful delete + after every refetch so the floating action bar
  // hides itself.
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  // Confirm-dialog state. Holds the pending delete payload + any error
  // from the last attempt so the modal can show "Try again" inline
  // instead of dumping the user back to the Kanban after a network blip.
  const [confirmPayload, setConfirmPayload] = useState<{
    ids: string[]
    error: string | null
  } | null>(null)
  const [deleting, setDeleting] = useState(false)
  // Faceted filters. Within a facet the chips are OR'd; across facets
  // they're AND'd; an empty facet doesn't constrain. Standard faceted
  // filtering — the first thing influencer-style users reach for once
  // the funnel passes ~20 leads.
  const [pipelineFilter, setPipelineFilter] = useState<Set<string>>(new Set())
  const [intentFilter, setIntentFilter] = useState<Set<LeadIntent>>(new Set())

  function togglePipelineFilter(value: string) {
    setPipelineFilter((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  function toggleIntentFilter(value: LeadIntent) {
    setIntentFilter((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  function clearFilters() {
    setPipelineFilter(new Set())
    setIntentFilter(new Set())
  }

  function toggleChecked(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSelection() {
    setCheckedIds(new Set())
  }

  // Bulk delete — same handler is reused by the drawer's single-lead
  // delete button (passes a one-element array). Two-step: this just
  // opens the confirm modal; confirmDelete() below does the work after
  // the user clicks the destructive button.
  function handleBulkDelete(ids: string[]) {
    if (ids.length === 0) return
    setConfirmPayload({ ids, error: null })
  }

  // Executes the pending delete. On success splices the deleted ids
  // out of local state instead of refetching, so the Kanban updates
  // instantly without a round-trip flash. On failure leaves the modal
  // open with the error inline so the user can retry or cancel.
  async function confirmDelete() {
    if (!confirmPayload) return
    const ids = confirmPayload.ids
    setDeleting(true)
    try {
      await adminBulkDeleteLeads(ids)
      const idSet = new Set(ids)
      setLeads((prev) => (prev ? prev.filter((l) => !idSet.has(l.id)) : prev))
      setCheckedIds((prev) => {
        const next = new Set(prev)
        for (const id of ids) next.delete(id)
        return next
      })
      if (selected && idSet.has(selected.id)) setSelected(null)
      setConfirmPayload(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Delete failed'
      setConfirmPayload({ ids, error: msg })
    } finally {
      setDeleting(false)
    }
  }

  function cancelDelete() {
    if (deleting) return
    setConfirmPayload(null)
  }

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
  // Subtitle counts always reflect the full funnel — the filter only
  // narrows what's shown in the columns, it doesn't change the totals.
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

  // Apply the faceted filters. Within a facet: OR. Across facets: AND.
  // An empty facet imposes no constraint.
  const filtersActive = pipelineFilter.size > 0 || intentFilter.size > 0
  const filteredLeads = filtersActive
    ? leads.filter((l) => {
        const pipelineOk =
          pipelineFilter.size === 0 ||
          (l.pipeline != null && pipelineFilter.has(l.pipeline))
        const intentOk =
          intentFilter.size === 0 || intentFilter.has(l.intent)
        return pipelineOk && intentOk
      })
    : leads

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

  // Export the *current view* (filtered set) as a CSV download. Matches
  // the filter-bar semantics — if a filter is active, the export is
  // narrowed to match.
  function handleExportCsv() {
    const csv = leadsToCsv(filteredLeads)
    const today = new Date().toISOString().slice(0, 10)
    downloadCsv(csv, `saveero-leads-${today}.csv`)
  }

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-8 p-6 md:py-10">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Leads</h1>
            <p className="mt-2 text-sm text-stone-600">
              {subtitleParts.join(' · ')}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            className="shrink-0"
          >
            <Download className="mr-1.5 h-4 w-4" />
            Export CSV
            {filtersActive && ` (${filteredLeads.length})`}
          </Button>
        </header>

        {/* Faceted filter bar — toggle by pipeline + intent. */}
        <FilterBar
          pipelineFilter={pipelineFilter}
          intentFilter={intentFilter}
          onTogglePipeline={togglePipelineFilter}
          onToggleIntent={toggleIntentFilter}
          onClear={clearFilters}
          filtersActive={filtersActive}
          shown={filteredLeads.length}
          total={leads.length}
        />

        {/* Live funnel — the four active statuses. */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {STATUS_COLUMNS.map(({ status, label, color }) => {
            const columnLeads = filteredLeads.filter((l) => l.status === status)
            return (
              <KanbanColumn
                key={status}
                label={label}
                color={color}
                leads={columnLeads}
                onSelect={setSelected}
                checkedIds={checkedIds}
                onToggleCheck={toggleChecked}
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
              const columnLeads = filteredLeads.filter((l) => l.status === status)
              return (
                <KanbanColumn
                  key={status}
                  label={label}
                  color={color}
                  leads={columnLeads}
                  onSelect={setSelected}
                  checkedIds={checkedIds}
                  onToggleCheck={toggleChecked}
                />
              )
            })}
          </div>
        </div>
      </div>

      {/* Floating bulk-action bar. Slides up from the bottom whenever
          one or more cards are selected. Centered, max-content width
          so it doesn't span the whole viewport. */}
      {checkedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full bg-stone-900 px-4 py-2 text-sm text-white shadow-xl ring-1 ring-stone-900/20">
            <span className="font-medium">
              {checkedIds.size} selected
            </span>
            <span className="h-4 w-px bg-stone-700" aria-hidden="true" />
            <button
              type="button"
              onClick={() => handleBulkDelete([...checkedIds])}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors hover:bg-stone-700 disabled:opacity-60"
              style={{ color: '#fca5a5' }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
            <button
              type="button"
              onClick={clearSelection}
              disabled={deleting}
              className="rounded-full px-3 py-1 text-sm font-medium text-stone-300 transition-colors hover:bg-stone-700 hover:text-white"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {selected && (
        <LeadDrawer
          lead={selected}
          onClose={() => setSelected(null)}
          onUpdate={handleAfterUpdate}
          onDelete={() => handleBulkDelete([selected.id])}
        />
      )}

      {confirmPayload && (
        <ConfirmDeleteDialog
          count={confirmPayload.ids.length}
          error={confirmPayload.error}
          deleting={deleting}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Confirm-delete dialog — in-app modal that replaces window.confirm.
// Backdrop click + Escape both cancel. Confirm button stays disabled
// while the request is in flight; if it fails, the error renders
// inline so the user can retry without losing their selection.
// ---------------------------------------------------------------------------

interface ConfirmDeleteDialogProps {
  count: number
  error: string | null
  deleting: boolean
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmDeleteDialog({
  count,
  error,
  deleting,
  onConfirm,
  onCancel,
}: ConfirmDeleteDialogProps) {
  // Escape cancels, same affordance as the LeadDrawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const word = count === 1 ? 'lead' : `${count} leads`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop — click to cancel. */}
      <button
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
        className="absolute inset-0 bg-stone-900/40"
      />

      {/* Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        className="relative w-full max-w-sm rounded-xl bg-card p-6 shadow-2xl ring-1 ring-border"
      >
        <div
          className="inline-flex h-10 w-10 items-center justify-center rounded-full"
          style={{ backgroundColor: '#b8584414' }}
        >
          <Trash2 className="h-5 w-5" style={{ color: '#b85844' }} />
        </div>
        <h2
          id="confirm-delete-title"
          className="mt-3 text-lg font-bold tracking-tight"
        >
          Delete {word}?
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          This can't be undone. Activity history is gone for good. If
          the user comes back, they'll be re-seeded as a fresh "new"
          lead.
        </p>

        {error && (
          <p
            className="mt-4 rounded-md border px-3 py-2 text-xs"
            style={{
              color: '#b85844',
              borderColor: '#b8584433',
              backgroundColor: '#b858440a',
            }}
          >
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={deleting}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={deleting}
            onClick={onConfirm}
            style={{ backgroundColor: '#b85844' }}
          >
            {deleting ? 'Deleting…' : error ? 'Try again' : `Delete ${word}`}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Filter bar — faceted filtering above the Kanban. Two facets: pipeline
// and intent. Within a facet the chips OR together; across facets they
// AND. An empty facet imposes no constraint. Filtering is client-side —
// the leads list is already fully in memory.
// ---------------------------------------------------------------------------

interface FilterBarProps {
  pipelineFilter: Set<string>
  intentFilter: Set<LeadIntent>
  onTogglePipeline: (value: string) => void
  onToggleIntent: (value: LeadIntent) => void
  onClear: () => void
  filtersActive: boolean
  shown: number
  total: number
}

// The three canonical pipeline slugs, in funnel order.
const PIPELINE_FILTER_VALUES = [
  'financial-planner',
  'real-estate-agent',
  'mortgage-broker',
] as const

// All five intent values — 'unknown' included so an admin can isolate
// leads that haven't been enriched yet.
const INTENT_FILTER_VALUES: LeadIntent[] = [
  'considering_move',
  'refinance',
  'rental_explore',
  'curious',
  'unknown',
]

function FilterBar({
  pipelineFilter,
  intentFilter,
  onTogglePipeline,
  onToggleIntent,
  onClear,
  filtersActive,
  shown,
  total,
}: FilterBarProps) {
  return (
    <section className="rounded-xl bg-card p-4 shadow-sm ring-1 ring-border">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {/* Pipeline facet */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            Pipeline
          </span>
          <div className="flex flex-wrap gap-1.5">
            {PIPELINE_FILTER_VALUES.map((value) => (
              <FilterChip
                key={value}
                label={PIPELINE_LABEL[value] ?? value}
                active={pipelineFilter.has(value)}
                color={PIPELINE_COLOR[value] ?? SCENARIO_PALETTE.violet}
                onClick={() => onTogglePipeline(value)}
              />
            ))}
          </div>
        </div>

        {/* Intent facet */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            Intent
          </span>
          <div className="flex flex-wrap gap-1.5">
            {INTENT_FILTER_VALUES.map((value) => (
              <FilterChip
                key={value}
                label={INTENT_LABEL[value]}
                active={intentFilter.has(value)}
                color={SCENARIO_PALETTE.violet}
                onClick={() => onToggleIntent(value)}
              />
            ))}
          </div>
        </div>

        {/* Result count + clear — only once a filter is active. */}
        {filtersActive && (
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-stone-500">
              Showing {shown} of {total}
            </span>
            <button
              type="button"
              onClick={onClear}
              className="rounded-md px-2 py-1 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

function FilterChip({
  label,
  active,
  color,
  onClick,
}: {
  label: string
  active: boolean
  color: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
        active
          ? 'border-transparent text-white'
          : 'border-border bg-card text-stone-600 hover:bg-stone-50',
      )}
      style={active ? { backgroundColor: color } : undefined}
    >
      {label}
    </button>
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
  checkedIds: Set<string>
  onToggleCheck: (id: string) => void
}

function KanbanColumn({
  label,
  color,
  leads,
  onSelect,
  checkedIds,
  onToggleCheck,
}: KanbanColumnProps) {
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
              checked={checkedIds.has(lead.id)}
              onToggleCheck={onToggleCheck}
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
  checked: boolean
  onToggleCheck: (id: string) => void
}

function LeadCard({ lead, color, onSelect, checked, onToggleCheck }: LeadCardProps) {
  const lastEntry =
    lead.activity_log.length > 0
      ? lead.activity_log[lead.activity_log.length - 1]
      : null

  // Outer is a div-with-button-semantics (not a <button>) so we can
  // nest a real <input type=checkbox> inside without violating HTML's
  // "no interactive descendants of <button>" rule. Keyboard handler
  // mirrors what a <button> would do: Enter/Space open the drawer.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(lead)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(lead)
        }
      }}
      className={cn(
        'group relative block w-full cursor-pointer rounded-xl bg-card p-4 text-left shadow-md ring-1 ring-border transition-shadow hover:shadow-lg focus:outline-none focus:ring-2',
        checked && 'ring-2',
      )}
      style={checked ? { boxShadow: `0 0 0 2px ${color}` } : undefined}
    >
      {/* Selection checkbox — top-right. Visible on hover or when
          checked. Clicks stop propagation so they don't open the drawer. */}
      <label
        className={cn(
          'absolute right-2 top-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md transition-opacity',
          checked
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggleCheck(lead.id)}
          aria-label={`Select ${lead.name ?? 'unnamed lead'}`}
          className="h-4 w-4 cursor-pointer rounded border-stone-300 accent-stone-700"
        />
      </label>

      <p
        className={cn(
          'pr-7 text-sm font-semibold tracking-tight',
          !lead.name && 'text-stone-400',
        )}
      >
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
    </div>
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
  const label =
    PIPELINE_LABEL[pipeline] ??
    // Humanize any unknown slug instead of dumping the raw value.
    pipeline.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-700">
      <span
        aria-hidden="true"
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: dotColor }}
      />
      {label}
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
  /** Called to delete the currently-open lead. Parent handles confirm
   *  + the API call + closing the drawer. */
  onDelete: () => void
}

function LeadDrawer({ lead, onClose, onUpdate, onDelete }: LeadDrawerProps) {
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
          {/* Identity / metadata — toggleable between read-only display
              and an inline edit form for name / role / intent / pipeline. */}
          <LeadDetailsCard
            lead={lead}
            accentColor={accentColor}
            onUpdate={onUpdate}
          />

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

          {/* Destructive zone — small, separated, dimmed by default
              so it doesn't compete with the editor sections above. */}
          <div className="mt-10 border-t border-border pt-6">
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-stone-500 transition-colors hover:bg-stone-100"
              style={{ color: '#b85844' }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete lead
            </button>
          </div>
        </div>
      </aside>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Lead details card — read-only metadata grid with an Edit toggle that
// turns the editable fields (name / role / intent / pipeline) into an
// inline form. Email + Created + In-stage stay read-only either way
// since they're either externally-sourced (email comes from
// public.users) or intrinsic (timestamps).
// ---------------------------------------------------------------------------

interface LeadDetailsCardProps {
  lead: Lead
  accentColor: string
  onUpdate: (updated: Lead) => void
}

const ROLE_OPTIONS: { value: LeadRole; label: string }[] = [
  { value: 'homeowner',        label: 'Current homeowner' },
  { value: 'first_time_buyer', label: 'First-time buyer' },
  { value: 'pro',              label: 'Pro' },
  { value: 'unknown',          label: 'Unknown' },
]

const INTENT_OPTIONS: { value: LeadIntent; label: string }[] = [
  { value: 'considering_move', label: 'Considering a move' },
  { value: 'refinance',        label: 'Refinance' },
  { value: 'rental_explore',   label: 'Exploring renting' },
  { value: 'curious',          label: 'Curious' },
  { value: 'unknown',          label: 'Unknown' },
]

// Empty-string sentinel for "no pipeline" — <select> values are
// strings, so we can't use null directly.
const PIPELINE_OPTIONS: { value: string; label: string }[] = [
  { value: '',                  label: '— None —' },
  { value: 'financial-planner', label: 'Financial planner' },
  { value: 'real-estate-agent', label: 'Real estate agent' },
  { value: 'mortgage-broker',   label: 'Mortgage broker' },
]

function LeadDetailsCard({ lead, accentColor, onUpdate }: LeadDetailsCardProps) {
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(lead.name ?? '')
  const [draftRole, setDraftRole] = useState<LeadRole>(lead.role)
  const [draftIntent, setDraftIntent] = useState<LeadIntent>(lead.intent)
  const [draftPipeline, setDraftPipeline] = useState<string>(lead.pipeline ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // When the selected lead changes (or the parent hands us a fresh copy
  // after another save), reset all draft state. Without this, editing
  // lead A, switching to lead B, then opening A again would show
  // stale drafts.
  useEffect(() => {
    setDraftName(lead.name ?? '')
    setDraftRole(lead.role)
    setDraftIntent(lead.intent)
    setDraftPipeline(lead.pipeline ?? '')
    setEditing(false)
    setError(null)
  }, [lead.id, lead.updated_at])

  function handleCancel() {
    setDraftName(lead.name ?? '')
    setDraftRole(lead.role)
    setDraftIntent(lead.intent)
    setDraftPipeline(lead.pipeline ?? '')
    setEditing(false)
    setError(null)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      // Send only the fields that actually changed. The backend treats
      // omitted fields as "leave alone" so this minimizes the patch.
      const patch: {
        name?: string
        role?: LeadRole
        intent?: LeadIntent
        pipeline?: string
      } = {}
      const trimmedName = draftName.trim()
      if (trimmedName !== (lead.name ?? '')) patch.name = trimmedName
      if (draftRole !== lead.role) patch.role = draftRole
      if (draftIntent !== lead.intent) patch.intent = draftIntent
      if ((draftPipeline || null) !== (lead.pipeline ?? null)) {
        // Empty string from the select represents "clear pipeline". The
        // backend's patch model lets pipeline be omitted to keep the
        // current value; passing an empty string clears it.
        patch.pipeline = draftPipeline
      }

      if (Object.keys(patch).length === 0) {
        setEditing(false)
        return
      }

      const updated = await adminUpdateLead(lead.id, patch)
      onUpdate(updated)
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div className="space-y-3">
        <dl className="grid grid-cols-3 gap-y-3 text-sm">
          <DetailRow
            term="Name"
            value={
              lead.name
                ? lead.name
                : <span className="text-stone-400">(no name yet)</span>
            }
          />
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
          <DetailRow term="Role"   value={ROLE_LABEL[lead.role]} />
          <DetailRow term="Intent" value={INTENT_LABEL[lead.intent]} />
          <DetailRow
            term="Pipeline"
            value={
              lead.pipeline
                ? <PipelineChip pipeline={lead.pipeline} />
                : <span className="text-stone-400">—</span>
            }
          />
          <DetailRow term="Created" value={new Date(lead.created_at).toLocaleString()} />
          <DetailRow
            term="In stage"
            value={
              <span style={{ color: accentColor }}>
                {durationLabel(stageEnteredAt(lead))}
              </span>
            }
          />
        </dl>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900"
          >
            <Pencil className="h-3 w-3" />
            Edit details
          </button>
        </div>
      </div>
    )
  }

  // ---- Edit mode ----
  return (
    <div className="rounded-lg border border-border bg-card/40 p-4">
      <h3 className="text-sm font-semibold tracking-tight">Edit details</h3>

      <div className="mt-4 space-y-3 text-sm">
        <Field label="Name">
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="e.g. Jane Doe"
            className="w-full rounded-md border border-border bg-card px-3 py-2 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none"
            autoFocus
          />
        </Field>

        <Field label="Role">
          <select
            value={draftRole}
            onChange={(e) => setDraftRole(e.target.value as LeadRole)}
            className="w-full rounded-md border border-border bg-card px-3 py-2 focus:border-stone-400 focus:outline-none"
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Intent">
          <select
            value={draftIntent}
            onChange={(e) => setDraftIntent(e.target.value as LeadIntent)}
            className="w-full rounded-md border border-border bg-card px-3 py-2 focus:border-stone-400 focus:outline-none"
          >
            {INTENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Pipeline">
          <select
            value={draftPipeline}
            onChange={(e) => setDraftPipeline(e.target.value)}
            className="w-full rounded-md border border-border bg-card px-3 py-2 focus:border-stone-400 focus:outline-none"
          >
            {PIPELINE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
      </div>

      {error && (
        <p className="mt-3 text-xs" style={{ color: '#b85844' }}>{error}</p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={saving}
          onClick={handleCancel}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={saving}
          onClick={handleSave}
          style={!saving ? { backgroundColor: accentColor } : undefined}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wide text-stone-500">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
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
