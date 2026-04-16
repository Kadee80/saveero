/**
 * Login.test.tsx
 *
 * Tests for the Login component covering:
 * - Email/password input and form validation
 * - Sign up and login button behavior
 * - Error handling for invalid credentials
 * - Success redirect after authentication
 * - Mode switching between signin and signup
 * - Form submission and loading states
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Login from '@/pages/Login'
import * as authModule from '@/api/auth'

// Mock the auth module
vi.mock('@/api/auth', () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}))

describe('Login Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Sign In Flow', () => {
    it('should render sign-in form by default', () => {
      render(<Login />)

      expect(screen.getByText('Welcome back')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Sign in')).toBeInTheDocument()
    })

    it('should accept email input', async () => {
      const user = userEvent.setup()
      render(<Login />)

      const emailInput = screen.getByPlaceholderText('you@example.com') as HTMLInputElement
      await user.type(emailInput, 'test@example.com')

      expect(emailInput.value).toBe('test@example.com')
    })

    it('should accept password input', async () => {
      const user = userEvent.setup()
      render(<Login />)

      const passwordInput = screen.getByPlaceholderText('••••••••') as HTMLInputElement
      await user.type(passwordInput, 'password123')

      expect(passwordInput.value).toBe('password123')
    })

    it('should validate required email field', async () => {
      const user = userEvent.setup()
      render(<Login />)

      const submitButton = screen.getByDisplayValue('Sign in')
      // HTML5 validation prevents submission without email
      expect(screen.getByPlaceholderText('you@example.com')).toHaveAttribute('required')
      expect(submitButton).not.toBeDisabled()
    })

    it('should validate password minimum length (6 chars)', async () => {
      render(<Login />)

      const passwordInput = screen.getByPlaceholderText('••••••••')
      expect(passwordInput).toHaveAttribute('minLength', '6')
    })

    it('should call signIn with valid credentials', async () => {
      const user = userEvent.setup()
      vi.mocked(authModule.signIn).mockResolvedValue({ data: {}, error: null })

      render(<Login />)

      await user.type(screen.getByPlaceholderText('you@example.com'), 'user@example.com')
      await user.type(screen.getByPlaceholderText('••••••••'), 'password123')
      await user.click(screen.getByDisplayValue('Sign in'))

      await waitFor(() => {
        expect(authModule.signIn).toHaveBeenCalledWith('user@example.com', 'password123')
      })
    })

    it('should display error message on failed sign-in', async () => {
      const user = userEvent.setup()
      const errorMsg = 'Invalid login credentials'
      vi.mocked(authModule.signIn).mockResolvedValue({
        data: {},
        error: { message: errorMsg },
      })

      render(<Login />)

      await user.type(screen.getByPlaceholderText('you@example.com'), 'user@example.com')
      await user.type(screen.getByPlaceholderText('••••••••'), 'wrongpass')
      await user.click(screen.getByDisplayValue('Sign in'))

      await waitFor(() => {
        expect(screen.getByText(errorMsg)).toBeInTheDocument()
      })
    })

    it('should show loading state during sign-in', async () => {
      const user = userEvent.setup()
      let resolveSignIn: any
      vi.mocked(authModule.signIn).mockImplementation(
        () => new Promise(resolve => { resolveSignIn = resolve })
      )

      render(<Login />)

      await user.type(screen.getByPlaceholderText('you@example.com'), 'user@example.com')
      await user.type(screen.getByPlaceholderText('••••••••'), 'password123')

      const submitButton = screen.getByDisplayValue('Sign in') as HTMLButtonElement
      await user.click(submitButton)

      // Button should show loading text and be disabled
      expect(screen.getByText('Please wait…')).toBeInTheDocument()
      expect(submitButton).toBeDisabled()

      // Resolve the sign-in promise
      resolveSignIn({ data: {}, error: null })

      await waitFor(() => {
        expect(screen.getByDisplayValue('Sign in')).not.toBeDisabled()
      })
    })
  })

  describe('Sign Up Flow', () => {
    it('should switch to sign-up mode when clicking "Sign up" link', async () => {
      const user = userEvent.setup()
      render(<Login />)

      const signUpLink = screen.getByText('Sign up')
      await user.click(signUpLink)

      expect(screen.getByText('Create an account')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Create account')).toBeInTheDocument()
    })

    it('should display sign-up description in signup mode', async () => {
      const user = userEvent.setup()
      render(<Login />)

      await user.click(screen.getByText('Sign up'))

      expect(screen.getByText('Sign up to get started with Saveero.')).toBeInTheDocument()
    })

    it('should call signUp with new credentials', async () => {
      const user = userEvent.setup()
      vi.mocked(authModule.signUp).mockResolvedValue({ data: {}, error: null })

      render(<Login />)
      await user.click(screen.getByText('Sign up'))

      await user.type(screen.getByPlaceholderText('you@example.com'), 'newuser@example.com')
      await user.type(screen.getByPlaceholderText('••••••••'), 'password123')
      await user.click(screen.getByDisplayValue('Create account'))

      await waitFor(() => {
        expect(authModule.signUp).toHaveBeenCalledWith('newuser@example.com', 'password123')
      })
    })

    it('should show success message and switch to signin on successful signup', async () => {
      const user = userEvent.setup()
      vi.mocked(authModule.signUp).mockResolvedValue({ data: {}, error: null })

      render(<Login />)
      await user.click(screen.getByText('Sign up'))

      await user.type(screen.getByPlaceholderText('you@example.com'), 'newuser@example.com')
      await user.type(screen.getByPlaceholderText('••••••••'), 'password123')
      await user.click(screen.getByDisplayValue('Create account'))

      await waitFor(() => {
        expect(screen.getByText(/Check your email for a confirmation link/)).toBeInTheDocument()
      })

      // Should switch back to signin mode
      expect(screen.getByDisplayValue('Sign in')).toBeInTheDocument()
    })

    it('should display error message on failed signup', async () => {
      const user = userEvent.setup()
      const errorMsg = 'Email already registered'
      vi.mocked(authModule.signUp).mockResolvedValue({
        data: {},
        error: { message: errorMsg },
      })

      render(<Login />)
      await user.click(screen.getByText('Sign up'))

      await user.type(screen.getByPlaceholderText('you@example.com'), 'existing@example.com')
      await user.type(screen.getByPlaceholderText('••••••••'), 'password123')
      await user.click(screen.getByDisplayValue('Create account'))

      await waitFor(() => {
        expect(screen.getByText(errorMsg)).toBeInTheDocument()
      })
    })

    it('should clear error when switching modes', async () => {
      const user = userEvent.setup()
      vi.mocked(authModule.signIn).mockResolvedValue({
        data: {},
        error: { message: 'Invalid credentials' },
      })

      render(<Login />)

      // Trigger error in signin mode
      await user.type(screen.getByPlaceholderText('you@example.com'), 'user@example.com')
      await user.type(screen.getByPlaceholderText('••••••••'), 'wrong')
      await user.click(screen.getByDisplayValue('Sign in'))

      await waitFor(() => {
        expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
      })

      // Switch to signup
      await user.click(screen.getByText('Sign up'))

      // Error should be cleared
      expect(screen.queryByText('Invalid credentials')).not.toBeInTheDocument()
    })
  })

  describe('Form Validation', () => {
    it('should require email field', () => {
      render(<Login />)
      const emailInput = screen.getByPlaceholderText('you@example.com')
      expect(emailInput).toHaveAttribute('required')
    })

    it('should require password field', () => {
      render(<Login />)
      const passwordInput = screen.getByPlaceholderText('••••••••')
      expect(passwordInput).toHaveAttribute('required')
    })

    it('should set password type to password', () => {
      render(<Login />)
      const passwordInput = screen.getByPlaceholderText('••••••••')
      expect(passwordInput).toHaveAttribute('type', 'password')
    })

    it('should set autocomplete attributes appropriately', async () => {
      const user = userEvent.setup()
      render(<Login />)

      const emailInput = screen.getByPlaceholderText('you@example.com')
      expect(emailInput).toHaveAttribute('autoComplete', 'email')

      let passwordInput = screen.getByPlaceholderText('••••••••')
      expect(passwordInput).toHaveAttribute('autoComplete', 'current-password')

      // Switch to signup
      await user.click(screen.getByText('Sign up'))

      passwordInput = screen.getByPlaceholderText('••••••••')
      expect(passwordInput).toHaveAttribute('autoComplete', 'new-password')
    })
  })

  describe('UI Elements', () => {
    it('should display Saveero branding', () => {
      render(<Login />)
      expect(screen.getByText('Saveero')).toBeInTheDocument()
      expect(screen.getByText('Your home decision platform')).toBeInTheDocument()
    })

    it('should display dark theme classes', () => {
      const { container } = render(<Login />)
      const mainDiv = container.firstChild as HTMLElement
      expect(mainDiv).toHaveClass('bg-slate-950')
    })

    it('should toggle between sign-in and sign-up text', async () => {
      const user = userEvent.setup()
      render(<Login />)

      expect(screen.getByText("Don't have an account?")).toBeInTheDocument()

      await user.click(screen.getByText('Sign up'))

      expect(screen.getByText('Already have an account?')).toBeInTheDocument()
    })
  })

  describe('Error Message Display', () => {
    it('should display error in red alert box', async () => {
      const user = userEvent.setup()
      vi.mocked(authModule.signIn).mockResolvedValue({
        data: {},
        error: { message: 'Network error' },
      })

      render(<Login />)

      await user.type(screen.getByPlaceholderText('you@example.com'), 'user@example.com')
      await user.type(screen.getByPlaceholderText('••••••••'), 'password123')
      await user.click(screen.getByDisplayValue('Sign in'))

      await waitFor(() => {
        const errorAlert = screen.getByText('Network error')
        expect(errorAlert).toHaveClass('bg-red-900/40')
      })
    })

    it('should display info message in green alert box', async () => {
      const user = userEvent.setup()
      vi.mocked(authModule.signUp).mockResolvedValue({ data: {}, error: null })

      render(<Login />)
      await user.click(screen.getByText('Sign up'))

      await user.type(screen.getByPlaceholderText('you@example.com'), 'new@example.com')
      await user.type(screen.getByPlaceholderText('••••••••'), 'password123')
      await user.click(screen.getByDisplayValue('Create account'))

      await waitFor(() => {
        const infoAlert = screen.getByText(/Check your email/)
        expect(infoAlert).toHaveClass('bg-emerald-900/40')
      })
    })

    it('should clear previous error when retrying', async () => {
      const user = userEvent.setup()
      vi.mocked(authModule.signIn)
        .mockResolvedValueOnce({
          data: {},
          error: { message: 'Invalid credentials' },
        })
        .mockResolvedValueOnce({ data: {}, error: null })

      render(<Login />)

      // First attempt fails
      await user.type(screen.getByPlaceholderText('you@example.com'), 'user@example.com')
      await user.type(screen.getByPlaceholderText('••••••••'), 'wrongpass')
      await user.click(screen.getByDisplayValue('Sign in'))

      await waitFor(() => {
        expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
      })

      // Clear inputs and try again
      const emailInput = screen.getByPlaceholderText('you@example.com') as HTMLInputElement
      const passwordInput = screen.getByPlaceholderText('••••••••') as HTMLInputElement

      await user.clear(emailInput)
      await user.clear(passwordInput)

      await user.type(emailInput, 'user@example.com')
      await user.type(passwordInput, 'correctpass')
      await user.click(screen.getByDisplayValue('Sign in'))

      await waitFor(() => {
        expect(screen.queryByText('Invalid credentials')).not.toBeInTheDocument()
      })
    })
  })
})
