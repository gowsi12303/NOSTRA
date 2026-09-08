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
