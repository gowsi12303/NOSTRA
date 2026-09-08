from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Category, Product


class CategoryModelTests(APITestCase):
    def test_category_creation(self):
        category = Category.objects.create(
            name='Electronics',
            description='Electronic goods',
        )
        self.assertEqual(category.name, 'Electronics')
        self.assertTrue(category.is_active)

    def test_duplicate_category_name_is_rejected(self):
        Category.objects.create(name='Electronics')
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Category.objects.create(name='Electronics')


class ProductCategoryTests(APITestCase):
    def test_product_can_belong_to_a_category(self):
        category = Category.objects.create(name='Footwear')
        product = Product.objects.create(
            name='Sneakers',
            description='Running shoes',
            price='49.99',
            category=category,
        )
        self.assertEqual(product.category, category)
        self.assertEqual(category.products.first(), product)


class ProductListAPITests(APITestCase):
    url = '/api/products/'

    def setUp(self):
        self.category = Category.objects.create(name='General')
        self.active_product = Product.objects.create(
            name='Active Product',
            description='An active product',
            price='19.99',
            is_active=True,
            category=self.category,
        )
        self.inactive_product = Product.objects.create(
            name='Inactive Product',
            description='An inactive product',
            price='29.99',
            is_active=False,
            category=self.category,
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

    def test_response_includes_category_information(self):
        response = self.client.get(self.url)
        product_data = response.data[0]
        self.assertIn('category', product_data)
        self.assertEqual(product_data['category']['id'], self.category.id)
        self.assertEqual(product_data['category']['name'], self.category.name)


class ProductDetailAPITests(APITestCase):
    def setUp(self):
        self.category = Category.objects.create(name='General')
        self.active_product = Product.objects.create(
            name='Active Product',
            description='An active product',
            price='19.99',
            is_active=True,
            category=self.category,
        )
        self.inactive_product = Product.objects.create(
            name='Inactive Product',
            description='An inactive product',
            price='29.99',
            is_active=False,
            category=self.category,
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

    def test_detail_response_includes_category_information(self):
        response = self.client.get(self.detail_url(self.active_product.id))
        self.assertIn('category', response.data)
        self.assertEqual(response.data['category']['id'], self.category.id)
        self.assertEqual(response.data['category']['name'], self.category.name)


class CategoryListAPITests(APITestCase):
    url = '/api/products/categories/'

    def setUp(self):
        self.active_category = Category.objects.create(name='Active Category')
        self.inactive_category = Category.objects.create(
            name='Inactive Category',
            is_active=False,
        )

    def test_list_returns_200(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_active_categories_are_returned(self):
        response = self.client.get(self.url)
        names = [item['name'] for item in response.data]
        self.assertIn(self.active_category.name, names)

    def test_inactive_categories_are_not_returned(self):
        response = self.client.get(self.url)
        names = [item['name'] for item in response.data]
        self.assertNotIn(self.inactive_category.name, names)


class CategoryDetailAPITests(APITestCase):
    def setUp(self):
        self.active_category = Category.objects.create(name='Active Category')
        self.inactive_category = Category.objects.create(
            name='Inactive Category',
            is_active=False,
        )

    def detail_url(self, pk):
        return f'/api/products/categories/{pk}/'

    def test_active_category_detail_returns_200(self):
        response = self.client.get(self.detail_url(self.active_category.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_inactive_category_detail_returns_404(self):
        response = self.client.get(self.detail_url(self.inactive_category.id))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_nonexistent_category_detail_returns_404(self):
        nonexistent_id = self.inactive_category.id + 1000
        response = self.client.get(self.detail_url(nonexistent_id))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
