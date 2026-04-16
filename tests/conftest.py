"""
conftest.py

Pytest configuration and shared fixtures for all backend tests.
Provides common setup, mocks, and test data used across test files.
"""

import os
import pytest
from unittest.mock import MagicMock, patch
from typing import Dict, Any

# Configure test environment
os.environ['TESTING'] = 'true'


@pytest.fixture
def mock_supabase():
    """
    Mock Supabase client for testing.
    Provides mocked auth, database, and storage operations.
    """
    with patch('core.config.supabase') as mock:
        # Mock auth client
        mock.auth = MagicMock()
        mock.auth.sign_up.return_value = {
            'user': {'id': 'user-123', 'email': 'test@example.com'},
            'error': None,
        }
        mock.auth.sign_in_with_password.return_value = {
            'user': {'id': 'user-123', 'email': 'test@example.com'},
            'session': {
                'access_token': 'mock_token_123',
                'refresh_token': 'mock_refresh_123',
            },
            'error': None,
        }
        mock.auth.sign_out.return_value = {'error': None}
        mock.auth.get_user.return_value = {
            'user': {'id': 'user-123', 'email': 'test@example.com'},
            'error': None,
        }

        # Mock database client
        mock.table = MagicMock()

        yield mock


@pytest.fixture
def test_user() -> Dict[str, Any]:
    """
    Standard test user fixture.
    Returns a user dict matching Supabase user schema.
    """
    return {
        'id': 'user-123',
        'email': 'test@example.com',
        'email_confirmed_at': '2024-01-01T00:00:00',
        'user_metadata': {
            'full_name': 'Test User',
        },
        'aud': 'authenticated',
        'created_at': '2024-01-01T00:00:00',
    }


@pytest.fixture
def valid_jwt_token() -> str:
    """
    Valid JWT token for testing.
    Doesn't need to be cryptographically valid, just properly formatted.
    """
    return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSIsImV4cCI6OTk5OTk5OTk5OX0.test_signature'


@pytest.fixture
def expired_jwt_token() -> str:
    """Expired JWT token for testing token refresh/expiry scenarios."""
    return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImV4cCI6MTAwMH0.test'


@pytest.fixture
def auth_headers(valid_jwt_token: str) -> Dict[str, str]:
    """
    Standard Authorization headers with valid JWT token.
    Used in most API tests that require authentication.
    """
    return {'Authorization': f'Bearer {valid_jwt_token}'}


@pytest.fixture
def mock_listing_response() -> Dict[str, Any]:
    """
    Sample generated listing response matching API schema.
    Used in listing generation tests.
    """
    return {
        'title': '3BR/2BA Home in Great Location',
        'address': '123 Main St, Anytown, CA 12345',
        'address_line1': '123 Main St',
        'address_line2': '',
        'city': 'Anytown',
        'region': 'CA',
        'zip_code': '12345',
        'country': 'USA',
        'price_range': '$450K - $550K',
        'recommended_price': 500000,
        'property_type': 'Single Family Home',
        'square_feet': 2500,
        'living_area': 2500,
        'living_area_unit': 'sqft',
        'lot_size_value': 0.5,
        'lot_size_unit': 'acres',
        'parking_total': 2,
        'parking_covered': 0,
        'parking_open': 2,
        'parking_garage': 2,
        'parking_carport': 0,
        'parking_other': 0,
        'parking_other_description': '',
        'heating_type': ['forced air'],
        'cooling_type': ['central ac'],
        'water_type': ['municipal'],
        'sewer_type': ['municipal'],
        'foundation_type': ['concrete slab'],
        'roof_type': ['asphalt shingles'],
        'exterior_material': ['vinyl siding'],
        'interior_material': ['drywall'],
        'flooring_type': ['hardwood', 'carpet'],
        'bedrooms': 3,
        'bathrooms': 2,
        'bathrooms_full': 2,
        'bathrooms_half': 0,
        'year_built': 1995,
        'features': [
            {
                'feature_type': 'garage',
                'count': 2,
                'description': 'Two-car detached garage',
                'features': ['detached', 'opener'],
                'square_feet': 400,
            },
            {
                'feature_type': 'patio',
                'description': 'Large back patio',
                'features': ['covered', 'concrete'],
            },
        ],
        'amenities': [
            'hardwood floors',
            'updated kitchen',
            'fireplace',
            'large yard',
        ],
        'highlights': [
            'Great curb appeal',
            'Spacious lot',
            'Quiet neighborhood',
            'Move-in ready',
        ],
        'neighborhood_info': 'Established residential community with parks and schools nearby',
        'description': 'Beautiful 3-bedroom home in a desirable neighborhood with recent updates including new kitchen appliances and flooring. Large lot with mature trees provides great privacy.',
        'location_features': ['Near schools', 'Walking distance to shops'],
        'similar_properties': [
            {
                'address': '124 Main St',
                'price': 495000,
                'bedrooms': 3,
                'bathrooms': 2,
                'property_type': 'Single Family Home',
                'description': 'Similar home in neighborhood',
                'square_feet': 2450,
            },
            {
                'address': '120 Main St',
                'price': 510000,
                'bedrooms': 3,
                'bathrooms': 2,
                'property_type': 'Single Family Home',
                'description': 'Renovated home with pool',
                'square_feet': 2600,
            },
        ],
        'latitude': 40.7128,
        'longitude': -74.0060,
        'image_descriptions': [
            'Front exterior with landscaping',
            'Living room with hardwood floors',
        ],
    }


@pytest.fixture
def mock_saved_listing() -> Dict[str, Any]:
    """
    Sample saved listing from database.
    Lighter version of generated listing with database-specific fields.
    """
    return {
        'id': 'listing-123',
        'user_id': 'user-123',
        'address': '123 Main St, Anytown, CA 12345',
        'headline': '3BR/2BA Home',
        'description_ai': 'Beautiful home in desirable neighborhood',
        'status': 'draft',
        'beds': 3,
        'baths': 2,
        'sqft': 2500,
        'price_min_suggested': 475000,
        'price_mid': 500000,
        'price_max_suggested': 525000,
        'created_at': '2024-01-15T10:30:00',
        'updated_at': '2024-01-15T10:30:00',
    }


@pytest.fixture
def mock_user_listings() -> list:
    """
    Sample list of user's saved listings.
    Used in listing list/fetch tests.
    """
    return [
        {
            'id': 'listing-1',
            'address': '123 Main St, Anytown, CA 12345',
            'headline': '3BR/2BA Home',
            'status': 'draft',
            'beds': 3,
            'baths': 2,
            'sqft': 2500,
            'price_mid': 500000,
            'created_at': '2024-01-15T10:30:00',
        },
        {
            'id': 'listing-2',
            'address': '456 Oak Ave, Springfield, IL 62701',
            'headline': '4BR/3BA Modern Farmhouse',
            'status': 'published',
            'beds': 4,
            'baths': 3,
            'sqft': 3200,
            'price_mid': 350000,
            'created_at': '2024-01-14T09:15:00',
        },
        {
            'id': 'listing-3',
            'address': '789 Elm St, Portland, OR 97214',
            'headline': '2BR/1BA Cozy Bungalow',
            'status': 'active',
            'beds': 2,
            'baths': 1,
            'sqft': 1200,
            'price_mid': 275000,
            'created_at': '2024-01-10T14:45:00',
        },
    ]


@pytest.fixture
def mock_openai_response() -> Dict[str, Any]:
    """
    Mock OpenAI API response for image analysis.
    Used in listing generation tests.
    """
    return {
        'choices': [
            {
                'message': {
                    'content': '''{
                        "property_type": "Single Family Home",
                        "bedrooms": 3,
                        "bathrooms": 2,
                        "estimated_sqft": 2500,
                        "year_built_estimate": 1995,
                        "description": "Well-maintained home with natural light",
                        "highlights": ["Spacious rooms", "Updated finishes"]
                    }'''
                }
            }
        ]
    }


# Markers for test categorization

def pytest_configure(config):
    """Register custom pytest markers."""
    config.addinivalue_line(
        'markers', 'integration: Integration tests that require external services'
    )
    config.addinivalue_line(
        'markers', 'slow: Tests that take more than 1 second to run'
    )
    config.addinivalue_line(
        'markers', 'auth: Authentication-related tests'
    )
    config.addinivalue_line(
        'markers', 'listing: Listing-related tests'
    )


# Pytest hooks

@pytest.hookimpl(tryfirst=True)
def pytest_runtest_makereport(item, call):
    """Customize test reporting."""
    pass
