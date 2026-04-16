# Testing Quick Start Guide

This guide covers how to run, debug, and add tests for the Saveero project.

## Table of Contents

1. [Running Tests Locally](#running-tests-locally)
2. [Frontend Tests](#frontend-tests)
3. [Backend Tests](#backend-tests)
4. [Debugging Test Failures](#debugging-test-failures)
5. [Adding New Tests](#adding-new-tests)
6. [CI/CD Workflow](#cicd-workflow)
7. [Mocking Strategy](#mocking-strategy)

## Running Tests Locally

### Prerequisites

- Node.js 18+ (for frontend)
- Python 3.11+ (for backend)
- PostgreSQL 15+ (optional, for integration tests)

### Quick Start - Both Frontend & Backend

```bash
# Install all dependencies
npm ci                    # frontend
pip install -r requirements.txt  # backend

# Run all tests
npm test --prefix webapp  # frontend
pytest tests/ -v          # backend
```

## Frontend Tests

### Setup

```bash
cd webapp
npm ci
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (re-run on file changes)
npm test -- --watch

# Run tests with UI
npm test:ui

# Run tests with coverage
npm test:coverage

# Run specific test file
npm test -- src/__tests__/pages/Dashboard.test.tsx

# Run tests matching a pattern
npm test -- --grep "Dashboard"
```

### Configuration

Frontend tests use **Vitest** configured in `webapp/vitest.config.ts`:
- Test files: `src/__tests__/**/*.test.tsx`
- Setup file: `src/__tests__/setup.ts`
- jsdom for DOM simulation
- React Testing Library for component testing

### Test Structure

```
webapp/src/__tests__/
├── setup.ts                    # Global test setup & mocks
├── pages/
│   ├── Dashboard.test.tsx     # Dashboard component tests
│   └── Login.test.tsx         # Login component tests
└── utils/
    └── helpers.test.ts        # Utility function tests
```

### Frontend Test Examples

```typescript
// Basic component test with mocking
describe('Dashboard Component', () => {
  it('should load and display listings', async () => {
    // Mock the API
    vi.mocked(listingApi.list).mockResolvedValue([
      { id: '1', address: '123 Main St', ... }
    ])

    // Render component
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    // Wait for async operations with timeout
    await waitFor(
      () => {
        expect(screen.getByText('123 Main St')).toBeInTheDocument()
      },
      { timeout: 3000 }
    )
  })
})
```

**Key Points:**
- Use `waitFor()` with `{ timeout: 3000 }` for async operations
- Mock all external API calls with `vi.mock()`
- Use `@testing-library/react` for user-focused assertions
- Test behavior, not implementation details

## Backend Tests

### Setup

```bash
pip install -r requirements.txt pytest pytest-cov pytest-asyncio
```

### Running Tests

```bash
# Run all tests
pytest tests/ -v

# Run with coverage report
pytest tests/ -v --cov --cov-report=html

# Run specific test file
pytest tests/test_auth.py -v

# Run specific test class
pytest tests/test_auth.py::TestSignup -v

# Run with markers (slow, integration, etc)
pytest -m "not integration"  # Skip integration tests
pytest -m "auth"             # Run only auth tests

# Run with detailed output
pytest tests/ -vv -s  # -s shows print statements
```

### Configuration

Backend tests use **pytest** with fixtures in `tests/conftest.py`:
- Fixtures: `mock_supabase_client`, `mock_openrouter_api`, `test_user`, `valid_jwt_token`
- Mock responses in `tests/mock_responses.py`
- Environment: `tests/.env.test`

### Test Structure

```
tests/
├── conftest.py              # Shared fixtures and config
├── mock_responses.py        # Mock API responses
├── .env.test               # Test environment variables
├── test_auth.py            # Authentication tests
└── test_listing_routes.py  # Listing API tests
```

### Backend Test Examples

```python
def test_login_with_valid_credentials(mock_supabase_auth, mock_user):
    """Should login user with correct email and password"""
    # Setup mock to return user session
    mock_supabase_auth.sign_in_with_password.return_value = {
        'user': mock_user,
        'session': {
            'access_token': 'token_123',
            'refresh_token': 'refresh_123',
        },
        'error': None,
    }

    # Make API call
    response = client.post(
        '/api/auth/login',
        json={
            'email': 'test@example.com',
            'password': 'password123',
        },
    )

    # Assert response
    assert response.status_code == 200
    assert response.json()['user']['email'] == 'test@example.com'
```

**Key Points:**
- All external services are mocked (Supabase, OpenRouter, FRED)
- Use fixtures from `conftest.py` for common setup
- Tests run against mocked APIs, no real external calls
- Use `TestClient` from FastAPI for API testing

## Debugging Test Failures

### Frontend Test Debugging

```bash
# 1. Run test in watch mode to see changes instantly
npm test -- --watch src/__tests__/pages/Dashboard.test.tsx

# 2. Use screen.debug() to print DOM
it('should display content', async () => {
  render(<Dashboard />)
  screen.debug()  // Prints entire DOM
})

# 3. Increase timeout for slow tests
await waitFor(
  () => {
    expect(screen.getByText('Text')).toBeInTheDocument()
  },
  { timeout: 5000 }  // Increased from 3000
)

# 4. Check mock setup
console.log(vi.mocked(listingApi.list).mock.calls)

# 5. Use Vitest UI for visual debugging
npm test:ui
```

### Backend Test Debugging

```bash
# 1. Run single test with verbose output
pytest tests/test_auth.py::TestLogin::test_login_with_valid_credentials -vv

# 2. Show print statements
pytest tests/ -s

# 3. Drop into debugger
import pdb; pdb.set_trace()  # Add in test code

# 4. Check mock calls
mock_supabase_auth.sign_in_with_password.assert_called_once()
print(mock_supabase_auth.sign_in_with_password.call_args)

# 5. Test specific marker
pytest -m "slow" -v  # Run slow tests only
```

### Common Issues

**Frontend Issues:**

| Issue | Solution |
|-------|----------|
| `waitFor()` timeout | Increase timeout to 5000ms, check mock setup |
| `screen.getByText()` not found | Use `screen.getByText(/regex/)` or check if component renders |
| Mock not working | Ensure mock is set BEFORE rendering, use `vi.mocked()` |
| Async tests failing | Add `async` to test function, use `await waitFor()` |

**Backend Issues:**

| Issue | Solution |
|-------|----------|
| Fixture not found | Check import in conftest.py, ensure spelling matches |
| Mock not being used | Patch path must match import in tested code |
| Test hangs | Add timeout: `pytest tests/ --timeout=10` |
| Database errors | Use mocks, don't use real database |

## Adding New Tests

### Adding Frontend Tests

```typescript
// 1. Create test file: src/__tests__/pages/NewPage.test.tsx

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import NewPage from '@/pages/NewPage'
import * as api from '@/api/myApi'

// Mock the API
vi.mock('@/api/myApi', () => ({
  myApi: {
    fetch: vi.fn(),
  },
}))

describe('NewPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should display content from API', async () => {
    // Setup mock
    vi.mocked(api.myApi.fetch).mockResolvedValue({ data: 'test' })

    // Render component
    render(
      <BrowserRouter>
        <NewPage />
      </BrowserRouter>
    )

    // Assert async behavior
    await waitFor(
      () => {
        expect(screen.getByText('test')).toBeInTheDocument()
      },
      { timeout: 3000 }
    )
  })

  it('should handle errors', async () => {
    vi.mocked(api.myApi.fetch).mockRejectedValue(
      new Error('API error')
    )

    render(
      <BrowserRouter>
        <NewPage />
      </BrowserRouter>
    )

    await waitFor(
      () => {
        expect(screen.getByText(/error/i)).toBeInTheDocument()
      },
      { timeout: 3000 }
    )
  })
})
```

### Adding Backend Tests

```python
# 1. Add to tests/test_feature.py

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch
from main import app
from tests.mock_responses import get_mock_response

client = TestClient(app)

class TestNewFeature:
    """Tests for new feature"""

    def test_new_endpoint_with_valid_data(self, mock_supabase_client, valid_jwt_token):
        """Should handle valid request to new endpoint"""
        # Setup mocks
        mock_supabase_client.table('users').select.return_value = {
            'data': [{'id': 'user-123'}],
            'error': None,
        }

        # Make request
        response = client.post(
            '/api/new-endpoint',
            json={'param': 'value'},
            headers={'Authorization': f'Bearer {valid_jwt_token}'},
        )

        # Assert response
        assert response.status_code == 200
        assert response.json()['success'] is True

    def test_new_endpoint_without_auth(self):
        """Should require authentication"""
        response = client.post(
            '/api/new-endpoint',
            json={'param': 'value'},
        )

        assert response.status_code == 401
```

### Test Best Practices

**Frontend:**
- Mock all external API calls
- Use `waitFor()` with proper timeout
- Test user interactions, not implementation
- Use semantic queries: `getByText`, `getByRole`, `getByLabelText`
- Clear mocks between tests with `beforeEach`

**Backend:**
- Mock Supabase and all external services
- Use fixtures for common setup
- Test both success and error paths
- Verify auth is required for protected routes
- Use realistic mock data from `mock_responses.py`

## CI/CD Workflow

### GitHub Actions Pipeline

The project uses two main workflows:

#### 1. Tests Workflow (`.github/workflows/tests.yml`)

Runs on every push and pull request:
- **Frontend Tests**: Node 18, npm test, coverage upload
- **Backend Tests**: Python 3.11, pytest, PostgreSQL service
- **Coverage Reports**: Uploaded to Codecov
- **PR Comments**: Summary of test results

```bash
# Trigger locally (requires GitHub CLI)
gh workflow run tests.yml
```

#### 2. Deploy Workflow (`.github/workflows/deploy.yml`)

Runs only on main branch push:
- **Test Step**: Runs full test suite
- **Build Step**: Builds frontend and backend artifacts
- **Deploy Step**: Deploys to production (Railway + Vercel)
- **Notifications**: Posts deployment status to GitHub

```bash
# Check workflow status
gh run list --workflow=tests.yml
gh run view <run-id>
```

### Running Tests in CI

Tests in CI/CD environment:
- Use `tests/.env.test` for all environment variables
- No real external API calls (all mocked)
- Tests should be deterministic (no flaky tests)
- Coverage reports generated and uploaded
- PR comments show test status

### Local Testing Before Push

```bash
# Run all tests locally to avoid CI failures
./run-all-tests.sh

# Or manually:
npm test --prefix webapp -- --run
pytest tests/ -v

# Check coverage
npm run test:coverage --prefix webapp
pytest tests/ --cov --cov-report=html
```

## Mocking Strategy

### Why We Mock Everything

- **Speed**: Tests run instantly without external API calls
- **Reliability**: No network failures or rate limits
- **Isolation**: Tests don't affect real data
- **Cost**: No API charges during testing
- **Parallelization**: Tests can run in parallel

### Frontend Mocking

```typescript
// Mock API module
vi.mock('@/api/listingApi', () => ({
  listingApi: {
    list: vi.fn(),
    get: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  },
}))

// Mock router
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  }
})

// Setup responses
vi.mocked(listingApi.list).mockResolvedValue([...])
```

### Backend Mocking

```python
# Mock Supabase client
with patch('core.config.supabase') as mock_supabase:
    mock_supabase.auth.sign_in_with_password.return_value = {
        'user': get_mock_supabase_user(),
        'session': {...},
    }

# Mock external API
with patch('api.listing_wizard_routes.openrouter_api') as mock_api:
    mock_api.generate_listing.return_value = get_mock_openrouter_listing_response()
```

### Mock Data Files

```python
# tests/mock_responses.py contains reusable mock data:
- get_mock_openrouter_listing_response()
- get_mock_fred_mortgage_rates()
- get_mock_supabase_session()
- get_mock_user_listings()
```

Use these functions to ensure consistent mock data across tests.

## Troubleshooting

### Tests Pass Locally but Fail in CI

1. **Environment Variables**: Check `tests/.env.test` has all required vars
2. **Async Issues**: Ensure all waitFor() calls have proper timeout
3. **Mock Timing**: Mock must be set BEFORE component renders
4. **Cache Issues**: Delete `.pytest_cache` and `node_modules/.vitest`

### Flaky Tests

1. **Increase Timeout**: `{ timeout: 5000 }` instead of 3000
2. **Wait for Condition**: Use `waitFor()` instead of `setTimeout()`
3. **Mock Setup**: Ensure mocks are set before render
4. **Async Cleanup**: Use `afterEach()` to clear mocks

### Coverage Not Generated

```bash
# Frontend coverage
npm run test:coverage -- --run

# Backend coverage
pytest tests/ --cov --cov-report=html

# View coverage
open htmlcov/index.html  # Backend
open webapp/coverage/index.html  # Frontend
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Pytest Documentation](https://docs.pytest.org/)
- [FastAPI Testing](https://fastapi.tiangolo.com/advanced/testing-events/)
- [Supabase Python Client](https://github.com/supabase-community/supabase-py)

## Getting Help

- Check existing test examples in `tests/` and `webapp/src/__tests__/`
- Review mock responses in `tests/mock_responses.py`
- Run tests with `-v` (verbose) or `-vv` (very verbose)
- Use `screen.debug()` in frontend tests to see DOM
- Check GitHub Actions logs for CI failures
