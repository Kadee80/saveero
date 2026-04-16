"""
mock_responses.py

Mock API responses for testing.
Provides realistic test data for external API calls (OpenRouter, FRED, Supabase).
"""

from datetime import datetime, timedelta
from typing import Dict, Any, List


# OpenRouter API Mock Responses

def get_mock_openrouter_listing_response() -> Dict[str, Any]:
    """
    Mock OpenRouter response for listing generation.
    Simulates AI-generated property listing.
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
        'price_min_suggested': 475000,
        'price_max_suggested': 525000,
        'property_type': 'Single Family Home',
        'square_feet': 2500,
        'living_area': 2500,
        'living_area_unit': 'sqft',
        'lot_size_value': 0.5,
        'lot_size_unit': 'acres',
        'bedrooms': 3,
        'bathrooms': 2,
        'bathrooms_full': 2,
        'bathrooms_half': 0,
        'year_built': 1995,
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
        'description': 'Beautiful 3-bedroom home in a desirable neighborhood with recent updates including new kitchen appliances and flooring. Large lot with mature trees provides great privacy.',
        'neighborhood_info': 'Established residential community with parks and schools nearby',
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


def get_mock_openrouter_error_response() -> Dict[str, Any]:
    """Mock error response from OpenRouter API"""
    return {
        'error': {
            'message': 'API rate limit exceeded',
            'type': 'rate_limit_error',
            'code': 429,
        }
    }


# FRED API Mock Responses

def get_mock_fred_mortgage_rates() -> Dict[str, Any]:
    """
    Mock FRED API response for current mortgage rates.
    """
    now = datetime.utcnow()
    return {
        'mortgage_30y': 6.75,
        'mortgage_15y': 6.25,
        'mortgage_5y_arm': 5.99,
        'mortgage_30y_prev': 6.80,
        'mortgage_15y_prev': 6.30,
        'timestamp': now.isoformat(),
        'date': now.strftime('%Y-%m-%d'),
    }


# Supabase Mock Responses

def get_mock_supabase_user() -> Dict[str, Any]:
    """
    Mock Supabase user object.
    """
    return {
        'id': 'user-123',
        'aud': 'authenticated',
        'role': 'authenticated',
        'email': 'test@example.com',
        'email_confirmed_at': '2024-01-01T00:00:00Z',
        'phone': '',
        'confirmed_at': '2024-01-01T00:00:00Z',
        'last_sign_in_at': (datetime.utcnow() - timedelta(days=1)).isoformat(),
        'app_metadata': {
            'provider': 'email',
            'providers': ['email'],
        },
        'user_metadata': {
            'full_name': 'Test User',
        },
        'identities': [
            {
                'id': 'user-123',
                'user_id': 'user-123',
                'identity_data': {
                    'email': 'test@example.com',
                },
                'provider': 'email',
                'last_sign_in_at': (datetime.utcnow() - timedelta(days=1)).isoformat(),
                'created_at': '2024-01-01T00:00:00Z',
                'updated_at': '2024-01-01T00:00:00Z',
            }
        ],
        'created_at': '2024-01-01T00:00:00Z',
        'updated_at': '2024-01-01T00:00:00Z',
    }


def get_mock_supabase_session() -> Dict[str, Any]:
    """
    Mock Supabase auth session.
    """
    expires_at = int((datetime.utcnow() + timedelta(hours=1)).timestamp())
    return {
        'user': get_mock_supabase_user(),
        'session': {
            'access_token': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImV4cCI6OTk5OTk5OTk5OX0.test',
            'token_type': 'bearer',
            'expires_in': 3600,
            'expires_at': expires_at,
            'refresh_token': 'refresh_token_123',
            'user': get_mock_supabase_user(),
        },
    }


def get_mock_listing_save_response() -> Dict[str, Any]:
    """
    Mock Supabase response when saving a listing.
    """
    return {
        'data': [
            {
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
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat(),
            }
        ],
        'error': None,
    }


def get_mock_user_listings() -> List[Dict[str, Any]]:
    """
    Mock list of user's saved listings from Supabase.
    """
    return [
        {
            'id': 'listing-1',
            'user_id': 'user-123',
            'address': '123 Main St, Anytown, CA 12345',
            'headline': '3BR/2BA Home',
            'description_ai': 'Beautiful home in great neighborhood',
            'status': 'draft',
            'beds': 3,
            'baths': 2,
            'sqft': 2500,
            'price_min_suggested': 475000,
            'price_mid': 500000,
            'price_max_suggested': 525000,
            'created_at': (datetime.utcnow() - timedelta(days=2)).isoformat(),
            'updated_at': (datetime.utcnow() - timedelta(days=2)).isoformat(),
        },
        {
            'id': 'listing-2',
            'user_id': 'user-123',
            'address': '456 Oak Ave, Springfield, IL 62701',
            'headline': '4BR/3BA Modern Farmhouse',
            'description_ai': 'Modern farmhouse with spacious lot',
            'status': 'published',
            'beds': 4,
            'baths': 3,
            'sqft': 3200,
            'price_min_suggested': 330000,
            'price_mid': 350000,
            'price_max_suggested': 370000,
            'created_at': (datetime.utcnow() - timedelta(days=5)).isoformat(),
            'updated_at': (datetime.utcnow() - timedelta(days=5)).isoformat(),
        },
        {
            'id': 'listing-3',
            'user_id': 'user-123',
            'address': '789 Elm St, Portland, OR 97214',
            'headline': '2BR/1BA Cozy Bungalow',
            'description_ai': 'Cozy bungalow in walkable neighborhood',
            'status': 'active',
            'beds': 2,
            'baths': 1,
            'sqft': 1200,
            'price_min_suggested': 260000,
            'price_mid': 275000,
            'price_max_suggested': 290000,
            'created_at': (datetime.utcnow() - timedelta(days=10)).isoformat(),
            'updated_at': (datetime.utcnow() - timedelta(days=10)).isoformat(),
        },
    ]


def get_mock_listing_by_id(listing_id: str = 'listing-1') -> Dict[str, Any]:
    """
    Mock single listing response by ID.
    """
    return {
        'id': listing_id,
        'user_id': 'user-123',
        'address': '123 Main St, Anytown, CA 12345',
        'headline': '3BR/2BA Home',
        'description_ai': 'Beautiful home in great neighborhood',
        'status': 'draft',
        'beds': 3,
        'baths': 2,
        'sqft': 2500,
        'price_min_suggested': 475000,
        'price_mid': 500000,
        'price_max_suggested': 525000,
        'neighborhood_info': 'Established community with parks and schools',
        'amenities': ['hardwood floors', 'updated kitchen', 'fireplace'],
        'features': [
            {
                'feature_type': 'garage',
                'count': 2,
                'description': 'Two-car garage',
            }
        ],
        'similar_properties': [],
        'created_at': (datetime.utcnow() - timedelta(days=2)).isoformat(),
        'updated_at': (datetime.utcnow() - timedelta(days=2)).isoformat(),
    }


# Image Analysis Mock Responses

def get_mock_image_analysis() -> Dict[str, Any]:
    """
    Mock vision model response for property image analysis.
    """
    return {
        'description': 'Front exterior of single-family home with two-car garage and mature landscaping',
        'property_type': 'Single Family Home',
        'key_features': [
            'garage',
            'driveway',
            'landscaping',
            'front porch',
        ],
        'condition_assessment': 'well-maintained',
        'exterior_materials': ['vinyl siding', 'asphalt roof'],
    }


# Network Error Mock Responses

def get_mock_network_error() -> Dict[str, Any]:
    """Mock network error response"""
    return {
        'error': 'Connection timeout',
        'code': 'ETIMEDOUT',
    }


def get_mock_auth_error() -> Dict[str, Any]:
    """Mock authentication error response"""
    return {
        'error': {
            'message': 'Invalid credentials',
            'status': 400,
        }
    }


def get_mock_validation_error() -> Dict[str, Any]:
    """Mock validation error response"""
    return {
        'detail': [
            {
                'loc': ['body', 'email'],
                'msg': 'invalid email format',
                'type': 'value_error.email',
            }
        ]
    }
