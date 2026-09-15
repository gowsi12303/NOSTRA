from rest_framework import status
from rest_framework.test import APITestCase

from .models import User


class RegisterAPITests(APITestCase):
    url = '/api/accounts/register/'

    def valid_payload(self, **overrides):
        payload = {
            'username': 'testuser',
            'email': 'testuser@nostra.com',
            'password': 'NostraTest@2026!',
        }
        payload.update(overrides)
        return payload

    def test_successful_registration_returns_201(self):
        response = self.client.post(self.url, self.valid_payload(), format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_password_is_hashed_not_plaintext(self):
        payload = self.valid_payload()
        self.client.post(self.url, payload, format='json')

        user = User.objects.get(username=payload['username'])
        self.assertNotEqual(user.password, payload['password'])
        self.assertTrue(user.check_password(payload['password']))

    def test_duplicate_username_is_rejected(self):
        self.client.post(self.url, self.valid_payload(), format='json')

        response = self.client.post(
            self.url,
            self.valid_payload(email='other@nostra.com'),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('username', response.data)

    def test_duplicate_email_is_rejected(self):
        self.client.post(self.url, self.valid_payload(), format='json')

        response = self.client.post(
            self.url,
            self.valid_payload(username='otheruser'),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)

    def test_password_never_included_in_response(self):
        response = self.client.post(self.url, self.valid_payload(), format='json')

        self.assertNotIn('password', response.data)


class LoginAPITests(APITestCase):
    url = '/api/accounts/login/'
    username = 'loginuser'
    password = 'NostraTest@2026!'

    def setUp(self):
        User.objects.create_user(
            username=self.username,
            email='loginuser@nostra.com',
            password=self.password,
        )

    def test_successful_login_returns_200(self):
        response = self.client.post(
            self.url,
            {'username': self.username, 'password': self.password},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_access_and_refresh_tokens_returned(self):
        response = self.client.post(
            self.url,
            {'username': self.username, 'password': self.password},
            format='json',
        )
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertTrue(response.data['access'])
        self.assertTrue(response.data['refresh'])

    def test_invalid_password_returns_401(self):
        response = self.client.post(
            self.url,
            {'username': self.username, 'password': 'WrongPassword!'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_nonexistent_username_returns_401(self):
        response = self.client.post(
            self.url,
            {'username': 'doesnotexist', 'password': self.password},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class TokenRefreshAPITests(APITestCase):
    url = '/api/accounts/token/refresh/'
    login_url = '/api/accounts/login/'
    username = 'refreshuser'
    password = 'NostraTest@2026!'

    def setUp(self):
        User.objects.create_user(
            username=self.username,
            email='refreshuser@nostra.com',
            password=self.password,
        )
        login_response = self.client.post(
            self.login_url,
            {'username': self.username, 'password': self.password},
            format='json',
        )
        self.access = login_response.data['access']
        self.refresh = login_response.data['refresh']

    def test_valid_refresh_token_returns_200_and_access_token(self):
        response = self.client.post(self.url, {'refresh': self.refresh}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertTrue(response.data['access'])

    def test_returned_access_token_can_authenticate_against_protected_endpoint(self):
        response = self.client.post(self.url, {'refresh': self.refresh}, format='json')
        new_access = response.data['access']

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {new_access}')
        protected_response = self.client.get('/api/products/cart/')
        self.assertEqual(protected_response.status_code, status.HTTP_200_OK)

    def test_missing_refresh_field_returns_400(self):
        response = self.client.post(self.url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_malformed_token_returns_401(self):
        response = self.client.post(self.url, {'refresh': 'not-a-real-token'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_access_token_used_as_refresh_token_returns_401(self):
        # Wrong token type: an access token is not a valid refresh token,
        # even though it's a well-formed, currently-valid JWT.
        response = self.client.post(self.url, {'refresh': self.access}, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_no_authorization_header_required(self):
        # The refresh endpoint must be reachable without an access-token
        # Authorization header — the refresh token itself is the
        # credential here. A fresh, uncredentialed client (no login, no
        # force_authenticate, no Authorization header ever set) proves
        # this on its own.
        anonymous_client = self.client_class()
        response = anonymous_client.post(self.url, {'refresh': self.refresh}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
