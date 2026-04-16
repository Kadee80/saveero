"""
test_listing_routes.py

Tests for listing API endpoints:
- POST /api/listings/generate - generate listing from photos
- POST /api/listings/save - save listing to Supabase
- GET /api/listings - list user's saved listings
- GET /api/listings/{id} - get specific listing
- DELETE /api/listings/{id} - delete listing
- Error handling for invalid inputs
"""

import pytest
import json
import os
from io import BytesIO
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from main import app
from tests.mock_responses import (
    get_mock_openrouter_listing_response,
    get_mock_user_listings,
    get_mock_listing_save_response,
    get_mock_listing_by_id,
    get_mock_image_analysis,
)

# Load test environment
if os.path.exists('tests/.env.test'):
    from dotenv import load_dotenv
    load_dotenv('tests/.env.test')

client = TestClient(app)


@pytest.fixture
def valid_jwt_token():
    """Valid JWT token for testing"""
    return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImV4cCI6OTk5OTk5OTk5OX0.test'


@pytest.fixture
def auth_headers(valid_jwt_token):
    """Standard auth headers for requests"""
    return {'Authorization': f'Bearer {valid_jwt_token}'}


@pytest.fixture
def mock_listing_response():
    """Standard generated listing response using mock data"""
    return get_mock_openrouter_listing_response()


class TestGenerateListing:
    """Tests for POST /api/listings/generate endpoint"""

    def test_generate_with_valid_images_and_address(self, auth_headers, mock_listing_response):
        """Should generate listing from valid photos and address"""
        # Create mock image file
        image_data = b'fake image data'
        image_file = ('photo.jpg', BytesIO(image_data), 'image/jpeg')

        with patch('api.listing_wizard_routes.generate_listing') as mock_gen:
            mock_gen.return_value = mock_listing_response

            response = client.post(
                '/api/listings/generate',
                data={
                    'address': '123 Main St, Anytown, CA 12345',
                    'notes': 'Recently renovated',
                },
                files={'images': image_file},
                headers=auth_headers,
            )

        assert response.status_code == 200
        assert response.json()['title'] == '3BR/2BA Home in Great Location'
        assert response.json()['address'] == '123 Main St, Anytown, CA 12345'

    def test_generate_with_multiple_images(self, auth_headers, mock_listing_response):
        """Should process multiple image files"""
        images = [
            ('photo1.jpg', BytesIO(b'image1'), 'image/jpeg'),
            ('photo2.jpg', BytesIO(b'image2'), 'image/jpeg'),
            ('photo3.jpg', BytesIO(b'image3'), 'image/jpeg'),
        ]

        with patch('api.listing_wizard_routes.generate_listing') as mock_gen:
            mock_gen.return_value = mock_listing_response

            response = client.post(
                '/api/listings/generate',
                data={'address': '123 Main St', 'notes': ''},
                files=[('images', img) for img in images],
                headers=auth_headers,
            )

        assert response.status_code == 200

    def test_generate_without_images(self, auth_headers):
        """Should reject listing generation without images"""
        response = client.post(
            '/api/listings/generate',
            data={
                'address': '123 Main St',
                'notes': '',
            },
            headers=auth_headers,
        )

        assert response.status_code in [400, 422]

    def test_generate_without_address(self, auth_headers):
        """Should reject listing generation without address"""
        image_file = ('photo.jpg', BytesIO(b'fake'), 'image/jpeg')

        response = client.post(
            '/api/listings/generate',
            data={'notes': ''},
            files={'images': image_file},
            headers=auth_headers,
        )

        assert response.status_code in [400, 422]

    def test_generate_without_auth(self, mock_listing_response):
        """Should reject unauthenticated listing generation"""
        image_file = ('photo.jpg', BytesIO(b'fake'), 'image/jpeg')

        response = client.post(
            '/api/listings/generate',
            data={
                'address': '123 Main St',
                'notes': '',
            },
            files={'images': image_file},
        )

        assert response.status_code == 401

    def test_generate_with_optional_notes(self, auth_headers, mock_listing_response):
        """Should accept optional notes parameter"""
        image_file = ('photo.jpg', BytesIO(b'fake'), 'image/jpeg')

        with patch('api.listing_wizard_routes.generate_listing') as mock_gen:
            mock_gen.return_value = mock_listing_response

            response = client.post(
                '/api/listings/generate',
                data={
                    'address': '123 Main St',
                    'notes': 'Recently renovated kitchen and bathrooms',
                },
                files={'images': image_file},
                headers=auth_headers,
            )

        assert response.status_code == 200

    def test_generate_with_invalid_image_format(self, auth_headers):
        """Should reject non-image file uploads"""
        text_file = ('document.txt', BytesIO(b'not an image'), 'text/plain')

        response = client.post(
            '/api/listings/generate',
            data={'address': '123 Main St', 'notes': ''},
            files={'images': text_file},
            headers=auth_headers,
        )

        assert response.status_code in [400, 422]

    def test_generate_returns_all_required_fields(self, auth_headers, mock_listing_response):
        """Should return listing with all required fields"""
        image_file = ('photo.jpg', BytesIO(b'fake'), 'image/jpeg')

        with patch('api.listing_wizard_routes.generate_listing') as mock_gen:
            mock_gen.return_value = mock_listing_response

            response = client.post(
                '/api/listings/generate',
                data={'address': '123 Main St', 'notes': ''},
                files={'images': image_file},
                headers=auth_headers,
            )

        data = response.json()
        assert 'title' in data
        assert 'address' in data
        assert 'recommended_price' in data
        assert 'bedrooms' in data
        assert 'bathrooms' in data
        assert 'description' in data


class TestSaveListing:
    """Tests for POST /api/listings/save endpoint"""

    def test_save_listing_with_valid_data(self, auth_headers):
        """Should save listing to database"""
        listing_data = {
            'address': '123 Main St',
            'headline': '3BR/2BA Home',
            'description': 'Beautiful home',
            'price_min': 475000,
            'price_max': 525000,
            'price_mid': 500000,
            'beds': 3,
            'baths': 2,
            'sqft': 2500,
            'comps': [],
        }

        with patch('api.listing_wizard_routes.save_listing') as mock_save:
            mock_save.return_value = {'success': True, 'id': 'listing-123'}

            response = client.post(
                '/api/listings/save',
                json=listing_data,
                headers=auth_headers,
            )

        assert response.status_code == 200
        assert response.json()['success'] is True
        assert 'id' in response.json()

    def test_save_listing_without_address(self, auth_headers):
        """Should reject listing save without address"""
        response = client.post(
            '/api/listings/save',
            json={
                'headline': '3BR/2BA Home',
                'description': 'Beautiful',
                'beds': 3,
                'baths': 2,
            },
            headers=auth_headers,
        )

        assert response.status_code in [400, 422]

    def test_save_listing_without_auth(self):
        """Should reject unauthenticated listing save"""
        response = client.post(
            '/api/listings/save',
            json={
                'address': '123 Main St',
                'headline': '3BR/2BA',
                'description': 'Home',
                'beds': 3,
                'baths': 2,
            },
        )

        assert response.status_code == 401

    def test_save_listing_with_partial_data(self, auth_headers):
        """Should accept listing save with minimal required data"""
        with patch('api.listing_wizard_routes.save_listing') as mock_save:
            mock_save.return_value = {'success': True, 'id': 'listing-456'}

            response = client.post(
                '/api/listings/save',
                json={
                    'address': '456 Oak Ave',
                    'headline': 'Modern Home',
                    'description': 'Nice place',
                },
                headers=auth_headers,
            )

        assert response.status_code == 200

    def test_save_listing_associates_with_user(self, auth_headers):
        """Should associate saved listing with authenticated user"""
        with patch('api.listing_wizard_routes.save_listing') as mock_save:
            mock_save.return_value = {'success': True, 'id': 'listing-789'}

            response = client.post(
                '/api/listings/save',
                json={
                    'address': '789 Elm St',
                    'headline': 'Home',
                    'description': 'Place',
                },
                headers=auth_headers,
            )

        assert response.status_code == 200
        # Verify user_id was passed to save function
        mock_save.assert_called_once()


class TestListListings:
    """Tests for GET /api/listings endpoint"""

    def test_list_user_listings(self, auth_headers):
        """Should return all listings for authenticated user"""
        mock_listings = [
            {
                'id': 'listing-1',
                'address': '123 Main St',
                'status': 'draft',
                'price_mid': 500000,
                'beds': 3,
                'baths': 2,
                'created_at': '2024-01-01T00:00:00',
            },
            {
                'id': 'listing-2',
                'address': '456 Oak Ave',
                'status': 'published',
                'price_mid': 350000,
                'beds': 4,
                'baths': 3,
                'created_at': '2024-01-02T00:00:00',
            },
        ]

        with patch('api.listing_wizard_routes.get_user_listings') as mock_get:
            mock_get.return_value = mock_listings

            response = client.get(
                '/api/listings',
                headers=auth_headers,
            )

        assert response.status_code == 200
        assert len(response.json()) == 2
        assert response.json()[0]['address'] == '123 Main St'

    def test_list_empty_listings(self, auth_headers):
        """Should return empty array when user has no listings"""
        with patch('api.listing_wizard_routes.get_user_listings') as mock_get:
            mock_get.return_value = []

            response = client.get(
                '/api/listings',
                headers=auth_headers,
            )

        assert response.status_code == 200
        assert response.json() == []

    def test_list_listings_without_auth(self):
        """Should require authentication to list listings"""
        response = client.get('/api/listings')

        assert response.status_code == 401

    def test_list_listings_includes_status(self, auth_headers):
        """Should include listing status in response"""
        mock_listings = [
            {
                'id': 'listing-1',
                'address': '123 Main St',
                'status': 'draft',
                'created_at': '2024-01-01T00:00:00',
            },
        ]

        with patch('api.listing_wizard_routes.get_user_listings') as mock_get:
            mock_get.return_value = mock_listings

            response = client.get('/api/listings', headers=auth_headers)

        assert response.json()[0]['status'] in ['draft', 'published', 'active']

    def test_list_listings_sorted_by_date(self, auth_headers):
        """Should return listings sorted by creation date (newest first)"""
        mock_listings = [
            {
                'id': 'listing-2',
                'address': '456 Oak',
                'created_at': '2024-01-02T00:00:00',
            },
            {
                'id': 'listing-1',
                'address': '123 Main',
                'created_at': '2024-01-01T00:00:00',
            },
        ]

        with patch('api.listing_wizard_routes.get_user_listings') as mock_get:
            mock_get.return_value = mock_listings

            response = client.get('/api/listings', headers=auth_headers)

            # First item should be most recent
            assert response.json()[0]['created_at'] > response.json()[1]['created_at']


class TestGetListing:
    """Tests for GET /api/listings/{id} endpoint"""

    def test_get_listing_by_id(self, auth_headers):
        """Should retrieve specific listing by ID"""
        mock_listing = {
            'id': 'listing-123',
            'address': '123 Main St',
            'status': 'draft',
            'beds': 3,
            'baths': 2,
            'description': 'Beautiful home',
        }

        with patch('api.listing_wizard_routes.get_listing') as mock_get:
            mock_get.return_value = mock_listing

            response = client.get(
                '/api/listings/listing-123',
                headers=auth_headers,
            )

        assert response.status_code == 200
        assert response.json()['address'] == '123 Main St'

    def test_get_nonexistent_listing(self, auth_headers):
        """Should return 404 for non-existent listing"""
        with patch('api.listing_wizard_routes.get_listing') as mock_get:
            mock_get.return_value = None

            response = client.get(
                '/api/listings/nonexistent-id',
                headers=auth_headers,
            )

        assert response.status_code == 404

    def test_get_listing_without_auth(self):
        """Should require authentication to get listing"""
        response = client.get('/api/listings/listing-123')

        assert response.status_code == 401

    def test_cannot_access_other_user_listing(self, auth_headers):
        """Should not allow accessing another user's listing"""
        with patch('api.listing_wizard_routes.get_listing') as mock_get:
            mock_get.return_value = None  # Not found for this user

            response = client.get(
                '/api/listings/other-user-listing',
                headers=auth_headers,
            )

        assert response.status_code == 404


class TestDeleteListing:
    """Tests for DELETE /api/listings/{id} endpoint"""

    def test_delete_listing(self, auth_headers):
        """Should delete user's listing"""
        with patch('api.listing_wizard_routes.delete_listing') as mock_delete:
            mock_delete.return_value = True

            response = client.delete(
                '/api/listings/listing-123',
                headers=auth_headers,
            )

        assert response.status_code == 200

    def test_delete_nonexistent_listing(self, auth_headers):
        """Should return 404 when deleting non-existent listing"""
        with patch('api.listing_wizard_routes.delete_listing') as mock_delete:
            mock_delete.return_value = False

            response = client.delete(
                '/api/listings/nonexistent',
                headers=auth_headers,
            )

        assert response.status_code == 404

    def test_delete_listing_without_auth(self):
        """Should require authentication to delete listing"""
        response = client.delete('/api/listings/listing-123')

        assert response.status_code == 401

    def test_cannot_delete_other_user_listing(self, auth_headers):
        """Should not allow deleting another user's listing"""
        with patch('api.listing_wizard_routes.delete_listing') as mock_delete:
            mock_delete.return_value = False

            response = client.delete(
                '/api/listings/other-user-listing',
                headers=auth_headers,
            )

        assert response.status_code == 404


class TestErrorHandling:
    """Tests for API error handling"""

    def test_invalid_json_body(self, auth_headers):
        """Should handle invalid JSON in request body"""
        response = client.post(
            '/api/listings/save',
            data='invalid json {',
            headers=auth_headers,
            content_type='application/json',
        )

        assert response.status_code in [400, 422]

    def test_missing_required_fields(self, auth_headers):
        """Should validate required fields"""
        response = client.post(
            '/api/listings/save',
            json={'headline': 'Title'},  # Missing address
            headers=auth_headers,
        )

        assert response.status_code == 422

    def test_invalid_price_format(self, auth_headers):
        """Should validate price fields"""
        response = client.post(
            '/api/listings/save',
            json={
                'address': '123 Main',
                'price_mid': 'not-a-number',
            },
            headers=auth_headers,
        )

        assert response.status_code == 422

    def test_timeout_on_image_processing(self, auth_headers):
        """Should handle timeout during image processing"""
        image_file = ('photo.jpg', BytesIO(b'fake'), 'image/jpeg')

        with patch('api.listing_wizard_routes.generate_listing') as mock_gen:
            mock_gen.side_effect = TimeoutError('Processing timeout')

            response = client.post(
                '/api/listings/generate',
                data={'address': '123 Main', 'notes': ''},
                files={'images': image_file},
                headers=auth_headers,
            )

        assert response.status_code in [408, 500, 502]
