/**
 * setup.ts
 *
 * Global test setup and configuration for frontend tests.
 * Configures vitest, mocks, and testing utilities.
 */

import { vi, beforeAll, afterEach, afterAll } from 'vitest'
import '@testing-library/jest-dom'

/**
 * Setup global test environment
 */

// Mock window.matchMedia for responsive tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return []
  }
  unobserve() {}
}

// Mock fetch for API calls
global.fetch = vi.fn()

/**
 * Global test configuration
 */

// Suppress console errors in tests (optional)
const originalError = console.error
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Not implemented: HTMLFormElement.prototype.submit')
    ) {
      return
    }
    originalError.call(console, ...args)
  }
})

afterAll(() => {
  console.error = originalError
})

// Clear all mocks after each test
afterEach(() => {
  vi.clearAllMocks()
})

/**
 * Mock Supabase auth client
 */
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      onAuthStateChange: vi.fn(() => ({
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      })),
      getSession: vi.fn(async () => ({
        data: {
          session: {
            user: {
              id: 'user-123',
              email: 'test@example.com',
              user_metadata: {
                full_name: 'Test User',
              },
            },
            access_token: 'mock_token_123',
            refresh_token: 'mock_refresh_123',
          },
        },
      })),
      signUp: vi.fn(async (opts) => ({
        data: {
          user: {
            id: 'user-123',
            email: opts.email,
          },
          session: null,
        },
        error: null,
      })),
      signInWithPassword: vi.fn(async (opts) => ({
        data: {
          user: {
            id: 'user-123',
            email: opts.email,
          },
          session: {
            access_token: 'mock_token_123',
            refresh_token: 'mock_refresh_123',
          },
        },
        error: null,
      })),
      signOut: vi.fn(async () => ({
        error: null,
      })),
    },
  })),
}))

/**
 * Test utilities and helpers
 */

export const mockLocalStorage = () => {
  const store: Record<string, string> = {}

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString()
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      for (const key in store) {
        delete store[key]
      }
    },
  }
}

/**
 * Mock API responses
 */
export const mockApiResponses = {
  listings: [
    {
      id: '1',
      address: '123 Main St, Anytown, CA 12345',
      headline: '3BR/2BA Home',
      description_ai: 'Beautiful home in great neighborhood',
      status: 'draft',
      beds: 3,
      baths: 2,
      price_mid: 500000,
      created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: '2',
      address: '456 Oak Ave, Springfield, IL 62701',
      headline: '4BR/3BA Modern Farmhouse',
      description_ai: 'Modern farmhouse with spacious lot',
      status: 'published',
      beds: 4,
      baths: 3,
      price_mid: 350000,
      created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ],
  emptyListings: [],
  user: {
    id: 'user-123',
    email: 'test@example.com',
    user_metadata: {
      full_name: 'Test User',
    },
  },
}

/**
 * Wait for async operations to complete
 */
export const waitForAsync = () => new Promise((resolve) => setTimeout(resolve, 0))

/**
 * Setup timers for tests
 */
afterEach(() => {
  vi.useRealTimers()
})
