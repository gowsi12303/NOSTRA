from django.test import Client, SimpleTestCase, override_settings


class HealthEndpointTests(SimpleTestCase):
    """GET /health/ — liveness probe for hosting platforms."""

    url = '/health/'

    def test_returns_200_with_fixed_body(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok'})

    def test_requires_no_authentication(self):
        # No Authorization header, no session: a probe has neither.
        response = Client().get(self.url)
        self.assertEqual(response.status_code, 200)

    def test_makes_no_database_queries(self):
        # SimpleTestCase forbids database access, so reaching this
        # assertion at all proves the view never touched the database.
        self.assertEqual(self.client.get(self.url).status_code, 200)

    def test_is_not_redirected_when_ssl_redirect_is_enabled(self):
        with override_settings(SECURE_SSL_REDIRECT=True):
            # A fresh client so the middleware is rebuilt with the override.
            client = Client()
            self.assertEqual(client.get(self.url).status_code, 200)
            # Every other path still redirects to HTTPS.
            self.assertEqual(client.get('/api/products/').status_code, 301)
