/**
 * Dashboard page component - displays all saved property listings for the current user
 *
 * Features:
 * - Shows summary statistics (total, active, draft listings)
 * - Displays each listing with key properties (address, price, beds, baths, created date)
 * - Color-coded status badges (draft/published/active)
 * - Links to view/edit individual listings
 * - Handles loading and error states gracefully
 * - Gracefully handles unauthenticated state (shows empty state, not error)
 *
 * Data flow:
 * - Fetches user email and listing data on mount via listingApi
 * - Displays loading state during initial fetch
 * - Shows error banner only for non-401 errors (401 = not logged in = normal)
 * - Empty state prompts user to create first listing
 *
 * @component
 * @returns {JSX.Element} The dashboard page with listing table
 *
 * @example
 * <Dashboard />
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Home, Plus, Bed, Bath, DollarSign, Clock, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { listingApi, type SavedListing } from '@/api/listingApi'
import { getUser } from '@/api/auth'

/**
 * Formats an ISO datetime string as a human-readable relative time string
 *
 * @param {string} iso - ISO 8601 datetime string
 * @returns {string} Relative time (e.g., "Today", "Yesterday", "3 days ago", or formatted date)
 *
 * @example
 * timeAgo('2026-04-15T10:30:00Z') // Returns "Today"
 * timeAgo('2026-04-14T10:30:00Z') // Returns "Yesterday"
 * timeAgo('2026-04-10T10:30:00Z') // Returns "5 days ago"
 */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(iso).toLocaleDateString()
}

/**
 * Status badge component - displays listing status with color coding
 *
 * Maps status values to styled badges:
 * - draft: slate (gray) - not yet published
 * - published: blue - listing is live
 * - active: green - actively being marketed
 *
 * @param {Object} props - Component props
 * @param {string} props.status - Listing status value (draft/published/active or custom)
 * @returns {JSX.Element} Styled status badge
 *
 * @example
 * <StatusBadge status="active" />  // Returns green "active" badge
 * <StatusBadge status="draft" />   // Returns gray "draft" badge
 */
function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft:     'bg-slate-100 text-slate-600',
    published: 'bg-blue-100 text-blue-700',
    active:    'bg-green-100 text-green-700',
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? styles.draft}`}>
      {status}
    </span>
  )
}

/**
 * Dashboard component - displays all saved listings for the current user
 *
 * Features:
 * - Shows summary statistics (total, active, draft listings)
 * - Displays each listing with key properties (address, price, beds, baths, created date)
 * - Color-coded status badges (draft/published/active)
 * - Links to view/edit individual listings
 * - Handles loading and error states gracefully
 * - Gracefully handles unauthenticated state (shows empty state, not error)
 *
 * Data flow:
 * - Fetches user email and listing data on mount via listingApi
 * - Displays loading state during initial fetch
 * - Shows error banner only for non-401 errors (401 = not logged in = normal)
 * - Empty state prompts user to create first listing
 *
 * @component
 * @returns {JSX.Element} The dashboard page with listing table
 *
 * @example
 * <Dashboard />
 */
export default function Dashboard() {
  const [listings, setListings]   = useState<SavedListing[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    getUser().then(u => setUserEmail(u?.email ?? null))

    listingApi.list()
      .then(setListings)
      .catch(err => {
        // 401 means not logged in yet — show empty state, not an error banner
        if (!err.message?.includes('401')) setError(err.message)
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          {userEmail && (
            <p className="mt-1 text-sm text-muted-foreground">{userEmail}</p>
          )}
        </div>
        <Button asChild>
          <Link to="/list-property">
            <Plus className="mr-2 h-4 w-4" /> New Listing
          </Link>
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total listings', value: listings.length },
          { label: 'Active',         value: listings.filter(l => l.status === 'active').length },
          { label: 'Drafts',         value: listings.filter(l => l.status === 'draft').length },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Listings table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Listings</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && (
            <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
          )}

          {!loading && error && (
            <p className="py-12 text-center text-sm text-red-500">{error}</p>
          )}

          {!loading && !error && listings.length === 0 && (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <div className="rounded-full bg-slate-100 p-4">
                <Home className="h-8 w-8 text-slate-400" />
              </div>
              <div>
                <p className="font-medium">No listings yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Upload photos and let the AI generate your first listing.
                </p>
              </div>
              <Button asChild variant="outline">
                <Link to="/list-property">
                  <Plus className="mr-2 h-4 w-4" /> Create your first listing
                </Link>
              </Button>
            </div>
          )}

          {!loading && listings.length > 0 && (
            <div className="divide-y">
              {listings.map(listing => (
                <div key={listing.id} className="flex items-center justify-between py-4">
                  <div className="space-y-1">
                    <p className="font-medium leading-tight">{listing.address}</p>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      {listing.price_mid && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3.5 w-3.5" />
                          {formatCurrency(listing.price_mid)}
                        </span>
                      )}
                      {listing.beds && (
                        <span className="flex items-center gap-1">
                          <Bed className="h-3.5 w-3.5" /> {listing.beds} bd
                        </span>
                      )}
                      {listing.baths && (
                        <span className="flex items-center gap-1">
                          <Bath className="h-3.5 w-3.5" /> {listing.baths} ba
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" /> {timeAgo(listing.created_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={listing.status} />
                    <Button variant="ghost" size="icon" asChild>
                      <Link to={`/listings/${listing.id}`}>
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
