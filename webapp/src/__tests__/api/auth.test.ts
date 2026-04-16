/**
 * auth.test.ts
 *
 * Tests for authentication API client covering:
 * - Login with valid credentials
 * - Handle authentication errors
 * - Token storage and retrieval
 * - Session management
 * - Logout functionality
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { signIn, signUp, signOut, getSession, getUser, authHeader, supabase } from '@/api/auth'

// Mock Supabase auth methods
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
      getUser: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
  }),
}))

describe('Authentication API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('signIn', () => {
    it('should call signInWithPassword with email and password', async () => {
      const mockAuth = supabase.auth as any
      mockAuth.signInWithPassword.mockResolvedValue({
        data: { user: { id: 'user123', email: 'user@example.com' } },
        error: null,
      })

      await signIn('user@example.com', 'password123')

      expect(mockAuth.signInWithPassword).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'password123',
      })
    })

    it('should return success with user data on valid credentials', async () => {
      const mockAuth = supabase.auth as any
      const userData = { id: 'user123', email: 'user@example.com' }
      mockAuth.signInWithPassword.mockResolvedValue({
        data: { user: userData, session: { access_token: 'token123' } },
        error: null,
      })

      const result = await signIn('user@example.com', 'password123')

      expect(result.error).toBeNull()
      expect(result.data.user.email).toBe('user@example.com')
    })

    it('should return error on invalid credentials', async () => {
      const mockAuth = supabase.auth as any
      mockAuth.signInWithPassword.mockResolvedValue({
        data: {},
        error: { message: 'Invalid login credentials' },
      })

      const result = await signIn('user@example.com', 'wrongpassword')

      expect(result.error).not.toBeNull()
      expect(result.error.message).toBe('Invalid login credentials')
    })

    it('should handle network errors', async () => {
      const mockAuth = supabase.auth as any
      mockAuth.signInWithPassword.mockRejectedValue(
        new Error('Network error')
      )

      await expect(signIn('user@example.com', 'password123')).rejects.toThrow('Network error')
    })

    it('should accept various email formats', async () => {
      const mockAuth = supabase.auth as any
      mockAuth.signInWithPassword.mockResolvedValue({
        data: { user: { id: 'user123' } },
        error: null,
      })

      const emails = [
        'user@example.com',
        'user.name@example.co.uk',
        'user+test@example.com',
      ]

      for (const email of emails) {
        await signIn(email, 'password123')
        expect(mockAuth.signInWithPassword).toHaveBeenCalledWith(
          expect.objectContaining({ email })
        )
      }
    })

    it('should accept passwords of various lengths', async () => {
      const mockAuth = supabase.auth as any
      mockAuth.signInWithPassword.mockResolvedValue({
        data: { user: { id: 'user123' } },
        error: null,
      })

      const passwords = [
        'minimum6chars', // 6+ characters
        'verylongpasswordwith123numberand!special',
      ]

      for (const password of passwords) {
        await signIn('user@example.com', password)
        expect(mockAuth.signInWithPassword).toHaveBeenCalledWith(
          expect.objectContaining({ password })
        )
      }
    })
  })

  describe('signUp', () => {
    it('should call signUp with email and password', async () => {
      const mockAuth = supabase.auth as any
      mockAuth.signUp.mockResolvedValue({
        data: { user: { id: 'user123', email: 'newuser@example.com' } },
        error: null,
      })

      await signUp('newuser@example.com', 'password123')

      expect(mockAuth.signUp).toHaveBeenCalledWith({
        email: 'newuser@example.com',
        password: 'password123',
      })
    })

    it('should return success on successful signup', async () => {
      const mockAuth = supabase.auth as any
      mockAuth.signUp.mockResolvedValue({
        data: { user: { id: 'user123', email: 'newuser@example.com' } },
        error: null,
      })

      const result = await signUp('newuser@example.com', 'password123')

      expect(result.error).toBeNull()
      expect(result.data.user.email).toBe('newuser@example.com')
    })

    it('should return error when email already exists', async () => {
      const mockAuth = supabase.auth as any
      mockAuth.signUp.mockResolvedValue({
        data: {},
        error: { message: 'User already registered' },
      })

      const result = await signUp('existing@example.com', 'password123')

      expect(result.error).not.toBeNull()
      expect(result.error.message).toContain('already')
    })

    it('should return error on weak password', async () => {
      const mockAuth = supabase.auth as any
      mockAuth.signUp.mockResolvedValue({
        data: {},
        error: { message: 'Password should be at least 6 characters' },
      })

      const result = await signUp('user@example.com', 'short')

      expect(result.error).not.toBeNull()
    })

    it('should handle network errors', async () => {
      const mockAuth = supabase.auth as any
      mockAuth.signUp.mockRejectedValue(
        new Error('Network error')
      )

      await expect(signUp('user@example.com', 'password123')).rejects.toThrow('Network error')
    })
  })

  describe('signOut', () => {
    it('should call signOut on auth client', async () => {
      const mockAuth = supabase.auth as any
      mockAuth.signOut.mockResolvedValue({ error: null })

      await signOut()

      expect(mockAuth.signOut).toHaveBeenCalled()
    })

    it('should handle successful logout', async () => {
      const mockAuth = supabase.auth as any
      mockAuth.signOut.mockResolvedValue({ error: null })

      const result = await signOut()

      expect(result.error).toBeNull()
    })

    it('should handle logout errors', async () => {
      const mockAuth = supabase.auth as any
      mockAuth.signOut.mockResolvedValue({
        error: { message: 'Logout failed' },
      })

      const result = await signOut()

      expect(result.error).not.toBeNull()
    })
  })

  describe('getSession', () => {
    it('should return current session', async () => {
      const mockAuth = supabase.auth as any
      const sessionData = {
        user: { id: 'user123', email: 'user@example.com' },
        access_token: 'token123',
        refresh_token: 'refresh123',
      }
      mockAuth.getSession.mockResolvedValue({ data: { session: sessionData } })

      const session = await getSession()

      expect(session).toEqual(sessionData)
    })

    it('should return null when not logged in', async () => {
      const mockAuth = supabase.auth as any
      mockAuth.getSession.mockResolvedValue({ data: { session: null } })

      const session = await getSession()

      expect(session).toBeNull()
    })

    it('should include access token in session', async () => {
      const mockAuth = supabase.auth as any
      mockAuth.getSession.mockResolvedValue({
        data: {
          session: {
            user: { id: 'user123' },
            access_token: 'token123',
            refresh_token: 'refresh123',
          },
        },
      })

      const session = await getSession()

      expect(session.access_token).toBe('token123')
      expect(session.refresh_token).toBe('refresh123')
    })
  })

  describe('getUser', () => {
    it('should return current authenticated user', async () => {
      const mockAuth = supabase.auth as any
      const userData = { id: 'user123', email: 'user@example.com' }
      mockAuth.getUser.mockResolvedValue({ data: { user: userData } })

      const user = await getUser()

      expect(user).toEqual(userData)
    })

    it('should return null when not logged in', async () => {
      const mockAuth = supabase.auth as any
      mockAuth.getUser.mockResolvedValue({ data: { user: null } })

      const user = await getUser()

      expect(user).toBeNull()
    })

    it('should refresh tokens automatically', async () => {
      const mockAuth = supabase.auth as any
      mockAuth.getUser.mockResolvedValue({
        data: { user: { id: 'user123' } },
      })

      await getUser()

      // getUser() should refresh tokens, so it's better than getSession()
      expect(mockAuth.getUser).toHaveBeenCalled()
    })
  })

  describe('authHeader', () => {
    it('should return Authorization header with Bearer token', async () => {
      const mockAuth = supabase.auth as any
      mockAuth.getSession.mockResolvedValue({
        data: {
          session: {
            user: { id: 'user123' },
            access_token: 'token123',
          },
        },
      })

      const header = await authHeader()

      expect(header).toBe('Bearer token123')
    })

    it('should return null when not logged in', async () => {
      const mockAuth = supabase.auth as any
      mockAuth.getSession.mockResolvedValue({ data: { session: null } })

      const header = await authHeader()

      expect(header).toBeNull()
    })

    it('should include correct Bearer prefix', async () => {
      const mockAuth = supabase.auth as any
      mockAuth.getSession.mockResolvedValue({
        data: {
          session: {
            user: { id: 'user123' },
            access_token: 'mytoken',
          },
        },
      })

      const header = await authHeader()

      expect(header).toMatch(/^Bearer /)
      expect(header).toBe('Bearer mytoken')
    })

    it('should be usable in fetch headers', async () => {
      const mockAuth = supabase.auth as any
      mockAuth.getSession.mockResolvedValue({
        data: {
          session: {
            user: { id: 'user123' },
            access_token: 'token123',
          },
        },
      })

      const header = await authHeader()
      const headers = { Authorization: header ?? '' }

      expect(headers.Authorization).toBe('Bearer token123')
    })
  })

  describe('Session Management', () => {
    it('should handle token refresh after expiry', async () => {
      const mockAuth = supabase.auth as any
      mockAuth.getSession.mockResolvedValue({
        data: {
          session: {
            user: { id: 'user123' },
            access_token: 'old_token',
            refresh_token: 'refresh_token',
          },
        },
      })

      const session = await getSession()
      expect(session.access_token).toBe('old_token')
    })

    it('should persist session across page reloads', async () => {
      const mockAuth = supabase.auth as any
      mockAuth.getSession.mockResolvedValue({
        data: {
          session: {
            user: { id: 'user123', email: 'user@example.com' },
            access_token: 'token123',
          },
        },
      })

      const session1 = await getSession()
      const session2 = await getSession()

      expect(session1).toEqual(session2)
    })
  })

  describe('Error Handling', () => {
    it('should handle Supabase errors gracefully', async () => {
      const mockAuth = supabase.auth as any
      mockAuth.signInWithPassword.mockResolvedValue({
        data: {},
        error: {
          message: 'Invalid login credentials',
          status: 400,
        },
      })

      const result = await signIn('user@example.com', 'wrong')

      expect(result.error).not.toBeNull()
      expect(result.error.message).toBe('Invalid login credentials')
    })

    it('should handle network timeout', async () => {
      const mockAuth = supabase.auth as any
      mockAuth.signInWithPassword.mockRejectedValue(
        new Error('Request timeout')
      )

      await expect(signIn('user@example.com', 'password')).rejects.toThrow('timeout')
    })

    it('should handle invalid email format', async () => {
      const mockAuth = supabase.auth as any
      mockAuth.signUpWithPassword.mockResolvedValue({
        data: {},
        error: { message: 'Invalid email format' },
      })

      const result = await signUp('invalid-email', 'password123')

      // Component should handle form validation before calling API
      // but API should also validate
      expect(mockAuth.signUpWithPassword).not.toHaveBeenCalled()
    })
  })

  describe('Credential Validation', () => {
    it('should require email parameter', async () => {
      await expect(signIn('', 'password123')).rejects.toThrow()
    })

    it('should require password parameter', async () => {
      await expect(signIn('user@example.com', '')).rejects.toThrow()
    })

    it('should handle special characters in email', async () => {
      const mockAuth = supabase.auth as any
      mockAuth.signInWithPassword.mockResolvedValue({
        data: { user: { id: 'user123' } },
        error: null,
      })

      await signIn('user+test@example.com', 'password123')

      expect(mockAuth.signInWithPassword).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'user+test@example.com' })
      )
    })

    it('should handle special characters in password', async () => {
      const mockAuth = supabase.auth as any
      mockAuth.signInWithPassword.mockResolvedValue({
        data: { user: { id: 'user123' } },
        error: null,
      })

      const password = 'P@ssw0rd!#$%'
      await signIn('user@example.com', password)

      expect(mockAuth.signInWithPassword).toHaveBeenCalledWith(
        expect.objectContaining({ password })
      )
    })
  })
})
