/**
 * Listing wizard API client.
 * Talks to POST /api/listings/generate on the Saveero backend.
 */
import { getAuthToken } from './auth'

// ─── Types (mirror saveero/listing_wizard/models.py) ─────────────────────────

export interface PropertyFeature {
  feature_type: string
  count?: number
  description: string
  square_feet?: number
  features: string[]
  dimensions?: string
}

export interface SimilarProperty {
  address: string
  price: number
  bedrooms: number
  bathrooms: number
  property_type: string
  description: string
  square_feet?: number | null
  distance?: string | null
  latitude?: number | null
  longitude?: number | null
}

export interface WideImageAnalysis {
  beds: number
  total_baths: number
  half_baths: number
  description: string
  bedrooms: string[]
  bathrooms: string[]
  areas: string[]
  year_built_estimate?: number | null
}

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

export interface ListingFormData {
  images: File[]
  address: string
  notes: string
}

// ─── API ─────────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, init: RequestInit): Promise<T> {
  const token = getAuthToken()
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> ?? {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(url, { ...init, headers })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`${res.status} ${res.statusText}: ${text}`)
  }
  return res.json()
}

export const listingApi = {
  /**
   * Upload photos and get back a fully structured AI-generated listing.
   * Calls POST /api/listings/generate
   */
  async generate(data: ListingFormData): Promise<GeneratedListing> {
    const body = new FormData()
    data.images.forEach(img => body.append('images', img))
    body.append('address', data.address)
    body.append('notes', data.notes)
    return apiFetch<GeneratedListing>('/api/listings/generate', { method: 'POST', body })
  },

  /**
   * Persist a confirmed listing to the database.
   * Calls POST /api/listings/save
   * TODO: implement once the property routes module is built.
   */
  async save(listing: GeneratedListing): Promise<{ success: boolean; id?: string }> {
    return apiFetch('/api/listings/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(listing),
    })
  },
}
