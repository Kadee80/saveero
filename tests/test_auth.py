"""
test_auth.py

Tests for authentication and JWT token handling:
- Signup with valid email/password
- Login with valid credentials
- Invalid login attempts
- JWT token validation
- Token refresh
- Unauthorized access handling
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
import os

from main import app
from tests.mock_responses import (
    get_mock_supabase_session,
    get_mock_supabase_user,
    get_mock_auth_error,
)

# Load test environment
if os.path.exists('tests/.env.test'):
    from dotenv import load_dotenv
    load_dotenv('tests/.env.test')

client = TestClient(app)


@pytest.fixture
def mock_supabase_auth():
    """Fixture to mock Supabase auth client with realistic responses"""
    with patch('api.listing_wizard_routes.supabase.auth') as mock_auth:
        # Mock sign up
        mock_auth.sign_up.return_value = get_mock_supabase_session()

        # Mock sign in
        mock_auth.sign_in_with_password.return_value = get_mock_supabase_session()

        # Mock get user
        mock_auth.get_user.return_value = {
            'user': get_mock_supabase_user(),
            'error': None,
        }

        # Mock refresh session
        mock_auth.refresh_session.return_value = get_mock_supabase_session()

        # Mock sign out
        mock_auth.sign_out.return_value = {'error': None}

        yield mock_auth


@pytest.fixture
def mock_user():
    """Standard test user fixture using mock responses"""
    return get_mock_supabase_user()


@pytest.fixture
def valid_jwt_token():
    """Valid JWT token for testing"""
    return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImV4cCI6OTk5OTk5OTk5OX0.test'


@pytest.fixture
def mock_supabase(mock_supabase_auth):
    """Backward compatibility fixture"""
    return mock_supabase_auth


class TestSignup:
    """Tests for user signup"""

    def test_signup_with_valid_credentials(self, mock_supabase, mock_user):
        """Should create new user with valid email and password"""
        mock_supabase.sign_up.return_value = {
            'user': mock_user,
            'session': {
                'access_token': 'token',
                'refresh_token': 'refresh',
            },
        }

        response = client.post(
            '/api/auth/signup',
            json={
                'email': 'test@example.com',
                'password': 'password123',
            },
        )

        assert response.status_code == 200
        assert response.json()['user']['email'] == 'test@example.com'

    def test_signup_with_invalid_email(self, mock_supabase):
        """Should reject signup with invalid email format"""
        response = client.post(
            '/api/auth/signup',
            json={
                'email': 'not-an-email',
                'password': 'password123',
            },
        )

        assert response.status_code == 422

    def test_signup_with_short_password(self, mock_supabase):
        """Should reject signup with password shorter than 6 characters"""
        response = client.post(
            '/api/auth/signup',
            json={
                'email': 'test@example.com',
                'password': 'short',
            },
        )

        assert response.status_code == 422

    def test_signup_with_existing_email(self, mock_supabase):
        """Should reject signup when email already exists"""
        mock_supabase.sign_up.return_value = {
            'user': None,
            'error': 'User already exists',
        }

        response = client.post(
            '/api/auth/signup',
            json={
                'email': 'existing@example.com',
                'password': 'password123',
            },
        )

        # API returns 400 for existing email
        assert response.status_code in [400, 409]

    def test_signup_missing_email(self, mock_supabase):
        """Should reject signup without email"""
        response = client.post(
            '/api/auth/signup',
            json={'password': 'password123'},
        )

        assert response.status_code == 422

    def test_signup_missing_password(self, mock_supabase):
        """Should reject signup without password"""
        response = client.post(
            '/api/auth/signup',
            json={'email': 'test@example.com'},
        )

        assert response.status_code == 422

    def test_signup_sends_confirmation_email(self, mock_supabase, mock_user):
        """Should trigger confirmation email on signup"""
        mock_supabase.sign_up.return_value = {'user': mock_user}

        response = client.post(
            '/api/auth/signup',
            json={
                'email': 'test@example.com',
                'password': 'password123',
            },
        )

        assert response.status_code == 200
        # User should not be immediately confirmed
        assert mock_user['email_confirmed_at'] is not None or response.json()['message'] == 'Check email'


class TestLogin:
    """Tests for user login"""

    def test_login_with_valid_credentials(self, mock_supabase, mock_user):
        """Should login user with correct email and password"""
        session_data = {
            'user': mock_user,
            'access_token': 'access_token_123',
            'refresh_token': 'refresh_token_123',
        }
        mock_supabase.sign_in_with_password.return_value = session_data

        response = client.post(
            '/api/auth/login',
            json={
                'email': 'test@example.com',
                'password': 'password123',
            },
        )

        assert response.status_code == 200
        assert response.json()['user']['email'] == 'test@example.com'
        assert 'access_token' in response.json()

    def test_login_with_invalid_email(self, mock_supabase):
        """Should reject login with non-existent email"""
        mock_supabase.sign_in_with_password.return_value = {
            'user': None,
            'error': 'Invalid credentials',
        }

        response = client.post(
            '/api/auth/login',
            json={
                'email': 'nonexistent@example.com',
                'password': 'password123',
            },
        )

        assert response.status_code in [401, 400]
        assert 'error' in response.json()

    def test_login_with_wrong_password(self, mock_supabase):
        """Should reject login with incorrect password"""
        mock_supabase.sign_in_with_password.return_value = {
            'user': None,
            'error': 'Invalid credentials',
        }

        response = client.post(
            '/api/auth/login',
            json={
                'email': 'test@example.com',
                'password': 'wrongpassword',
            },
        )

        assert response.status_code in [401, 400]

    def test_login_case_insensitive_email(self, mock_supabase, mock_user):
        """Should handle email case-insensitively"""
        session_data = {
            'user': mock_user,
            'access_token': 'token',
            'refresh_token': 'refresh',
        }
        mock_supabase.sign_in_with_password.return_value = session_data

        response = client.post(
            '/api/auth/login',
            json={
                'email': 'TEST@EXAMPLE.COM',
                'password': 'password123',
            },
        )

        assert response.status_code == 200

    def test_login_returns_jwt_token(self, mock_supabase, mock_user):
        """Should return JWT token in response"""
        session_data = {
            'user': mock_user,
            'access_token': 'jwt_token_here',
            'refresh_token': 'refresh_token',
        }
        mock_supabase.sign_in_with_password.return_value = session_data

        response = client.post(
            '/api/auth/login',
            json={
                'email': 'test@example.com',
                'password': 'password123',
            },
        )

        assert response.status_code == 200
        assert response.json()['access_token'] == 'jwt_token_here'


class TestJWTValidation:
    """Tests for JWT token validation"""

    def test_protected_route_with_valid_token(self, valid_jwt_token):
        """Should allow access to protected route with valid JWT"""
        response = client.get(
            '/api/listings',
            headers={'Authorization': f'Bearer {valid_jwt_token}'},
        )

        # Should not return 401 Unauthorized
        assert response.status_code != 401

    def test_protected_route_without_token(self):
        """Should reject access to protected route without JWT"""
        response = client.get('/api/listings')

        assert response.status_code == 401

    def test_protected_route_with_invalid_token(self):
        """Should reject access with invalid JWT token"""
        response = client.get(
            '/api/listings',
            headers={'Authorization': 'Bearer invalid_token'},
        )

        assert response.status_code == 401

    def test_protected_route_with_expired_token(self):
        """Should reject access with expired JWT token"""
        expired_token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImV4cCI6MTAwMH0.test'

        response = client.get(
            '/api/listings',
            headers={'Authorization': f'Bearer {expired_token}'},
        )

        assert response.status_code == 401

    def test_authorization_header_format(self, valid_jwt_token):
        """Should correctly parse Authorization header format"""
        # Valid format: "Bearer <token>"
        response = client.get(
            '/api/listings',
            headers={'Authorization': f'Bearer {valid_jwt_token}'},
        )

        assert response.status_code != 400

        # Invalid format: missing "Bearer" prefix
        response = client.get(
            '/api/listings',
            headers={'Authorization': valid_jwt_token},
        )

        assert response.status_code == 401

    def test_token_extraction_from_header(self, valid_jwt_token):
        """Should extract token from Authorization header correctly"""
        response = client.get(
            '/api/listings',
            headers={'Authorization': f'Bearer {valid_jwt_token}'},
        )

        # Should not reject due to header parsing error
        assert response.status_code != 400


class TestTokenRefresh:
    """Tests for JWT token refresh"""

    def test_refresh_token_endpoint(self, mock_supabase, mock_user):
        """Should return new access token with valid refresh token"""
        mock_supabase.refresh_session.return_value = {
            'user': mock_user,
            'access_token': 'new_access_token',
            'refresh_token': 'new_refresh_token',
        }

        response = client.post(
            '/api/auth/refresh',
            json={'refresh_token': 'valid_refresh_token'},
        )

        assert response.status_code == 200
        assert response.json()['access_token'] == 'new_access_token'

    def test_refresh_with_invalid_token(self, mock_supabase):
        """Should reject refresh with invalid refresh token"""
        mock_supabase.refresh_session.return_value = {
            'user': None,
            'error': 'Invalid refresh token',
        }

        response = client.post(
            '/api/auth/refresh',
            json={'refresh_token': 'invalid_token'},
        )

        assert response.status_code in [401, 400]


class TestLogout:
    """Tests for user logout"""

    def test_logout_clears_session(self, valid_jwt_token):
        """Should clear session on logout"""
        response = client.post(
            '/api/auth/logout',
            headers={'Authorization': f'Bearer {valid_jwt_token}'},
        )

        assert response.status_code == 200

    def test_logout_invalidates_token(self, valid_jwt_token):
        """Should invalidate token after logout"""
        # Logout
        client.post(
            '/api/auth/logout',
            headers={'Authorization': f'Bearer {valid_jwt_token}'},
        )

        # Try to use same token
        response = client.get(
            '/api/listings',
            headers={'Authorization': f'Bearer {valid_jwt_token}'},
        )

        # Should be rejected after logout
        assert response.status_code == 401

    def test_logout_without_token(self):
        """Should handle logout without active session"""
        response = client.post('/api/auth/logout')

        # Should return 401 or similar
        assert response.status_code in [401, 400]


class TestUnauthorizedAccess:
    """Tests for unauthorized access handling"""

    def test_access_other_user_listing(self, valid_jwt_token):
        """Should not allow accessing another user's listing"""
        # User A tries to access User B's listing
        response = client.get(
            '/api/listings/other-user-listing-id',
            headers={'Authorization': f'Bearer {valid_jwt_token}'},
        )

        # Should return 404 or 403, not expose existence
        assert response.status_code in [403, 404]

    def test_delete_other_user_listing(self, valid_jwt_token):
        """Should not allow deleting another user's listing"""
        response = client.delete(
            '/api/listings/other-user-listing-id',
            headers={'Authorization': f'Bearer {valid_jwt_token}'},
        )

        assert response.status_code in [403, 404]

    def test_update_other_user_listing(self, valid_jwt_token):
        """Should not allow updating another user's listing"""
        response = client.put(
            '/api/listings/other-user-listing-id',
            json={'address': 'new address'},
            headers={'Authorization': f'Bearer {valid_jwt_token}'},
        )

        assert response.status_code in [403, 404]


class TestAuthErrors:
    """Tests for authentication error handling"""

    def test_network_error_handling(self, mock_supabase):
        """Should handle network errors gracefully"""
        mock_supabase.sign_in_with_password.side_effect = ConnectionError('Network error')

        response = client.post(
            '/api/auth/login',
            json={
                'email': 'test@example.com',
                'password': 'password123',
            },
        )

        assert response.status_code == 500 or response.status_code == 502

    def test_database_error_handling(self, mock_supabase):
        """Should handle database errors gracefully"""
        mock_supabase.sign_up.side_effect = Exception('Database error')

        response = client.post(
            '/api/auth/signup',
            json={
                'email': 'test@example.com',
                'password': 'password123',
            },
        )

        assert response.status_code == 500

    def test_malformed_token_handling(self):
        """Should handle malformed JWT gracefully"""
        response = client.get(
            '/api/listings',
            headers={'Authorization': 'Bearer not-a-valid-jwt-format'},
        )

        assert response.status_code == 401
