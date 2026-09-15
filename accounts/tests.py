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


class CustomerListAdminAPITests(APITestCase):
    """GET /api/accounts/admin/customers/ — staff-only customer directory
    (Step 112)."""

    url = '/api/accounts/admin/customers/'

    def setUp(self):
        self.staff_user = User.objects.create_user(
            username='customerliststaff',
            email='customerliststaff@nostra.com',
            password='NostraTest@2026!',
            is_staff=True,
        )
        self.customer_one = User.objects.create_user(
            username='alicecustomer',
            email='alice@nostra.com',
            password='NostraTest@2026!',
            first_name='Alice',
            last_name='Wonderland',
        )
        self.customer_two = User.objects.create_user(
            username='bobcustomer',
            email='bob@nostra.com',
            password='NostraTest@2026!',
            first_name='Bob',
            last_name='Builder',
            is_active=False,
        )

    def list_customers(self, params=None, user=None):
        if user is not None:
            self.client.force_authenticate(user=user)
        return self.client.get(self.url, params or {})

    def test_admin_can_list_customers(self):
        response = self.list_customers(user=self.staff_user)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        usernames = {item['username'] for item in response.data['results']}
        self.assertIn('alicecustomer', usernames)

    def test_admin_can_see_multiple_customers(self):
        response = self.list_customers(user=self.staff_user)
        # staff_user + customer_one + customer_two == 3
        self.assertEqual(response.data['count'], 3)

    def test_normal_customer_is_forbidden(self):
        response = self.list_customers(user=self.customer_one)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_request_is_rejected(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_password_is_never_exposed(self):
        response = self.list_customers(user=self.staff_user)
        for item in response.data['results']:
            self.assertNotIn('password', item)
            self.assertNotIn('password_hash', item)

    def test_expected_fields_are_present(self):
        response = self.list_customers(user=self.staff_user)
        item = next(i for i in response.data['results'] if i['username'] == 'alicecustomer')
        for field in ('id', 'username', 'email', 'first_name', 'last_name', 'is_active', 'date_joined'):
            self.assertIn(field, item)
        self.assertEqual(item['email'], 'alice@nostra.com')
        self.assertEqual(item['first_name'], 'Alice')
        self.assertEqual(item['last_name'], 'Wonderland')

    def test_search_by_username(self):
        response = self.list_customers(params={'search': 'alicecustomer'}, user=self.staff_user)
        usernames = [item['username'] for item in response.data['results']]
        self.assertEqual(usernames, ['alicecustomer'])

    def test_search_by_email(self):
        response = self.list_customers(params={'search': 'bob@nostra.com'}, user=self.staff_user)
        usernames = [item['username'] for item in response.data['results']]
        self.assertEqual(usernames, ['bobcustomer'])

    def test_search_by_first_name(self):
        response = self.list_customers(params={'search': 'Wonderland'}, user=self.staff_user)
        usernames = [item['username'] for item in response.data['results']]
        self.assertEqual(usernames, ['alicecustomer'])

    def test_ordering_by_username(self):
        response = self.list_customers(params={'ordering': 'username'}, user=self.staff_user)
        usernames = [item['username'] for item in response.data['results']]
        self.assertEqual(usernames, sorted(usernames))

    def test_is_active_filter(self):
        response = self.list_customers(params={'is_active': 'false'}, user=self.staff_user)
        usernames = {item['username'] for item in response.data['results']}
        self.assertEqual(usernames, {'bobcustomer'})

    def test_pagination_default_page_size(self):
        for i in range(15):
            User.objects.create_user(
                username=f'pagecustomer{i:03d}',
                email=f'pagecustomer{i:03d}@nostra.com',
                password='NostraTest@2026!',
            )
        response = self.list_customers(user=self.staff_user)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 12)
        self.assertIsNotNone(response.data['next'])


class CustomerDetailAdminAPITests(APITestCase):
    """GET /api/accounts/admin/customers/<pk>/ — staff-only single
    customer retrieval (Step 124)."""

    def detail_url(self, pk):
        return f'/api/accounts/admin/customers/{pk}/'

    def setUp(self):
        self.staff_user = User.objects.create_user(
            username='customerdetailstaff',
            email='customerdetailstaff@nostra.com',
            password='NostraTest@2026!',
            is_staff=True,
        )
        self.customer = User.objects.create_user(
            username='carolcustomer',
            email='carol@nostra.com',
            password='NostraTest@2026!',
            first_name='Carol',
            last_name='Danvers',
        )

    def get_customer(self, pk, user=None):
        if user is not None:
            self.client.force_authenticate(user=user)
        return self.client.get(self.detail_url(pk))

    def test_admin_can_retrieve_customer(self):
        response = self.get_customer(self.customer.id, user=self.staff_user)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], self.customer.id)
        self.assertEqual(response.data['username'], 'carolcustomer')
        self.assertEqual(response.data['email'], 'carol@nostra.com')
        self.assertEqual(response.data['first_name'], 'Carol')
        self.assertEqual(response.data['last_name'], 'Danvers')
        self.assertIn('is_active', response.data)
        self.assertIn('date_joined', response.data)

    def test_unauthenticated_request_is_rejected(self):
        response = self.client.get(self.detail_url(self.customer.id))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_normal_customer_is_forbidden(self):
        response = self.get_customer(self.customer.id, user=self.customer)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_nonexistent_customer_returns_404(self):
        response = self.get_customer(999999, user=self.staff_user)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_sensitive_fields_are_never_exposed(self):
        response = self.get_customer(self.customer.id, user=self.staff_user)
        for field in (
            'password', 'password_hash', 'is_staff', 'is_superuser',
            'last_login', 'groups', 'user_permissions',
        ):
            self.assertNotIn(field, response.data)


class CurrentUserAPITests(APITestCase):
    """GET /api/accounts/me/ — any authenticated user's own account
    (Step 137)."""

    url = '/api/accounts/me/'

    def setUp(self):
        self.customer = User.objects.create_user(
            username='meuser',
            email='meuser@nostra.com',
            password='NostraTest@2026!',
            first_name='Dana',
            last_name='Scully',
        )
        self.staff_user = User.objects.create_user(
            username='mestaff',
            email='mestaff@nostra.com',
            password='NostraTest@2026!',
            is_staff=True,
        )

    def get_me(self, user=None):
        if user is not None:
            self.client.force_authenticate(user=user)
        return self.client.get(self.url)

    def test_authenticated_customer_gets_200(self):
        response = self.get_me(user=self.customer)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], self.customer.id)
        self.assertEqual(response.data['username'], 'meuser')
        self.assertEqual(response.data['email'], 'meuser@nostra.com')
        self.assertEqual(response.data['first_name'], 'Dana')
        self.assertEqual(response.data['last_name'], 'Scully')
        self.assertFalse(response.data['is_staff'])

    def test_authenticated_staff_gets_200_with_is_staff_true(self):
        response = self.get_me(user=self.staff_user)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], self.staff_user.id)
        self.assertTrue(response.data['is_staff'])

    def test_unauthenticated_request_returns_401(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_sensitive_fields_are_never_exposed(self):
        response = self.get_me(user=self.customer)
        for field in (
            'password', 'password_hash', 'is_superuser',
            'last_login', 'groups', 'user_permissions',
        ):
            self.assertNotIn(field, response.data)
