/**
 * Dashboard.test.tsx
 *
 * Tests for the Dashboard component covering:
 * - Load and display saved listings
 * - Show listing status (draft/published/active)
 * - Format and display property details (beds, baths, price)
 * - Time-ago formatting ("2 days ago")
 * - Error handling when no listings exist
 * - Link to edit/view listings
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import Dashboard from '@/pages/Dashboard'
import * as listingModule from '@/api/listingApi'

// Mock the listing API
vi.mock('@/api/listingApi', () => ({
  listingApi: {
    list: vi.fn(),
  },
}))

// Mock router hooks
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  }
})

describe('Dashboard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Loading State', () => {
    it('should display loading state initially', () => {
      vi.mocked(listingModule.listingApi.list).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      )

      render(
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      )

      // Look for loading indicator (spinner or text)
      const container = screen.getByRole('main') || document.body
      expect(container.textContent).toContain('Loading')
    })
  })

  describe('Empty State', () => {
    it('should display empty state when no listings exist', async () => {
      vi.mocked(listingModule.listingApi.list).mockResolvedValue([])

      render(
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      )

      await waitFor(() => {
        expect(screen.getByText(/No listings yet/i)).toBeInTheDocument()
      })
    })

    it('should show "Create your first listing" prompt', async () => {
      vi.mocked(listingModule.listingApi.list).mockResolvedValue([])

      render(
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      )

      await waitFor(() => {
        expect(screen.getByText(/List a Property/i)).toBeInTheDocument()
      })
    })
  })

  describe('Listing Display', () => {
    const mockListings = [
      {
        id: '1',
        address: '123 Main St, Anytown, CA 12345',
        status: 'draft',
        price_mid: 500000,
        price_min_suggested: 475000,
        price_max_suggested: 525000,
        beds: 3,
        baths: 2,
        description_ai: 'Beautiful home in great neighborhood',
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
      },
      {
        id: '2',
        address: '456 Oak Ave, Springfield, IL 62701',
        status: 'published',
        price_mid: 350000,
        price_min_suggested: 330000,
        price_max_suggested: 370000,
        beds: 4,
        baths: 3,
        description_ai: 'Modern farmhouse with spacious lot',
        created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
      },
    ]

    beforeEach(() => {
      vi.mocked(listingModule.listingApi.list).mockResolvedValue(mockListings as any)
    })

    it('should load and display all saved listings', async () => {
      render(
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('123 Main St, Anytown, CA 12345')).toBeInTheDocument()
        expect(screen.getByText('456 Oak Ave, Springfield, IL 62701')).toBeInTheDocument()
      })
    })

    it('should display listing address', async () => {
      render(
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('123 Main St, Anytown, CA 12345')).toBeInTheDocument()
        expect(screen.getByText('456 Oak Ave, Springfield, IL 62701')).toBeInTheDocument()
      })
    })

    it('should display price information', async () => {
      render(
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('$500,000')).toBeInTheDocument()
        expect(screen.getByText('$350,000')).toBeInTheDocument()
      })
    })

    it('should display bedroom and bathroom count', async () => {
      render(
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('3 bed')).toBeInTheDocument()
        expect(screen.getByText('2 bath')).toBeInTheDocument()
        expect(screen.getByText('4 bed')).toBeInTheDocument()
        expect(screen.getByText('3 bath')).toBeInTheDocument()
      })
    })

    it('should display listing status badge', async () => {
      render(
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      )

      await waitFor(() => {
        const draftBadge = screen.getByText('Draft')
        const publishedBadge = screen.getByText('Published')
        expect(draftBadge).toBeInTheDocument()
        expect(publishedBadge).toBeInTheDocument()
      })
    })

    it('should display time-ago for creation date', async () => {
      render(
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      )

      await waitFor(() => {
        // Should show "2 days ago" and "5 days ago"
        expect(screen.getByText(/2 days? ago/)).toBeInTheDocument()
        expect(screen.getByText(/5 days? ago/)).toBeInTheDocument()
      })
    })

    it('should apply correct styling for draft status', async () => {
      render(
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      )

      await waitFor(() => {
        const draftBadge = screen.getByText('Draft')
        expect(draftBadge).toHaveClass('bg-yellow-100')
      })
    })

    it('should apply correct styling for published status', async () => {
      render(
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      )

      await waitFor(() => {
        const publishedBadge = screen.getByText('Published')
        expect(publishedBadge).toHaveClass('bg-green-100')
      })
    })
  })

  describe('Listing Details', () => {
    it('should display listing description excerpt', async () => {
      const mockListing = [
        {
          id: '1',
          address: '123 Main St',
          status: 'draft',
          price_mid: 500000,
          beds: 3,
          baths: 2,
          description_ai: 'Beautiful home in great neighborhood',
          created_at: new Date().toISOString(),
        },
      ]

      vi.mocked(listingModule.listingApi.list).mockResolvedValue(mockListing as any)

      render(
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      )

      await waitFor(() => {
        expect(screen.getByText(/Beautiful home/)).toBeInTheDocument()
      })
    })

    it('should handle null price gracefully', async () => {
      const mockListing = [
        {
          id: '1',
          address: '123 Main St',
          status: 'draft',
          price_mid: null,
          beds: 3,
          baths: 2,
          description_ai: 'Test listing',
          created_at: new Date().toISOString(),
        },
      ]

      vi.mocked(listingModule.listingApi.list).mockResolvedValue(mockListing as any)

      render(
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('123 Main St')).toBeInTheDocument()
        // Should not crash, should display "Price TBD" or similar
      })
    })

    it('should handle null beds/baths gracefully', async () => {
      const mockListing = [
        {
          id: '1',
          address: '123 Main St',
          status: 'draft',
          price_mid: 500000,
          beds: null,
          baths: null,
          description_ai: 'Test listing',
          created_at: new Date().toISOString(),
        },
      ]

      vi.mocked(listingModule.listingApi.list).mockResolvedValue(mockListing as any)

      render(
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('123 Main St')).toBeInTheDocument()
        // Should not display 0 bed/bath, should skip
      })
    })
  })

  describe('Error Handling', () => {
    it('should display error message when listing fetch fails', async () => {
      const errorMsg = 'Failed to load listings'
      vi.mocked(listingModule.listingApi.list).mockRejectedValue(
        new Error(errorMsg)
      )

      render(
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      )

      await waitFor(() => {
        expect(screen.getByText(/Error loading listings/)).toBeInTheDocument()
      })
    })

    it('should provide retry button on error', async () => {
      vi.mocked(listingModule.listingApi.list).mockRejectedValue(
        new Error('Network error')
      )

      render(
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      )

      await waitFor(() => {
        expect(screen.getByText(/Retry/)).toBeInTheDocument()
      })
    })

    it('should retry listing fetch when retry button clicked', async () => {
      vi.mocked(listingModule.listingApi.list)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce([])

      const { rerender } = render(
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      )

      await waitFor(() => {
        expect(screen.getByText(/Error loading listings/)).toBeInTheDocument()
      })

      const retryButton = screen.getByText(/Retry/)
      retryButton.click()

      // Re-render or wait for retry
      await waitFor(() => {
        expect(screen.queryByText(/Error loading listings/)).not.toBeInTheDocument()
      })
    })
  })

  describe('Navigation', () => {
    it('should have link to create new listing', async () => {
      vi.mocked(listingModule.listingApi.list).mockResolvedValue([])

      render(
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      )

      await waitFor(() => {
        const link = screen.getByText(/List a Property/)
        expect(link).toHaveAttribute('href', '/list')
      })
    })

    it('should have clickable listing cards', async () => {
      const mockListing = [
        {
          id: '1',
          address: '123 Main St',
          status: 'draft',
          price_mid: 500000,
          beds: 3,
          baths: 2,
          description_ai: 'Test',
          created_at: new Date().toISOString(),
        },
      ]

      vi.mocked(listingModule.listingApi.list).mockResolvedValue(mockListing as any)

      render(
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      )

      await waitFor(() => {
        const card = screen.getByText('123 Main St').closest('a')
        expect(card).toHaveAttribute('href', '/listings/1')
      })
    })
  })

  describe('Pagination / Large Lists', () => {
    it('should handle large number of listings', async () => {
      const listings = Array.from({ length: 50 }, (_, i) => ({
        id: `${i}`,
        address: `${i} Address St`,
        status: i % 2 === 0 ? 'draft' : 'published',
        price_mid: 500000 + i * 10000,
        beds: 3 + (i % 3),
        baths: 2 + (i % 2),
        description_ai: `Test listing ${i}`,
        created_at: new Date().toISOString(),
      }))

      vi.mocked(listingModule.listingApi.list).mockResolvedValue(listings as any)

      render(
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      )

      await waitFor(() => {
        expect(screen.getByText(/0 Address St/)).toBeInTheDocument()
        expect(screen.getByText(/49 Address St/)).toBeInTheDocument()
      })
    })
  })

  describe('Status Badge Colors', () => {
    const statusTests = [
      { status: 'draft', expectedClass: 'bg-yellow-100' },
      { status: 'published', expectedClass: 'bg-green-100' },
      { status: 'active', expectedClass: 'bg-blue-100' },
    ]

    statusTests.forEach(({ status, expectedClass }) => {
      it(`should display ${status} status with correct styling`, async () => {
        const mockListing = [
          {
            id: '1',
            address: '123 Main St',
            status,
            price_mid: 500000,
            beds: 3,
            baths: 2,
            description_ai: 'Test',
            created_at: new Date().toISOString(),
          },
        ]

        vi.mocked(listingModule.listingApi.list).mockResolvedValue(mockListing as any)

        render(
          <BrowserRouter>
            <Dashboard />
          </BrowserRouter>
        )

        await waitFor(() => {
          const badge = screen.getByText(new RegExp(status, 'i'))
          expect(badge).toHaveClass(expectedClass)
        })
      })
    })
  })

  describe('Date Formatting', () => {
    it('should format recent dates as "today"', async () => {
      const mockListing = [
        {
          id: '1',
          address: '123 Main St',
          status: 'draft',
          price_mid: 500000,
          beds: 3,
          baths: 2,
          description_ai: 'Test',
          created_at: new Date().toISOString(),
        },
      ]

      vi.mocked(listingModule.listingApi.list).mockResolvedValue(mockListing as any)

      render(
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      )

      await waitFor(() => {
        expect(screen.getByText(/today|now/i)).toBeInTheDocument()
      })
    })

    it('should format older dates correctly', async () => {
      const mockListing = [
        {
          id: '1',
          address: '123 Main St',
          status: 'draft',
          price_mid: 500000,
          beds: 3,
          baths: 2,
          description_ai: 'Test',
          created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
        },
      ]

      vi.mocked(listingModule.listingApi.list).mockResolvedValue(mockListing as any)

      render(
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      )

      await waitFor(() => {
        expect(screen.getByText(/month ago|30 days/i)).toBeInTheDocument()
      })
    })
  })
})
