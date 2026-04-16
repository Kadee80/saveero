# Saveero Test Infrastructure - Quick Reference

This file provides quick links and guidance for the newly implemented test infrastructure.

## Quick Start

### Run Tests Locally
```bash
# Frontend tests
cd webapp
npm test

# Backend tests (from root)
pytest tests/ -v
```

### Run Before Pushing Code
```bash
npm test --prefix webapp -- --run && pytest tests/ -v
```

## Documentation Files

### 1. **TESTING_QUICK_START.md** - START HERE
The primary guide for developers. Contains:
- How to run tests locally (frontend & backend)
- Debugging strategies and common issues
- How to add new tests (with templates)
- CI/CD workflow overview
- Mocking strategy explanation

**Best for**: Developers who are new to the test setup or need reference material

### 2. **TEST_INFRASTRUCTURE_SETUP.md**
Complete infrastructure overview. Contains:
- Description of all files created/modified
- Test coverage summary
- Environment variables reference
- Quality metrics
- Architecture decisions

**Best for**: Understanding the overall design and making changes to test infrastructure

### 3. **IMPLEMENTATION_CHECKLIST.md**
Comprehensive checklist of all deliverables. Contains:
- Part-by-part verification
- Success criteria confirmation
- Files created and modified
- Summary of test cases
- Next steps for team

**Best for**: Confirming implementation is complete and understanding scope

## Key Files

### Backend Test Infrastructure
- `/tests/conftest.py` - Pytest fixtures and configuration
- `/tests/mock_responses.py` - Reusable mock API responses
- `/tests/.env.test` - Test environment variables
- `/tests/test_auth.py` - Authentication tests
- `/tests/test_listing_routes.py` - Listing API tests

### Frontend Test Infrastructure
- `/webapp/src/__tests__/setup.ts` - Global test configuration
- `/webapp/src/__tests__/pages/Dashboard.test.tsx` - Component tests

### CI/CD Configuration
- `/.github/workflows/tests.yml` - Automated test execution
- `/.github/workflows/deploy.yml` - Deployment with test verification

## Common Tasks

### Adding a New Backend Test
1. Read: `TESTING_QUICK_START.md` > "Adding Backend Tests" section
2. Follow the template provided
3. Use mock data from `tests/mock_responses.py`
4. Run: `pytest tests/test_yourfile.py -v`

### Adding a New Frontend Test
1. Read: `TESTING_QUICK_START.md` > "Adding Frontend Tests" section
2. Follow the template provided
3. Mock APIs using `vi.mock()`
4. Run: `npm test -- src/__tests__/your.test.tsx`

### Debugging a Test Failure
1. Read: `TESTING_QUICK_START.md` > "Debugging Test Failures" section
2. Run with verbose output: `pytest tests/ -vv` or `npm test -- --reporter=verbose`
3. Check common issues table
4. Use debug utilities provided

### Checking Test Coverage
```bash
# Frontend coverage
npm run test:coverage --prefix webapp

# Backend coverage
pytest tests/ --cov --cov-report=html
open htmlcov/index.html
```

## Testing Principles

1. **Mock Everything External**
   - All API calls are mocked (Supabase, OpenRouter, FRED)
   - No real network calls during tests
   - Fast, deterministic test execution

2. **Async Handling**
   - All `waitFor()` calls have `{ timeout: 3000 }`
   - Proper Promise handling in tests
   - No race conditions

3. **Reusable Test Data**
   - Use `mock_responses.py` for test data
   - Consistent mocks across tests
   - Easy to update

4. **Test Organization**
   - Backend: pytest with fixtures
   - Frontend: Vitest with mocks
   - Clear test names and descriptions

## CI/CD Workflow

### Automatic Testing
- Tests run on every push to main/develop
- Tests run on all pull requests
- Results visible in GitHub Actions
- PR comments show test status

### Pre-Deployment
- All tests must pass before deployment
- Coverage reports generated
- Build artifacts created
- Manual approval required for production

## Troubleshooting Quick Links

| Issue | Solution |
|-------|----------|
| `waitFor()` timeout | See TESTING_QUICK_START.md > "Frontend Test Debugging" |
| Mock not working | Check if patch path matches import, ensure mock set before render |
| Fixture not found | Verify import in conftest.py, check spelling |
| YAML validation error | Run through online YAML validator |
| Test passes locally but fails in CI | Check environment variables, async handling |

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Pytest Documentation](https://docs.pytest.org/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)

## Getting Help

1. **Quick Questions**: Check TESTING_QUICK_START.md first
2. **Architecture Questions**: See TEST_INFRASTRUCTURE_SETUP.md
3. **Missing Something?**: Review IMPLEMENTATION_CHECKLIST.md
4. **Need Examples?**: Both quick start and infrastructure docs have code examples

## Test Coverage Goals

- **Backend**: 80%+ coverage for auth and API routes
- **Frontend**: 75%+ coverage for critical components
- **Overall**: Maintain or improve coverage on each PR

## Performance Targets

- Frontend tests: < 1 second
- Backend tests: < 2 seconds
- Full CI/CD pipeline: < 5 minutes

---

**Last Updated**: April 2026
**Status**: All systems operational and ready to use
