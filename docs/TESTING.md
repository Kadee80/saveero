# Saveero Testing Guide

This document explains the test structure, how to run tests locally, and best practices for adding new tests to saveero.

## Overview

Saveero has comprehensive test coverage for critical user workflows across frontend and backend:

### Frontend Tests (React/Vitest)
- **Location**: `webapp/src/__tests__/`
- **Technology**: Vitest + React Testing Library
- **Files**:
  - `pages/Login.test.tsx` - Authentication flows
  - `pages/Dashboard.test.tsx` - Listings dashboard
  - `api/auth.test.ts` - Auth API client
  - `lib/mortgage.test.ts` - Mortgage calculations

### Backend Tests (Python/pytest)
- **Location**: `tests/`
- **Technology**: pytest + FastAPI TestClient
- **Files**:
  - `test_auth.py` - Authentication and JWT
  - `test_listing_routes.py` - Listing API endpoints

## Running Tests

### Frontend Tests

**Prerequisites:**
```bash
cd webapp
npm install vitest @testing-library/react @testing-library/user-event -D
```

**Run all frontend tests:**
```bash
cd webapp
npm test
```

**Run specific test file:**
```bash
npm test Login.test.tsx
```

**Run tests in watch mode:**
```bash
npm test -- --watch
```

**Run tests with coverage:**
```bash
npm test -- --coverage
```

**Run tests in UI mode (Vitest UI):**
```bash
npm test -- --ui
```

### Backend Tests

**Prerequisites:**
```bash
pip install pytest pytest-cov
```

**Run all backend tests:**
```bash
pytest tests/ -v
```

**Run specific test file:**
```bash
pytest tests/test_auth.py -v
```

**Run specific test class:**
```bash
pytest tests/test_auth.py::TestLogin -v
```

**Run specific test:**
```bash
pytest tests/test_auth.py::TestLogin::test_login_with_valid_credentials -v
```

**Run tests with coverage:**
```bash
pytest tests/ --cov=api --cov=core --cov=listing_wizard --cov-report=html
```

**Run tests in parallel (faster):**
```bash
pip install pytest-xdist
pytest tests/ -n auto
```

## Test Structure

### Frontend (Vitest)

Each test file follows this structure:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

describe('Component Name', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should do something', async () => {
    // Arrange
    const user = userEvent.setup()
    
    // Act
    render(<Component />)
    await user.click(screen.getByText('Button'))
    
    // Assert
    expect(screen.getByText('Result')).toBeInTheDocument()
  })
})
```

**Key patterns:**
- Use `vi.mock()` for external dependencies
- Use `userEvent.setup()` for user interactions
- Use `waitFor()` for async operations
- Use `beforeEach()` to reset mocks between tests
- Follow Arrange-Act-Assert pattern

### Backend (pytest)

Each test file follows this structure:

```python
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

@pytest.fixture
def auth_headers():
    return {'Authorization': f'Bearer {valid_token}'}

class TestFeature:
    def test_happy_path(self, auth_headers):
        response = client.get('/api/endpoint', headers=auth_headers)
        assert response.status_code == 200
    
    def test_error_case(self):
        response = client.get('/api/endpoint')
        assert response.status_code == 401
```

**Key patterns:**
- Use `@pytest.fixture` for setup/teardown
- Use `TestClient` for HTTP testing
- Test both happy paths and error cases
- Use `mock.patch()` to mock external services
- Group tests in classes by feature

## Mocking Strategy

### Frontend Mocking

**Mock external APIs:**
```typescript
vi.mock('@/api/auth', () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}))

// In test:
vi.mocked(authModule.signIn).mockResolvedValue({
  data: { user: { email: 'test@example.com' } },
  error: null,
})
```

**Mock Supabase:**
```typescript
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      // ... other methods
    },
  }),
}))
```

**Mock React Router:**
```typescript
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  }
})
```

### Backend Mocking

**Mock Supabase:**
```python
from unittest.mock import patch, MagicMock

with patch('api.listing_wizard_routes.supabase.auth') as mock_auth:
    mock_auth.sign_up.return_value = {'user': {...}, 'error': None}
    # Test code
```

**Mock external services:**
```python
with patch('api.listing_wizard_routes.generate_listing') as mock_gen:
    mock_gen.return_value = {
        'title': '3BR/2BA',
        'address': '123 Main St',
        # ...
    }
    # Test code
```

## Test Data

### Sample User
```typescript
const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  email_confirmed_at: '2024-01-01T00:00:00',
}
```

### Sample Listing
```typescript
const mockListing = {
  id: 'listing-1',
  address: '123 Main St, Anytown, CA 12345',
  status: 'draft',
  price_mid: 500000,
  beds: 3,
  baths: 2,
  description_ai: 'Beautiful home',
  created_at: new Date().toISOString(),
}
```

### Sample JWT Token
```python
valid_jwt_token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImV4cCI6OTk5OTk5OTk5OX0.test'
```

## Coverage Goals

- **Critical paths**: >90% coverage required
- **API routes**: >85% coverage required
- **Utilities**: >80% coverage required
- **Overall**: >80% coverage target

**View coverage report:**

Frontend:
```bash
npm test -- --coverage
# Open coverage/index.html
```

Backend:
```bash
pytest --cov=api --cov=listing_wizard --cov-report=html
# Open htmlcov/index.html
```

## Adding New Tests

### For Frontend Components

1. Create test file in `webapp/src/__tests__/[path]/Component.test.tsx`
2. Import testing utilities:
   ```typescript
   import { describe, it, expect, beforeEach, vi } from 'vitest'
   import { render, screen, waitFor } from '@testing-library/react'
   ```
3. Write tests following the structure in existing test files
4. Mock external dependencies
5. Test happy paths, error cases, and edge cases
6. Run: `npm test Component.test.tsx`

### For Backend Routes

1. Create test file in `tests/test_feature.py`
2. Import test utilities:
   ```python
   import pytest
   from fastapi.testclient import TestClient
   from main import app
   ```
3. Create test class and methods
4. Use fixtures for common setup
5. Mock external services (Supabase, AI models, etc.)
6. Test valid requests and error cases
7. Run: `pytest tests/test_feature.py -v`

### Checklist for New Tests

- [ ] Tests cover happy path
- [ ] Tests cover error cases
- [ ] Tests cover edge cases
- [ ] External APIs/services are mocked
- [ ] Tests are isolated (no dependencies between tests)
- [ ] Tests clean up after themselves (beforeEach/afterEach)
- [ ] Test names clearly describe what they test
- [ ] Comments explain complex test setup
- [ ] Code follows existing patterns in test files

## Common Issues

### Issue: Tests timeout
**Solution**: Increase jest/vitest timeout or check for infinite loops
```typescript
it('long running test', async () => {
  // test code
}, 10000) // 10 second timeout
```

### Issue: Mock not being used
**Solution**: Ensure mock is created before importing the module
```typescript
vi.mock('@/api/auth')  // Must be before import
import { signIn } from '@/api/auth'
```

### Issue: Async test fails silently
**Solution**: Always await promises and use waitFor
```typescript
await user.click(button)  // await user events
await waitFor(() => {     // wait for async state updates
  expect(screen.getByText('Result')).toBeInTheDocument()
})
```

### Issue: Database tests leave data behind
**Solution**: Use transactions or mock the database
```python
with patch('db.insert_listing') as mock_insert:
    mock_insert.return_value = {'id': 'test-id'}
    # test code
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: cd webapp && npm install && npm test -- --coverage
      - uses: codecov/codecov-action@v2

  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-python@v2
        with:
          python-version: '3.10'
      - run: pip install -r requirements.txt pytest pytest-cov
      - run: pytest tests/ --cov
      - uses: codecov/codecov-action@v2
```

## Best Practices

1. **Test behavior, not implementation** - Focus on what the component/function does, not how
2. **Use realistic test data** - Use data shapes that match actual API responses
3. **Keep tests fast** - Mock external calls, use fast assertions
4. **Make tests independent** - Tests should not depend on execution order
5. **Clear test names** - Use descriptive names that explain what is being tested
6. **Avoid test interdependence** - Each test should be runnable in isolation
7. **Test edge cases** - Empty lists, null values, very large inputs
8. **Mock external services** - Don't make real API calls in tests
9. **Keep setup simple** - Use fixtures/beforeEach to reduce duplication
10. **Review coverage reports** - Identify untested code paths

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [pytest Documentation](https://docs.pytest.org/)
- [FastAPI Testing](https://fastapi.tiangolo.com/advanced/testing/)
- [Mocking with Vitest](https://vitest.dev/api/vi.html)
- [Mocking with pytest](https://docs.pytest.org/en/stable/how-to-use-fixtures.html)

## Support

For questions about testing:
1. Check existing test files for similar patterns
2. Review this documentation
3. Consult testing framework docs linked above
4. Ask in team Slack/Discord
