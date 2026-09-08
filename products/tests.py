from rest_framework import status
from rest_framework.test import APITestCase

from .models import Product


class ProductListAPITests(APITestCase):
    url = '/api/products/'

    def setUp(self):
        self.active_product = Product.objects.create(
            name='Active Product',
            description='An active product',
            price='19.99',
            is_active=True,
        )
        self.inactive_product = Product.objects.create(
            name='Inactive Product',
            description='An inactive product',
            price='29.99',
            is_active=False,
        )

    def test_list_returns_200(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_active_products_are_returned(self):
        response = self.client.get(self.url)
        names = [item['name'] for item in response.data]
        self.assertIn(self.active_product.name, names)

    def test_inactive_products_are_not_returned(self):
        response = self.client.get(self.url)
        names = [item['name'] for item in response.data]
        self.assertNotIn(self.inactive_product.name, names)


class ProductDetailAPITests(APITestCase):
    def setUp(self):
        self.active_product = Product.objects.create(
            name='Active Product',
            description='An active product',
            price='19.99',
            is_active=True,
        )
        self.inactive_product = Product.objects.create(
            name='Inactive Product',
            description='An inactive product',
            price='29.99',
            is_active=False,
        )

    def detail_url(self, pk):
        return f'/api/products/{pk}/'

    def test_active_product_detail_returns_200(self):
        response = self.client.get(self.detail_url(self.active_product.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_returned_data_contains_correct_product(self):
        response = self.client.get(self.detail_url(self.active_product.id))
        self.assertEqual(response.data['id'], self.active_product.id)
        self.assertEqual(response.data['name'], self.active_product.name)

    def test_inactive_product_returns_404(self):
        response = self.client.get(self.detail_url(self.inactive_product.id))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_nonexistent_product_returns_404(self):
        nonexistent_id = self.inactive_product.id + 1000
        response = self.client.get(self.detail_url(nonexistent_id))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
