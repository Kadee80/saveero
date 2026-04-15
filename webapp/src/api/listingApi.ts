/**
 * Listing API client module
 *
 * Handles communication with backend listing endpoints:
 * - POST /api/listings/generate - upload photos and generate AI listing
 * - POST /api/listings/save - persist listing to database
 * - GET /api/listings - fetch user's saved listings
 *
 * All requests include JWT authorization header via authHeader().
 * Endpoints are called relative to VITE_API_URL in production or via Vite proxy in dev.
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
 * API base URL - determined by environment
 * - Production: VITE_API_URL environment variable points to Railway backend
 * - Development: Empty string, Vite dev server proxies /api/* to localhost:8000
 * - Fallback: Empty string for relative URLs
 */
const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

/**
 * Generic API fetch wrapper - handles auth and error handling
 *
 * Automatically adds JWT authorization header from current session.
 * Throws an Error if response is not 2xx with full error details.
 *
 * @template T - Expected response type
 * @param {string} url - API endpoint path (e.g., "/api/listings/generate")
 * @param {RequestInit} init - Fetch options (method, headers, body, etc.)
 * @returns {Promise<T>} Parsed JSON response
 * @throws {Error} If request fails or response is not ok
 *
 * @example
 * const result = await apiFetch<GeneratedListing>(
 *   '/api/listings/generate',
 *   { method: 'POST', body: formData }
 * )
 */
async function apiFetch<T>(url: string, init: RequestInit): Promise<T> {
  const auth = await authHeader()
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> ?? {}),
  }
  if (auth) headers['Authorization'] = auth

  const res = await fetch(`${API_BASE}${url}`, { ...init, headers })
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
    return apiFetch<GeneratedListing>('/api/listings/generate', { method: 'POST', body })
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
