/**
 * Listing API client module
 *
 * Handles communication with backend listing endpoints:
 * - POST /api/listings/generate - upload photos and generate AI listing
 * - POST /api/listings/save - persist listing to database
 * - GET /api/listings - fetch user's saved listings
 *
 * All requests include JWT authorization header via authHeader().
 *
 * Endpoints are called with RELATIVE /api/* paths — same as every other
 * API client in this app (fthbApi, leadsApi, mortgageApi, scenarioApi).
 * In dev, Vite's proxy forwards /api to localhost:8000; in prod,
 * vercel.json rewrites /api/* to the Render backend server-side. Going
 * through the rewrite keeps these calls same-origin, which avoids the
 * cross-origin CORS preflight + raw cold-start path that previously made
 * listing generation appear to hang. Do NOT reintroduce a VITE_API_URL
 * base here — it would diverge from the rest of the app again.
 *
 * @module api/listingApi
 * @example
 * import { listingApi } from '@/api/listingApi'
 *
 * // Generate listing from photos
 * const listing = await listingApi.generate({
 *   images: [File, File, ...],
 *   address: '123 Main St',
 *   notes: 'Recently renovated'
 * })
 *
 * // Save listing to database
 * await listingApi.save(listing)
 *
 * // Fetch all listings
 * const listings = await listingApi.list()
 */
import { authHeader } from './auth'

// ─── Types (mirror saveero/listing_wizard/models.py) ─────────────────────────

/**
 * Types in this section correspond to Python models in saveero/listing_wizard/models.py
 * Keep these in sync when the backend data structures change.
 */

/**
 * A single property feature/amenity detected by AI analysis
 * E.g., garage, pool, fireplace, etc.
 */
export interface PropertyFeature {
  /** Type of feature (e.g., "garage", "pool") */
  feature_type: string
  /** Count of this feature if applicable */
  count?: number
  /** Human-readable description */
  description: string
  /** Square feet if applicable (e.g., for garage) */
  square_feet?: number
  /** List of specific features within this category */
  features: string[]
  /** Dimensions if applicable */
  dimensions?: string
}

/**
 * A comparable property (comp) identified by AI for valuation context
 */
export interface SimilarProperty {
  /** Property address */
  address: string
  /** Sold/listed price */
  price: number
  /** Number of bedrooms */
  bedrooms: number
  /** Number of bathrooms */
  bathrooms: number
  /** Property type (e.g., "Single Family Home") */
  property_type: string
  /** Brief property description */
  description: string
  /** Square footage if available */
  square_feet?: number | null
  /** Distance from subject property */
  distance?: string | null
  /** Geographic coordinates */
  latitude?: number | null
  longitude?: number | null
}

/**
 * Analysis result from a wide-angle property photo
 * Includes room detection, fixture inventory, and square footage estimation
 */
export interface WideImageAnalysis {
  /** Detected number of bedrooms */
  beds: number
  /** Total full bathrooms */
  total_baths: number
  /** Number of half bathrooms */
  half_baths: number
  /** AI description of the space */
  description: string
  /** List of detected bedrooms with descriptions */
  bedrooms: string[]
  /** List of detected bathrooms with descriptions */
  bathrooms: string[]
  /** List of detected areas/rooms */
  areas: string[]
  /** Estimated year the home was built (if detectable) */
  year_built_estimate?: number | null
}

/**
 * Complete AI-generated property listing
 * Result of POST /api/listings/generate endpoint
 * Structured for display, editing, and saving to database
 */
export interface GeneratedListing {
  title: string
  address: string
  address_line1: string
  address_line2: string
  city: string
  region: string
  zip_code: string
  country: string
  price_range: string
  recommended_price: number
  property_type: string
  square_feet?: number
  living_area?: number
  living_area_unit: string
  lot_size_value?: number
  lot_size_unit: string
  parking_total: number
  parking_covered: number
  parking_open: number
  parking_garage: number
  parking_carport: number
  parking_other: number
  parking_other_description: string
  heating_type: string[]
  cooling_type: string[]
  water_type: string[]
  sewer_type: string[]
  foundation_type: string[]
  roof_type: string[]
  exterior_material: string[]
  interior_material: string[]
  flooring_type: string[]
  bedrooms: number
  bathrooms: number
  bathrooms_full: number
  bathrooms_half: number
  year_built?: number
  features: PropertyFeature[]
  amenities: string[]
  highlights: string[]
  neighborhood_info: string
  description: string
  location_features: string[]
  latitude?: number
  longitude?: number
  similar_properties: SimilarProperty[]
  image_descriptions: unknown[]
  wide_image_analysis?: WideImageAnalysis
}

/**
 * Form data for generating a listing
 * Submitted to POST /api/listings/generate
 */
export interface ListingFormData {
  /** Array of image File objects from file input or drag-drop */
  images: File[]
  /** Property address (required) */
  address: string
  /** Optional notes for the AI (recent renovations, pricing targets, etc.) */
  notes: string
}

// ─── API ─────────────────────────────────────────────────────────────────────

/**
 * Default request timeout. List/save calls are fast and should fail
 * quickly if something is wrong; the generate call overrides this with
 * a much larger ceiling because the pipeline legitimately runs long.
 */
const DEFAULT_TIMEOUT_MS = 30_000

/**
 * Timeout for POST /api/listings/generate. The pipeline chains vision
 * analysis + multiple LLM calls (listing generation, comps search,
 * pricing, refinement) and can legitimately take 1-2 minutes. The
 * ceiling exists so a *truly* stuck request fails with a clear message
 * instead of spinning forever — it's not an expectation of how long
 * the happy path takes.
 */
const GENERATE_TIMEOUT_MS = 180_000

/**
 * Generic API fetch wrapper - handles auth, timeout, and error handling.
 *
 * Calls relative /api/* paths (see the module header) so the request
 * stays same-origin and rides the Vite proxy / vercel.json rewrite
 * like every other API client. Automatically adds the JWT auth header
 * from the current session. Aborts after `timeoutMs` and throws an
 * Error if the response is not 2xx.
 *
 * @template T - Expected response type
 * @param {string} url - Relative API path (e.g., "/api/listings/generate")
 * @param {RequestInit} init - Fetch options (method, headers, body, etc.)
 * @param {number} timeoutMs - Abort the request after this many ms
 * @returns {Promise<T>} Parsed JSON response
 * @throws {Error} If request fails, times out, or response is not ok
 *
 * @example
 * const result = await apiFetch<GeneratedListing>(
 *   '/api/listings/generate',
 *   { method: 'POST', body: formData },
 *   GENERATE_TIMEOUT_MS,
 * )
 */
async function apiFetch<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const auth = await authHeader()
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> ?? {}),
  }
  if (auth) headers['Authorization'] = auth

  // AbortController gives us a hard ceiling so a stuck request surfaces
  // a clear error instead of an indefinite spinner.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch(url, { ...init, headers, signal: controller.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        `Request timed out after ${Math.round(timeoutMs / 1000)}s. ` +
          'The server may be waking up or under load — please try again.',
      )
    }
    throw err
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`${res.status} ${res.statusText}: ${text}`)
  }
  return res.json()
}

/**
 * Listing API client with methods for generate, save, and list operations
 */
export const listingApi = {
  /**
   * Upload photos and get back a fully structured AI-generated listing
   *
   * Calls POST /api/listings/generate on the backend.
   * Backend:
   * - Analyzes uploaded photos using computer vision
   * - Detects property features (bedrooms, bathrooms, square footage)
   * - Estimates property value and market comparables
   * - Generates MLS-style listing description and highlights
   *
   * @param {ListingFormData} data - Form data with images, address, notes
   * @returns {Promise<GeneratedListing>} AI-generated listing with all metadata
   * @throws {Error} If upload fails or backend returns error
   *
   * @example
   * const listing = await listingApi.generate({
   *   images: [photoFile1, photoFile2],
   *   address: '123 Main St, Anytown, CA',
   *   notes: 'Recently renovated kitchen'
   * })
   */
  async generate(data: ListingFormData): Promise<GeneratedListing> {
    const body = new FormData()
    data.images.forEach(img => body.append('images', img))
    body.append('address', data.address)
    body.append('notes', data.notes)
    // Long timeout — the generate pipeline is a chain of vision + LLM calls.
    return apiFetch<GeneratedListing>(
      '/api/listings/generate',
      { method: 'POST', body },
      GENERATE_TIMEOUT_MS,
    )
  },

  /**
   * Persist a confirmed listing to the database
   *
   * Calls POST /api/listings/save on the backend.
   * Takes key fields from the GeneratedListing and stores in the database.
   * Creates a new listing record associated with the current user.
   *
   * Request body sent:
   * - address, headline (title), description
   * - price_min, price_mid, price_max (price range around recommended)
   * - beds, baths, sqft (property specs)
   * - comps (comparable properties for valuation)
   *
   * @param {GeneratedListing} listing - Confirmed listing from review step
   * @returns {Promise<{ success: boolean; id?: string }>} Success status and new listing ID
   * @throws {Error} If save fails
   *
   * @example
   * const result = await listingApi.save(listing)
   * if (result.success) console.log('Saved with ID:', result.id)
   */
  async save(listing: GeneratedListing): Promise<{ success: boolean; id?: string }> {
    return apiFetch('/api/listings/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: listing.address,
        headline: listing.title,
        description: listing.description,
        price_min: listing.recommended_price * 0.95,
        price_max: listing.recommended_price * 1.05,
        price_mid: listing.recommended_price,
        beds: listing.bedrooms,
        baths: listing.bathrooms,
        sqft: listing.square_feet,
        comps: listing.similar_properties,
      }),
    })
  },

  /**
   * Fetch all listings for the current user
   *
   * Calls GET /api/listings on the backend.
   * Returns all saved listings for the authenticated user,
   * including status (draft/published/active) and metadata.
   *
   * @returns {Promise<SavedListing[]>} Array of user's saved listings
   * @throws {Error} If fetch fails or user is not authenticated (401)
   *
   * @example
   * const listings = await listingApi.list()
   * listings.forEach(l => console.log(l.address, l.status))
   */
  async list(): Promise<SavedListing[]> {
    return apiFetch<SavedListing[]>('/api/listings', { method: 'GET' })
  },
}

/**
 * Listing object returned by GET /api/listings
 * Represents a saved listing in the database with user-facing metadata
 */
/**
 * Saved listing in the database - lighter version of GeneratedListing
 * Returned by GET /api/listings
 */
export interface SavedListing {
  /** Unique listing ID (UUID) */
  id: string
  /** Property address */
  address: string
  /** Listing status: draft, published, or active */
  status: string
  /** Mid-point price (recommended listing price) */
  price_mid: number | null
  /** Suggested minimum price */
  price_min_suggested: number | null
  /** Suggested maximum price */
  price_max_suggested: number | null
  /** Number of bedrooms */
  beds: number | null
  /** Number of bathrooms */
  baths: number | null
  /** AI-generated listing description */
  description_ai: string | null
  /** ISO datetime when listing was created */
  created_at: string
}
