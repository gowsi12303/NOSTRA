import shutil
import tempfile
from decimal import Decimal

from django.conf import settings
from django.conf.urls.static import static
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, connection, transaction
from django.db.models.deletion import ProtectedError
from django.test import RequestFactory, override_settings
from django.test.utils import CaptureQueriesContext
from django.urls import resolve
from django.views.static import serve as static_serve
from rest_framework import status
from rest_framework.test import APIRequestFactory, APITestCase, force_authenticate

from .models import (
    Address,
    Cart,
    CartItem,
    Category,
    Order,
    OrderItem,
    Product,
    ProductColor,
    ProductImage,
    ProductSize,
    ProductVariant,
    WishlistItem,
)
from .serializers import (
    AddressSerializer,
    CartItemSerializer,
    CartSerializer,
    OrderItemSerializer,
    OrderSerializer,
    WishlistItemSerializer,
)
from .views import (
    AddressDetailView,
    AddressListCreateView,
    CartAddItemView,
    CartDetailView,
    CartItemDetailView,
    CategoryListView,
    ProductListView,
    WishlistItemDeleteView,
    WishlistListCreateView,
)

User = get_user_model()

# A minimal valid 1x1 GIF, used to satisfy ImageField's Pillow validation
# without needing a real image file on disk.
TINY_GIF = (
    b'GIF87a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff\x21\xf9'
    b'\x04\x01\x00\x00\x00\x00\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02'
    b'\x02\x44\x01\x00\x3b'
)

TEST_MEDIA_ROOT = tempfile.mkdtemp()


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
        names = [item['name'] for item in response.data['results']]
        self.assertIn(self.active_product.name, names)

    def test_inactive_products_are_not_returned(self):
        response = self.client.get(self.url)
        names = [item['name'] for item in response.data['results']]
        self.assertNotIn(self.inactive_product.name, names)

    def test_response_includes_category_information(self):
        response = self.client.get(self.url)
        product_data = response.data['results'][0]
        self.assertIn('category', product_data)
        self.assertEqual(product_data['category']['id'], self.category.id)
        self.assertEqual(product_data['category']['name'], self.category.name)


class ProductListFilterAPITests(APITestCase):
    url = '/api/products/'

    def setUp(self):
        self.category_electronics = Category.objects.create(name='Electronics')
        self.category_apparel = Category.objects.create(name='Apparel')

        self.laptop = Product.objects.create(
            name='Laptop',
            description='A laptop',
            price='999.99',
            category=self.category_electronics,
            is_active=True,
        )
        self.phone = Product.objects.create(
            name='Phone',
            description='A phone',
            price='499.99',
            category=self.category_electronics,
            is_active=True,
        )
        self.shirt = Product.objects.create(
            name='T-Shirt',
            description='A t-shirt',
            price='19.99',
            category=self.category_apparel,
            is_active=True,
        )
        self.inactive_laptop = Product.objects.create(
            name='Old Laptop',
            description='A discontinued laptop',
            price='199.99',
            category=self.category_electronics,
            is_active=False,
        )

    def test_filter_by_category_returns_only_that_category(self):
        response = self.client.get(self.url, {'category': self.category_electronics.id})
        names = [item['name'] for item in response.data['results']]
        self.assertIn('Laptop', names)
        self.assertIn('Phone', names)
        self.assertNotIn('T-Shirt', names)

    def test_filter_by_min_price_excludes_cheaper_products(self):
        response = self.client.get(self.url, {'min_price': '400'})
        names = [item['name'] for item in response.data['results']]
        self.assertIn('Laptop', names)
        self.assertIn('Phone', names)
        self.assertNotIn('T-Shirt', names)

    def test_filter_by_max_price_excludes_pricier_products(self):
        response = self.client.get(self.url, {'max_price': '50'})
        names = [item['name'] for item in response.data['results']]
        self.assertIn('T-Shirt', names)
        self.assertNotIn('Laptop', names)
        self.assertNotIn('Phone', names)

    def test_search_by_product_name(self):
        response = self.client.get(self.url, {'search': 'Lap'})
        names = [item['name'] for item in response.data['results']]
        self.assertIn('Laptop', names)
        self.assertNotIn('Phone', names)
        self.assertNotIn('T-Shirt', names)
        # inactive products must stay excluded even if the name matches
        self.assertNotIn('Old Laptop', names)

    def test_ordering_by_price_ascending(self):
        response = self.client.get(self.url, {'ordering': 'price'})
        prices = [float(item['price']) for item in response.data['results']]
        self.assertEqual(prices, sorted(prices))

    def test_ordering_by_price_descending(self):
        response = self.client.get(self.url, {'ordering': '-price'})
        prices = [float(item['price']) for item in response.data['results']]
        self.assertEqual(prices, sorted(prices, reverse=True))

    def test_combining_multiple_filters(self):
        response = self.client.get(self.url, {
            'category': self.category_electronics.id,
            'min_price': '400',
            'max_price': '600',
            'ordering': 'price',
        })
        names = [item['name'] for item in response.data['results']]
        self.assertEqual(names, ['Phone'])


class ProductListPaginationAPITests(APITestCase):
    url = '/api/products/'

    def setUp(self):
        self.category = Category.objects.create(name='Bulk Category')
        self.products = [
            Product.objects.create(
                name=f'Product {i:02d}',
                description='A bulk product',
                price='10.00',
                category=self.category,
                is_active=True,
            )
            for i in range(1, 51)
        ]

    def test_response_contains_pagination_keys(self):
        response = self.client.get(self.url)
        self.assertIn('count', response.data)
        self.assertIn('next', response.data)
        self.assertIn('previous', response.data)
        self.assertIn('results', response.data)

    def test_default_page_size_is_12(self):
        response = self.client.get(self.url)
        self.assertEqual(response.data['count'], 50)
        self.assertEqual(len(response.data['results']), 12)

    def test_page_2_returns_next_page(self):
        page_1 = self.client.get(self.url)
        page_2 = self.client.get(self.url, {'page': 2})
        page_1_names = [item['name'] for item in page_1.data['results']]
        page_2_names = [item['name'] for item in page_2.data['results']]
        self.assertEqual(len(page_2.data['results']), 12)
        self.assertTrue(set(page_1_names).isdisjoint(page_2_names))

    def test_custom_page_size_query_param(self):
        response = self.client.get(self.url, {'page_size': 5})
        self.assertEqual(len(response.data['results']), 5)

    def test_page_size_is_capped_at_max_page_size(self):
        response = self.client.get(self.url, {'page_size': 9999})
        self.assertEqual(len(response.data['results']), 48)

    def test_first_page_has_no_previous(self):
        response = self.client.get(self.url)
        self.assertIsNone(response.data['previous'])

    def test_last_page_has_no_next(self):
        # 50 items at page_size 12 -> 5 pages (12, 12, 12, 12, 2)
        response = self.client.get(self.url, {'page': 5})
        self.assertIsNone(response.data['next'])
        self.assertEqual(len(response.data['results']), 2)


@override_settings(MEDIA_ROOT=TEST_MEDIA_ROOT)
class ProductAPIQueryOptimizationTests(APITestCase):
    """Verifies category/images/sizes/colors/variants are fetched without N+1 queries."""

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEST_MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        self.category = Category.objects.create(name='Query Category')

    def _create_fully_populated_product(self, name):
        product = Product.objects.create(
            name=name,
            description='A product',
            price='10.00',
            category=self.category,
            is_active=True,
        )
        ProductImage.objects.create(
            product=product,
            image=SimpleUploadedFile(f'{name}.gif', TINY_GIF, content_type='image/gif'),
            alt_text='alt',
        )
        size = ProductSize.objects.create(product=product, size='M')
        color = ProductColor.objects.create(product=product, color_name='Red')
        ProductVariant.objects.create(product=product, size=size, color=color, stock_quantity=5)
        return product

    def test_list_view_returns_expected_number_of_queries(self):
        for i in range(3):
            self._create_fully_populated_product(f'Product {i}')

        # 1 count + 1 product-select (category joined) + 4 prefetches
        # (images, sizes, colors, variants-with-size/color-joined) = 6, no matter how
        # many products/images/sizes/colors/variants exist.
        with self.assertNumQueries(6):
            response = self.client.get('/api/products/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_detail_view_returns_expected_number_of_queries(self):
        product = self._create_fully_populated_product('Solo Product')

        # Same as the list view but without the pagination count query.
        with self.assertNumQueries(5):
            response = self.client.get(f'/api/products/{product.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_list_view_query_count_does_not_scale_with_product_count(self):
        for i in range(2):
            self._create_fully_populated_product(f'Small {i}')
        with CaptureQueriesContext(connection) as small_dataset:
            self.client.get('/api/products/')

        for i in range(6):
            self._create_fully_populated_product(f'Large {i}')
        with CaptureQueriesContext(connection) as large_dataset:
            self.client.get('/api/products/')

        self.assertEqual(len(small_dataset.captured_queries), len(large_dataset.captured_queries))


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


@override_settings(MEDIA_ROOT=TEST_MEDIA_ROOT)
class ProductImageTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEST_MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        self.category = Category.objects.create(name='Gadgets')
        self.product = Product.objects.create(
            name='Camera',
            description='A camera',
            price='199.99',
            category=self.category,
        )

    def make_image_file(self, name='test.gif'):
        return SimpleUploadedFile(name, TINY_GIF, content_type='image/gif')

    def test_product_image_creation(self):
        image = ProductImage.objects.create(
            product=self.product,
            image=self.make_image_file(),
            alt_text='A camera photo',
        )
        self.assertTrue(image.image.name)
        self.assertEqual(image.alt_text, 'A camera photo')
        self.assertFalse(image.is_primary)

    def test_product_image_belongs_to_correct_product(self):
        image = ProductImage.objects.create(
            product=self.product,
            image=self.make_image_file(),
        )
        self.assertEqual(image.product, self.product)
        self.assertIn(image, self.product.images.all())

    def test_deleting_product_deletes_its_images(self):
        image = ProductImage.objects.create(
            product=self.product,
            image=self.make_image_file(),
        )
        image_id = image.id
        self.product.delete()
        self.assertFalse(ProductImage.objects.filter(id=image_id).exists())

    def test_product_api_includes_images_field(self):
        ProductImage.objects.create(
            product=self.product,
            image=self.make_image_file(),
            alt_text='A camera photo',
        )
        response = self.client.get(f'/api/products/{self.product.id}/')
        self.assertIn('images', response.data)
        self.assertEqual(len(response.data['images']), 1)
        self.assertEqual(response.data['images'][0]['alt_text'], 'A camera photo')

    def test_product_with_no_images_returns_empty_list(self):
        response = self.client.get(f'/api/products/{self.product.id}/')
        self.assertIn('images', response.data)
        self.assertEqual(response.data['images'], [])


@override_settings(MEDIA_ROOT=TEST_MEDIA_ROOT)
class MediaConfigurationTests(APITestCase):
    """Verifies uploaded media (e.g. product images) is actually reachable
    during local development, without changing any API response shape."""

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEST_MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        self.category = Category.objects.create(name='Gadgets')
        self.product = Product.objects.create(
            name='Camera',
            description='A camera',
            price='199.99',
            category=self.category,
        )

    def test_static_helper_serves_media_when_debug_is_true(self):
        with override_settings(DEBUG=True):
            patterns = static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
        self.assertTrue(len(patterns) > 0)

    def test_static_helper_serves_nothing_when_debug_is_false(self):
        with override_settings(DEBUG=False):
            patterns = static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
        self.assertEqual(patterns, [])

    def test_uploaded_image_is_retrievable_from_media_root(self):
        image = ProductImage.objects.create(
            product=self.product,
            image=SimpleUploadedFile('camera.gif', TINY_GIF, content_type='image/gif'),
        )

        request = RequestFactory().get(f'{settings.MEDIA_URL}{image.image.name}')
        response = static_serve(
            request,
            path=image.image.name,
            document_root=settings.MEDIA_ROOT,
        )
        self.assertEqual(response.status_code, 200)

    def test_image_field_url_uses_configured_media_url(self):
        ProductImage.objects.create(
            product=self.product,
            image=SimpleUploadedFile('camera.gif', TINY_GIF, content_type='image/gif'),
        )
        response = self.client.get(f'/api/products/{self.product.id}/')
        image_url = response.data['images'][0]['image']
        self.assertIn(settings.MEDIA_URL, image_url)


class ProductSizeTests(APITestCase):
    def setUp(self):
        self.category = Category.objects.create(name='Apparel')
        self.product = Product.objects.create(
            name='T-Shirt',
            description='A t-shirt',
            price='25.00',
            category=self.category,
        )
        self.other_product = Product.objects.create(
            name='Hoodie',
            description='A hoodie',
            price='55.00',
            category=self.category,
        )

    def test_size_variant_creation(self):
        size = ProductSize.objects.create(
            product=self.product,
            size='M',
            stock_quantity=10,
        )
        self.assertEqual(size.size, 'M')
        self.assertEqual(size.stock_quantity, 10)
        self.assertTrue(size.is_active)

    def test_product_size_belongs_to_correct_product(self):
        size = ProductSize.objects.create(product=self.product, size='L')
        self.assertEqual(size.product, self.product)
        self.assertIn(size, self.product.sizes.all())

    def test_duplicate_size_for_same_product_is_rejected(self):
        ProductSize.objects.create(product=self.product, size='M')
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ProductSize.objects.create(product=self.product, size='M')

    def test_same_size_can_exist_for_different_products(self):
        ProductSize.objects.create(product=self.product, size='M')
        other_size = ProductSize.objects.create(product=self.other_product, size='M')
        self.assertEqual(other_size.size, 'M')
        self.assertEqual(other_size.product, self.other_product)

    def test_negative_stock_quantity_is_rejected(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ProductSize.objects.create(
                    product=self.product,
                    size='S',
                    stock_quantity=-1,
                )

    def test_product_api_includes_sizes(self):
        ProductSize.objects.create(product=self.product, size='M', stock_quantity=5)
        response = self.client.get(f'/api/products/{self.product.id}/')
        self.assertIn('sizes', response.data)
        self.assertEqual(len(response.data['sizes']), 1)
        self.assertEqual(response.data['sizes'][0]['size'], 'M')
        self.assertEqual(response.data['sizes'][0]['stock_quantity'], 5)

    def test_product_with_no_sizes_returns_empty_sizes_list(self):
        response = self.client.get(f'/api/products/{self.product.id}/')
        self.assertIn('sizes', response.data)
        self.assertEqual(response.data['sizes'], [])

    def test_deleting_product_deletes_its_size_variants(self):
        size = ProductSize.objects.create(product=self.product, size='M')
        size_id = size.id
        self.product.delete()
        self.assertFalse(ProductSize.objects.filter(id=size_id).exists())


class ProductColorTests(APITestCase):
    def setUp(self):
        self.category = Category.objects.create(name='Apparel')
        self.product = Product.objects.create(
            name='T-Shirt',
            description='A t-shirt',
            price='25.00',
            category=self.category,
        )
        self.other_product = Product.objects.create(
            name='Hoodie',
            description='A hoodie',
            price='55.00',
            category=self.category,
        )

    def test_color_creation(self):
        color = ProductColor.objects.create(
            product=self.product,
            color_name='Red',
            hex_code='#FF0000',
        )
        self.assertEqual(color.color_name, 'Red')
        self.assertEqual(color.hex_code, '#FF0000')
        self.assertTrue(color.is_active)

    def test_hex_code_is_optional(self):
        color = ProductColor.objects.create(product=self.product, color_name='Red')
        self.assertEqual(color.hex_code, '')

    def test_invalid_hex_code_format_is_rejected(self):
        color = ProductColor(
            product=self.product,
            color_name='Red',
            hex_code='not-a-hex',
        )
        with self.assertRaises(ValidationError):
            color.full_clean()

    def test_product_color_belongs_to_correct_product(self):
        color = ProductColor.objects.create(product=self.product, color_name='Blue')
        self.assertEqual(color.product, self.product)
        self.assertIn(color, self.product.colors.all())

    def test_duplicate_color_for_same_product_is_rejected(self):
        ProductColor.objects.create(product=self.product, color_name='Red')
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ProductColor.objects.create(product=self.product, color_name='Red')

    def test_same_color_can_exist_for_different_products(self):
        ProductColor.objects.create(product=self.product, color_name='Red')
        other_color = ProductColor.objects.create(product=self.other_product, color_name='Red')
        self.assertEqual(other_color.color_name, 'Red')
        self.assertEqual(other_color.product, self.other_product)

    def test_product_api_includes_colors(self):
        ProductColor.objects.create(
            product=self.product,
            color_name='Red',
            hex_code='#FF0000',
        )
        response = self.client.get(f'/api/products/{self.product.id}/')
        self.assertIn('colors', response.data)
        self.assertEqual(len(response.data['colors']), 1)
        self.assertEqual(response.data['colors'][0]['color_name'], 'Red')
        self.assertEqual(response.data['colors'][0]['hex_code'], '#FF0000')

    def test_product_with_no_colors_returns_empty_colors_list(self):
        response = self.client.get(f'/api/products/{self.product.id}/')
        self.assertIn('colors', response.data)
        self.assertEqual(response.data['colors'], [])

    def test_deleting_product_deletes_its_colors(self):
        color = ProductColor.objects.create(product=self.product, color_name='Red')
        color_id = color.id
        self.product.delete()
        self.assertFalse(ProductColor.objects.filter(id=color_id).exists())


class ProductVariantTests(APITestCase):
    def setUp(self):
        self.category = Category.objects.create(name='Apparel')
        self.product = Product.objects.create(
            name='T-Shirt',
            description='A t-shirt',
            price='25.00',
            category=self.category,
        )
        self.other_product = Product.objects.create(
            name='Hoodie',
            description='A hoodie',
            price='55.00',
            category=self.category,
        )
        self.size = ProductSize.objects.create(product=self.product, size='M')
        self.color = ProductColor.objects.create(product=self.product, color_name='Red')

    def test_variant_creation_with_size_and_color(self):
        variant = ProductVariant.objects.create(
            product=self.product,
            size=self.size,
            color=self.color,
            stock_quantity=5,
        )
        self.assertEqual(variant.size, self.size)
        self.assertEqual(variant.color, self.color)
        self.assertEqual(variant.stock_quantity, 5)
        self.assertTrue(variant.is_active)

    def test_size_only_variant_creation(self):
        variant = ProductVariant.objects.create(
            product=self.product,
            size=self.size,
            stock_quantity=10,
        )
        self.assertEqual(variant.size, self.size)
        self.assertIsNone(variant.color)

    def test_color_only_variant_creation(self):
        variant = ProductVariant.objects.create(
            product=self.product,
            color=self.color,
            stock_quantity=8,
        )
        self.assertIsNone(variant.size)
        self.assertEqual(variant.color, self.color)

    def test_variant_without_size_and_color_is_rejected(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ProductVariant.objects.create(product=self.product)

    def test_variant_belongs_to_correct_product(self):
        variant = ProductVariant.objects.create(product=self.product, size=self.size)
        self.assertEqual(variant.product, self.product)
        self.assertIn(variant, self.product.variants.all())

    def test_size_from_different_product_is_rejected(self):
        variant = ProductVariant(product=self.other_product, size=self.size)
        with self.assertRaises(ValidationError):
            variant.full_clean()

    def test_color_from_different_product_is_rejected(self):
        variant = ProductVariant(product=self.other_product, color=self.color)
        with self.assertRaises(ValidationError):
            variant.full_clean()

    def test_duplicate_size_and_color_is_rejected(self):
        ProductVariant.objects.create(product=self.product, size=self.size, color=self.color)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ProductVariant.objects.create(product=self.product, size=self.size, color=self.color)

    def test_duplicate_size_only_is_rejected(self):
        ProductVariant.objects.create(product=self.product, size=self.size)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ProductVariant.objects.create(product=self.product, size=self.size)

    def test_duplicate_color_only_is_rejected(self):
        ProductVariant.objects.create(product=self.product, color=self.color)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ProductVariant.objects.create(product=self.product, color=self.color)

    def test_same_size_color_combination_allowed_for_different_products(self):
        ProductVariant.objects.create(product=self.product, size=self.size, color=self.color)

        other_size = ProductSize.objects.create(product=self.other_product, size='M')
        other_color = ProductColor.objects.create(product=self.other_product, color_name='Red')
        other_variant = ProductVariant.objects.create(
            product=self.other_product,
            size=other_size,
            color=other_color,
        )
        self.assertEqual(other_variant.product, self.other_product)

    def test_negative_stock_quantity_is_rejected(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ProductVariant.objects.create(
                    product=self.product,
                    size=self.size,
                    stock_quantity=-1,
                )

    def test_deleting_product_deletes_its_variants(self):
        variant = ProductVariant.objects.create(product=self.product, size=self.size)
        variant_id = variant.id
        self.product.delete()
        self.assertFalse(ProductVariant.objects.filter(id=variant_id).exists())

    def test_deleting_size_deletes_dependent_variants(self):
        variant = ProductVariant.objects.create(
            product=self.product,
            size=self.size,
            color=self.color,
        )
        variant_id = variant.id
        self.size.delete()
        self.assertFalse(ProductVariant.objects.filter(id=variant_id).exists())

    def test_deleting_color_deletes_dependent_variants(self):
        variant = ProductVariant.objects.create(
            product=self.product,
            size=self.size,
            color=self.color,
        )
        variant_id = variant.id
        self.color.delete()
        self.assertFalse(ProductVariant.objects.filter(id=variant_id).exists())

    def test_product_api_includes_variants(self):
        ProductVariant.objects.create(
            product=self.product,
            size=self.size,
            color=self.color,
            sku='TSHIRT-RED-M',
            stock_quantity=5,
        )
        response = self.client.get(f'/api/products/{self.product.id}/')
        self.assertIn('variants', response.data)
        self.assertEqual(len(response.data['variants']), 1)
        variant_data = response.data['variants'][0]
        self.assertEqual(variant_data['size']['size'], 'M')
        self.assertEqual(variant_data['color']['color_name'], 'Red')
        self.assertEqual(variant_data['sku'], 'TSHIRT-RED-M')
        self.assertEqual(variant_data['stock_quantity'], 5)
        self.assertTrue(variant_data['is_active'])

    def test_product_with_no_variants_returns_empty_list(self):
        response = self.client.get(f'/api/products/{self.product.id}/')
        self.assertIn('variants', response.data)
        self.assertEqual(response.data['variants'], [])


class CartTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='cartuser',
            email='cartuser@nostra.com',
            password='CartPass@2026!',
        )

    def test_cart_creation_and_user_relationship(self):
        cart = Cart.objects.create(user=self.user)
        self.assertEqual(cart.user, self.user)
        self.assertEqual(self.user.cart, cart)
        self.assertIsNotNone(cart.created_at)
        self.assertIsNotNone(cart.updated_at)

    def test_user_cannot_have_more_than_one_cart(self):
        Cart.objects.create(user=self.user)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Cart.objects.create(user=self.user)

    def test_deleting_user_deletes_cart(self):
        cart = Cart.objects.create(user=self.user)
        cart_id = cart.id
        self.user.delete()
        self.assertFalse(Cart.objects.filter(id=cart_id).exists())


class CartItemTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='cartuser',
            email='cartuser@nostra.com',
            password='CartPass@2026!',
        )
        self.cart = Cart.objects.create(user=self.user)

        self.category = Category.objects.create(name='Apparel')
        self.product = Product.objects.create(
            name='T-Shirt',
            description='A t-shirt',
            price='25.00',
            category=self.category,
        )
        self.size = ProductSize.objects.create(product=self.product, size='M')
        self.color = ProductColor.objects.create(product=self.product, color_name='Red')
        self.variant = ProductVariant.objects.create(
            product=self.product,
            size=self.size,
            color=self.color,
            stock_quantity=10,
        )

    def test_cart_item_creation_and_relationships(self):
        item = CartItem.objects.create(cart=self.cart, variant=self.variant, quantity=2)
        self.assertEqual(item.cart, self.cart)
        self.assertEqual(item.variant, self.variant)
        self.assertEqual(item.quantity, 2)
        self.assertIn(item, self.cart.items.all())
        self.assertIn(item, self.variant.cart_items.all())

    def test_quantity_defaults_to_one(self):
        item = CartItem.objects.create(cart=self.cart, variant=self.variant)
        self.assertEqual(item.quantity, 1)

    def test_zero_quantity_is_rejected(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                CartItem.objects.create(cart=self.cart, variant=self.variant, quantity=0)

    def test_negative_quantity_is_rejected(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                CartItem.objects.create(cart=self.cart, variant=self.variant, quantity=-1)

    def test_duplicate_cart_item_for_same_variant_is_rejected(self):
        CartItem.objects.create(cart=self.cart, variant=self.variant, quantity=1)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                CartItem.objects.create(cart=self.cart, variant=self.variant, quantity=1)

    def test_same_variant_can_exist_in_different_carts(self):
        CartItem.objects.create(cart=self.cart, variant=self.variant, quantity=1)

        other_user = User.objects.create_user(
            username='othercart',
            email='othercart@nostra.com',
            password='CartPass@2026!',
        )
        other_cart = Cart.objects.create(user=other_user)
        other_item = CartItem.objects.create(cart=other_cart, variant=self.variant, quantity=3)
        self.assertEqual(other_item.variant, self.variant)

    def test_deleting_cart_deletes_its_items(self):
        item = CartItem.objects.create(cart=self.cart, variant=self.variant, quantity=1)
        item_id = item.id
        self.cart.delete()
        self.assertFalse(CartItem.objects.filter(id=item_id).exists())

    def test_deleting_variant_deletes_dependent_cart_items(self):
        item = CartItem.objects.create(cart=self.cart, variant=self.variant, quantity=1)
        item_id = item.id
        self.variant.delete()
        self.assertFalse(CartItem.objects.filter(id=item_id).exists())


class CartSerializerTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='cartserializeruser',
            email='cartserializer@nostra.com',
            password='CartPass@2026!',
        )
        self.cart = Cart.objects.create(user=self.user)

        self.category = Category.objects.create(name='Apparel')
        self.product = Product.objects.create(
            name='T-Shirt',
            description='A t-shirt',
            price='25.00',
            category=self.category,
        )
        self.size = ProductSize.objects.create(product=self.product, size='M')
        self.color = ProductColor.objects.create(product=self.product, color_name='Red')
        self.variant = ProductVariant.objects.create(
            product=self.product,
            size=self.size,
            color=self.color,
            sku='TSHIRT-RED-M',
            stock_quantity=10,
        )
        self.item = CartItem.objects.create(cart=self.cart, variant=self.variant, quantity=2)

    def test_cart_serialization_includes_expected_fields(self):
        data = CartSerializer(self.cart).data
        self.assertEqual(set(data.keys()), {'id', 'items', 'created_at', 'updated_at'})
        self.assertEqual(data['id'], self.cart.id)
        self.assertEqual(len(data['items']), 1)

    def test_cart_with_no_items_serializes_empty_items_list(self):
        other_user = User.objects.create_user(
            username='emptycartuser',
            email='emptycart@nostra.com',
            password='CartPass@2026!',
        )
        empty_cart = Cart.objects.create(user=other_user)
        data = CartSerializer(empty_cart).data
        self.assertEqual(data['items'], [])

    def test_cart_serializer_does_not_expose_user_field(self):
        data = CartSerializer(self.cart).data
        self.assertNotIn('user', data)

    def test_cart_serializer_user_is_not_writable(self):
        serializer = CartSerializer(data={
            'user': self.user.id,
            'items': [],
        })
        self.assertNotIn('user', serializer.fields)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertNotIn('user', serializer.validated_data)

    def test_cart_item_serialization_includes_expected_fields(self):
        data = CartItemSerializer(self.item).data
        self.assertEqual(set(data.keys()), {'id', 'variant', 'quantity', 'created_at', 'updated_at'})
        self.assertEqual(data['id'], self.item.id)
        self.assertEqual(data['quantity'], 2)

    def test_cart_item_serialization_includes_nested_variant_product_size_color(self):
        data = CartItemSerializer(self.item).data
        variant_data = data['variant']

        self.assertEqual(variant_data['id'], self.variant.id)
        self.assertEqual(variant_data['sku'], 'TSHIRT-RED-M')
        self.assertEqual(variant_data['stock_quantity'], 10)
        self.assertTrue(variant_data['is_active'])

        self.assertEqual(variant_data['product']['id'], self.product.id)
        self.assertEqual(variant_data['product']['name'], 'T-Shirt')
        self.assertEqual(variant_data['product']['price'], '25.00')

        self.assertEqual(variant_data['size']['size'], 'M')
        self.assertEqual(variant_data['color']['color_name'], 'Red')


class CartDetailViewTests(APITestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = User.objects.create_user(
            username='cartviewuser',
            email='cartview@nostra.com',
            password='CartPass@2026!',
        )

    def test_unauthenticated_access_is_rejected(self):
        request = self.factory.get('/api/cart/')
        response = CartDetailView.as_view()(request)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_authenticated_user_gets_their_own_cart(self):
        cart = Cart.objects.create(user=self.user)
        request = self.factory.get('/api/cart/')
        force_authenticate(request, user=self.user)
        response = CartDetailView.as_view()(request)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], cart.id)

    def test_cart_is_auto_created_when_missing(self):
        self.assertFalse(Cart.objects.filter(user=self.user).exists())
        request = self.factory.get('/api/cart/')
        force_authenticate(request, user=self.user)
        response = CartDetailView.as_view()(request)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(Cart.objects.filter(user=self.user).exists())


class CartAddItemViewTests(APITestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = User.objects.create_user(
            username='additemuser',
            email='additem@nostra.com',
            password='CartPass@2026!',
        )
        self.category = Category.objects.create(name='Apparel')
        self.product = Product.objects.create(
            name='T-Shirt',
            description='A t-shirt',
            price='25.00',
            category=self.category,
        )
        self.size = ProductSize.objects.create(product=self.product, size='M')
        self.color = ProductColor.objects.create(product=self.product, color_name='Red')
        self.variant = ProductVariant.objects.create(
            product=self.product,
            size=self.size,
            color=self.color,
            stock_quantity=10,
        )

    def post_add_item(self, data, user=None):
        request = self.factory.post('/api/cart/items/', data, format='json')
        force_authenticate(request, user=user or self.user)
        return CartAddItemView.as_view()(request)

    def test_unauthenticated_access_is_rejected(self):
        request = self.factory.post(
            '/api/cart/items/',
            {'variant_id': self.variant.id, 'quantity': 1},
            format='json',
        )
        response = CartAddItemView.as_view()(request)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_add_item_successfully(self):
        response = self.post_add_item({'variant_id': self.variant.id, 'quantity': 2})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['quantity'], 2)
        item = CartItem.objects.get(cart__user=self.user, variant=self.variant)
        self.assertEqual(item.quantity, 2)

    def test_add_item_with_invalid_quantity_is_rejected(self):
        response = self.post_add_item({'variant_id': self.variant.id, 'quantity': 0})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(CartItem.objects.filter(variant=self.variant).exists())

    def test_inactive_variant_is_rejected(self):
        self.variant.is_active = False
        self.variant.save(update_fields=['is_active'])
        response = self.post_add_item({'variant_id': self.variant.id, 'quantity': 1})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(CartItem.objects.filter(variant=self.variant).exists())

    def test_inactive_product_is_rejected(self):
        self.product.is_active = False
        self.product.save(update_fields=['is_active'])
        response = self.post_add_item({'variant_id': self.variant.id, 'quantity': 1})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(CartItem.objects.filter(variant=self.variant).exists())

    def test_quantity_cannot_exceed_stock(self):
        response = self.post_add_item({'variant_id': self.variant.id, 'quantity': 11})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(CartItem.objects.filter(variant=self.variant).exists())

    def test_adding_same_variant_updates_existing_item_instead_of_duplicating(self):
        first = self.post_add_item({'variant_id': self.variant.id, 'quantity': 3})
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        second = self.post_add_item({'variant_id': self.variant.id, 'quantity': 2})
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second.data['quantity'], 5)

        self.assertEqual(
            CartItem.objects.filter(cart__user=self.user, variant=self.variant).count(), 1,
        )
        item = CartItem.objects.get(cart__user=self.user, variant=self.variant)
        self.assertEqual(item.quantity, 5)

    def test_adding_same_variant_beyond_stock_is_rejected(self):
        self.post_add_item({'variant_id': self.variant.id, 'quantity': 8})
        response = self.post_add_item({'variant_id': self.variant.id, 'quantity': 5})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        item = CartItem.objects.get(cart__user=self.user, variant=self.variant)
        self.assertEqual(item.quantity, 8)


class CartItemDetailViewTests(APITestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = User.objects.create_user(
            username='itemdetailuser',
            email='itemdetail@nostra.com',
            password='CartPass@2026!',
        )
        self.other_user = User.objects.create_user(
            username='otherdetailuser',
            email='otherdetail@nostra.com',
            password='CartPass@2026!',
        )
        self.cart = Cart.objects.create(user=self.user)
        Cart.objects.create(user=self.other_user)

        self.category = Category.objects.create(name='Apparel')
        self.product = Product.objects.create(
            name='T-Shirt',
            description='A t-shirt',
            price='25.00',
            category=self.category,
        )
        self.size = ProductSize.objects.create(product=self.product, size='M')
        self.variant = ProductVariant.objects.create(
            product=self.product,
            size=self.size,
            stock_quantity=10,
        )
        self.item = CartItem.objects.create(cart=self.cart, variant=self.variant, quantity=2)

    def patch_item(self, item_id, data, user):
        request = self.factory.patch(f'/api/cart/items/{item_id}/', data, format='json')
        force_authenticate(request, user=user)
        return CartItemDetailView.as_view()(request, pk=item_id)

    def delete_item(self, item_id, user):
        request = self.factory.delete(f'/api/cart/items/{item_id}/')
        force_authenticate(request, user=user)
        return CartItemDetailView.as_view()(request, pk=item_id)

    def test_unauthenticated_cannot_update_cart_item(self):
        request = self.factory.patch(
            f'/api/cart/items/{self.item.id}/', {'quantity': 3}, format='json',
        )
        response = CartItemDetailView.as_view()(request, pk=self.item.id)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_update_cart_item_quantity(self):
        response = self.patch_item(self.item.id, {'quantity': 5}, user=self.user)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['quantity'], 5)
        self.item.refresh_from_db()
        self.assertEqual(self.item.quantity, 5)

    def test_update_quantity_beyond_stock_is_rejected(self):
        response = self.patch_item(self.item.id, {'quantity': 11}, user=self.user)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.item.refresh_from_db()
        self.assertEqual(self.item.quantity, 2)

    def test_update_quantity_below_one_is_rejected(self):
        response = self.patch_item(self.item.id, {'quantity': 0}, user=self.user)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.item.refresh_from_db()
        self.assertEqual(self.item.quantity, 2)

    def test_remove_cart_item(self):
        response = self.delete_item(self.item.id, user=self.user)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(CartItem.objects.filter(id=self.item.id).exists())

    def test_user_cannot_access_another_users_cart_item(self):
        patch_response = self.patch_item(self.item.id, {'quantity': 3}, user=self.other_user)
        self.assertEqual(patch_response.status_code, status.HTTP_404_NOT_FOUND)
        self.item.refresh_from_db()
        self.assertEqual(self.item.quantity, 2)

        delete_response = self.delete_item(self.item.id, user=self.other_user)
        self.assertEqual(delete_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(CartItem.objects.filter(id=self.item.id).exists())


class CartURLRoutingTests(APITestCase):
    def test_cart_detail_url_resolves_to_cart_detail_view(self):
        match = resolve('/api/products/cart/')
        self.assertEqual(match.func.cls, CartDetailView)

    def test_cart_add_item_url_resolves_to_cart_add_item_view(self):
        match = resolve('/api/products/cart/items/')
        self.assertEqual(match.func.cls, CartAddItemView)

    def test_cart_item_detail_url_resolves_to_cart_item_detail_view(self):
        match = resolve('/api/products/cart/items/5/')
        self.assertEqual(match.func.cls, CartItemDetailView)
        self.assertEqual(match.kwargs, {'pk': 5})

    def test_cart_detail_endpoint_is_reachable(self):
        response = self.client.get('/api/products/cart/')
        self.assertNotEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_cart_add_item_endpoint_is_reachable(self):
        response = self.client.post('/api/products/cart/items/', {}, format='json')
        self.assertNotEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_cart_item_detail_endpoint_is_reachable(self):
        response = self.client.patch('/api/products/cart/items/1/', {}, format='json')
        self.assertNotEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_existing_product_and_category_urls_are_unaffected(self):
        self.assertEqual(resolve('/api/products/').func.cls, ProductListView)
        self.assertEqual(resolve('/api/products/categories/').func.cls, CategoryListView)


class WishlistItemSerializerTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='wishlistuser',
            email='wishlistuser@nostra.com',
            password='WishlistPass@2026!',
        )
        self.category = Category.objects.create(name='Apparel')
        self.product = Product.objects.create(
            name='T-Shirt',
            description='A t-shirt',
            price='25.00',
            category=self.category,
        )
        self.item = WishlistItem.objects.create(user=self.user, product=self.product)

    def test_wishlist_item_serializes_correctly(self):
        data = WishlistItemSerializer(self.item).data
        self.assertEqual(set(data.keys()), {'id', 'product', 'created_at', 'updated_at'})
        self.assertEqual(data['id'], self.item.id)

    def test_user_is_not_exposed_as_writable_input(self):
        data = WishlistItemSerializer(self.item).data
        self.assertNotIn('user', data)

        serializer = WishlistItemSerializer(data={
            'user': self.user.id,
            'product': self.product.id,
        })
        self.assertNotIn('user', serializer.fields)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertNotIn('user', serializer.validated_data)

    def test_product_details_are_included(self):
        data = WishlistItemSerializer(self.item).data
        self.assertEqual(data['product']['id'], self.product.id)
        self.assertEqual(data['product']['name'], 'T-Shirt')
        self.assertEqual(data['product']['price'], '25.00')


class WishlistListCreateViewTests(APITestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = User.objects.create_user(
            username='wishlistviewuser',
            email='wishlistview@nostra.com',
            password='WishlistPass@2026!',
        )
        self.other_user = User.objects.create_user(
            username='otherwishlistuser',
            email='otherwishlist@nostra.com',
            password='WishlistPass@2026!',
        )
        self.category = Category.objects.create(name='Apparel')
        self.product = Product.objects.create(
            name='T-Shirt',
            description='A t-shirt',
            price='25.00',
            category=self.category,
        )

    def get_wishlist(self, user):
        request = self.factory.get('/api/products/wishlist/')
        force_authenticate(request, user=user)
        return WishlistListCreateView.as_view()(request)

    def post_wishlist(self, data, user):
        request = self.factory.post('/api/products/wishlist/', data, format='json')
        force_authenticate(request, user=user)
        return WishlistListCreateView.as_view()(request)

    def test_unauthenticated_access_is_rejected(self):
        request = self.factory.get('/api/products/wishlist/')
        response = WishlistListCreateView.as_view()(request)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unauthenticated_cannot_add_item(self):
        request = self.factory.post(
            '/api/products/wishlist/', {'product_id': self.product.id}, format='json',
        )
        response = WishlistListCreateView.as_view()(request)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_empty_wishlist_returns_empty_list(self):
        response = self.get_wishlist(self.user)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_add_wishlist_item(self):
        response = self.post_wishlist({'product_id': self.product.id}, user=self.user)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['product']['id'], self.product.id)
        self.assertTrue(WishlistItem.objects.filter(user=self.user, product=self.product).exists())

    def test_duplicate_wishlist_item_is_rejected(self):
        WishlistItem.objects.create(user=self.user, product=self.product)
        response = self.post_wishlist({'product_id': self.product.id}, user=self.user)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            WishlistItem.objects.filter(user=self.user, product=self.product).count(), 1,
        )

    def test_inactive_product_cannot_be_wishlisted(self):
        self.product.is_active = False
        self.product.save(update_fields=['is_active'])
        response = self.post_wishlist({'product_id': self.product.id}, user=self.user)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(WishlistItem.objects.filter(user=self.user, product=self.product).exists())

    def test_list_only_returns_current_users_items(self):
        WishlistItem.objects.create(user=self.user, product=self.product)

        other_product = Product.objects.create(
            name='Hoodie',
            description='A hoodie',
            price='55.00',
            category=self.category,
        )
        WishlistItem.objects.create(user=self.other_user, product=other_product)

        response = self.get_wishlist(self.user)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['product']['id'], self.product.id)


class WishlistItemDeleteViewTests(APITestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = User.objects.create_user(
            username='wishlistdeleteuser',
            email='wishlistdelete@nostra.com',
            password='WishlistPass@2026!',
        )
        self.other_user = User.objects.create_user(
            username='otherwishlistdeleteuser',
            email='otherwishlistdelete@nostra.com',
            password='WishlistPass@2026!',
        )
        self.category = Category.objects.create(name='Apparel')
        self.product = Product.objects.create(
            name='T-Shirt',
            description='A t-shirt',
            price='25.00',
            category=self.category,
        )
        self.item = WishlistItem.objects.create(user=self.user, product=self.product)

    def delete_item(self, item_id, user):
        request = self.factory.delete(f'/api/products/wishlist/{item_id}/')
        force_authenticate(request, user=user)
        return WishlistItemDeleteView.as_view()(request, pk=item_id)

    def test_unauthenticated_cannot_delete(self):
        request = self.factory.delete(f'/api/products/wishlist/{self.item.id}/')
        response = WishlistItemDeleteView.as_view()(request, pk=self.item.id)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_another_user_cannot_delete_someone_elses_item(self):
        response = self.delete_item(self.item.id, user=self.other_user)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(WishlistItem.objects.filter(id=self.item.id).exists())

    def test_successful_delete(self):
        response = self.delete_item(self.item.id, user=self.user)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(WishlistItem.objects.filter(id=self.item.id).exists())


class AddressSerializerTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='addressuser',
            email='addressuser@nostra.com',
            password='AddressPass@2026!',
        )
        self.address = Address.objects.create(
            user=self.user,
            full_name='Jane Doe',
            phone='9876543210',
            address_line1='123 Main St',
            address_line2='Apt 4B',
            city='Chennai',
            state='Tamil Nadu',
            postal_code='600001',
            is_default=True,
        )

    def valid_input_data(self, **overrides):
        data = {
            'user': self.user.id,
            'full_name': 'Jane Doe',
            'phone': '9876543210',
            'address_line1': '123 Main St',
            'city': 'Chennai',
            'state': 'Tamil Nadu',
            'postal_code': '600001',
        }
        data.update(overrides)
        return data

    def test_all_expected_fields_are_serialized(self):
        data = AddressSerializer(self.address).data
        self.assertEqual(
            set(data.keys()),
            {
                'id', 'full_name', 'phone', 'address_line1', 'address_line2',
                'city', 'state', 'postal_code', 'country', 'is_default',
                'created_at', 'updated_at',
            },
        )

    def test_user_is_not_exposed(self):
        data = AddressSerializer(self.address).data
        self.assertNotIn('user', data)

    def test_user_cannot_be_supplied_as_writable_input(self):
        serializer = AddressSerializer(data=self.valid_input_data())
        self.assertNotIn('user', serializer.fields)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertNotIn('user', serializer.validated_data)

    def test_address_details_serialize_correctly(self):
        data = AddressSerializer(self.address).data
        self.assertEqual(data['id'], self.address.id)
        self.assertEqual(data['full_name'], 'Jane Doe')
        self.assertEqual(data['phone'], '9876543210')
        self.assertEqual(data['address_line1'], '123 Main St')
        self.assertEqual(data['address_line2'], 'Apt 4B')
        self.assertEqual(data['city'], 'Chennai')
        self.assertEqual(data['state'], 'Tamil Nadu')
        self.assertEqual(data['postal_code'], '600001')
        self.assertEqual(data['country'], 'India')
        self.assertTrue(data['is_default'])


class AddressListCreateViewTests(APITestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = User.objects.create_user(
            username='addressviewuser',
            email='addressview@nostra.com',
            password='AddressPass@2026!',
        )
        self.other_user = User.objects.create_user(
            username='otheraddressuser',
            email='otheraddress@nostra.com',
            password='AddressPass@2026!',
        )

    def valid_address_data(self, **overrides):
        data = {
            'full_name': 'Jane Doe',
            'phone': '9876543210',
            'address_line1': '123 Main St',
            'city': 'Chennai',
            'state': 'Tamil Nadu',
            'postal_code': '600001',
        }
        data.update(overrides)
        return data

    def get_addresses(self, user):
        request = self.factory.get('/api/products/addresses/')
        force_authenticate(request, user=user)
        return AddressListCreateView.as_view()(request)

    def post_address(self, data, user):
        request = self.factory.post('/api/products/addresses/', data, format='json')
        force_authenticate(request, user=user)
        return AddressListCreateView.as_view()(request)

    def test_unauthenticated_access_is_rejected(self):
        request = self.factory.get('/api/products/addresses/')
        response = AddressListCreateView.as_view()(request)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unauthenticated_cannot_create(self):
        request = self.factory.post(
            '/api/products/addresses/', self.valid_address_data(), format='json',
        )
        response = AddressListCreateView.as_view()(request)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_empty_address_list(self):
        response = self.get_addresses(self.user)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_create_normal_address(self):
        response = self.post_address(self.valid_address_data(), user=self.user)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['full_name'], 'Jane Doe')
        self.assertFalse(response.data['is_default'])
        address = Address.objects.get(user=self.user)
        self.assertEqual(address.full_name, 'Jane Doe')

    def test_create_default_address(self):
        response = self.post_address(self.valid_address_data(is_default=True), user=self.user)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['is_default'])
        address = Address.objects.get(user=self.user)
        self.assertTrue(address.is_default)

    def test_creating_new_default_unsets_previous_default(self):
        first = self.post_address(self.valid_address_data(is_default=True), user=self.user)
        self.assertTrue(first.data['is_default'])

        second = self.post_address(
            self.valid_address_data(full_name='John Smith', is_default=True), user=self.user,
        )
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertTrue(second.data['is_default'])

        first_address = Address.objects.get(id=first.data['id'])
        second_address = Address.objects.get(id=second.data['id'])
        self.assertFalse(first_address.is_default)
        self.assertTrue(second_address.is_default)

    def test_list_only_returns_current_users_addresses(self):
        self.post_address(self.valid_address_data(), user=self.user)
        self.post_address(self.valid_address_data(full_name='Other'), user=self.other_user)

        response = self.get_addresses(self.user)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['full_name'], 'Jane Doe')

    def test_default_address_is_listed_first(self):
        self.post_address(self.valid_address_data(full_name='First'), user=self.user)
        default_response = self.post_address(
            self.valid_address_data(full_name='Default One', is_default=True), user=self.user,
        )
        response = self.get_addresses(self.user)
        self.assertEqual(response.data[0]['id'], default_response.data['id'])
        self.assertTrue(response.data[0]['is_default'])


class AddressDetailViewTests(APITestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = User.objects.create_user(
            username='addressdetailuser',
            email='addressdetail@nostra.com',
            password='AddressPass@2026!',
        )
        self.other_user = User.objects.create_user(
            username='otheraddressdetailuser',
            email='otheraddressdetail@nostra.com',
            password='AddressPass@2026!',
        )
        self.address = Address.objects.create(
            user=self.user,
            full_name='Jane Doe',
            phone='9876543210',
            address_line1='123 Main St',
            city='Chennai',
            state='Tamil Nadu',
            postal_code='600001',
        )

    def get_address(self, pk, user):
        request = self.factory.get(f'/api/products/addresses/{pk}/')
        force_authenticate(request, user=user)
        return AddressDetailView.as_view()(request, pk=pk)

    def patch_address(self, pk, data, user):
        request = self.factory.patch(f'/api/products/addresses/{pk}/', data, format='json')
        force_authenticate(request, user=user)
        return AddressDetailView.as_view()(request, pk=pk)

    def delete_address(self, pk, user):
        request = self.factory.delete(f'/api/products/addresses/{pk}/')
        force_authenticate(request, user=user)
        return AddressDetailView.as_view()(request, pk=pk)

    def test_unauthenticated_cannot_retrieve(self):
        request = self.factory.get(f'/api/products/addresses/{self.address.id}/')
        response = AddressDetailView.as_view()(request, pk=self.address.id)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_retrieve_own_address(self):
        response = self.get_address(self.address.id, user=self.user)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], self.address.id)

    def test_another_user_cannot_retrieve_someone_elses_address(self):
        response = self.get_address(self.address.id, user=self.other_user)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_update_own_address(self):
        response = self.patch_address(self.address.id, {'city': 'Bengaluru'}, user=self.user)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['city'], 'Bengaluru')
        self.address.refresh_from_db()
        self.assertEqual(self.address.city, 'Bengaluru')

    def test_setting_updated_address_as_default_unsets_previous_default(self):
        other_default = Address.objects.create(
            user=self.user,
            full_name='Old Default',
            phone='9876543211',
            address_line1='456 Second St',
            city='Chennai',
            state='Tamil Nadu',
            postal_code='600002',
            is_default=True,
        )

        response = self.patch_address(self.address.id, {'is_default': True}, user=self.user)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['is_default'])

        self.address.refresh_from_db()
        other_default.refresh_from_db()
        self.assertTrue(self.address.is_default)
        self.assertFalse(other_default.is_default)

    def test_another_user_cannot_update_someone_elses_address(self):
        response = self.patch_address(self.address.id, {'city': 'Mumbai'}, user=self.other_user)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.address.refresh_from_db()
        self.assertEqual(self.address.city, 'Chennai')

    def test_delete_own_address(self):
        response = self.delete_address(self.address.id, user=self.user)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Address.objects.filter(id=self.address.id).exists())

    def test_another_user_cannot_delete_someone_elses_address(self):
        response = self.delete_address(self.address.id, user=self.other_user)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Address.objects.filter(id=self.address.id).exists())


class OrderModelTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='orderuser',
            email='orderuser@nostra.com',
            password='OrderPass@2026!',
        )
        self.category = Category.objects.create(name='Apparel')
        self.product = Product.objects.create(
            name='T-Shirt',
            description='A t-shirt',
            price='25.00',
            category=self.category,
        )
        self.size = ProductSize.objects.create(product=self.product, size='M')
        self.color = ProductColor.objects.create(product=self.product, color_name='Red')
        self.variant = ProductVariant.objects.create(
            product=self.product,
            size=self.size,
            color=self.color,
            stock_quantity=10,
        )

    def create_order(self, **overrides):
        data = {
            'user': self.user,
            'order_number': 'ORD-0001',
            'shipping_full_name': 'Jane Doe',
            'shipping_phone': '9876543210',
            'shipping_address_line1': '123 Main St',
            'shipping_city': 'Chennai',
            'shipping_state': 'Tamil Nadu',
            'shipping_postal_code': '600001',
            'shipping_country': 'India',
            'subtotal': '50.00',
            'total_amount': '50.00',
        }
        data.update(overrides)
        return Order.objects.create(**data)

    def test_order_created_with_default_status_pending(self):
        order = self.create_order()
        self.assertEqual(order.status, Order.Status.PENDING)

    def test_order_number_must_be_unique(self):
        self.create_order(order_number='ORD-DUP')
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self.create_order(order_number='ORD-DUP')

    def test_shipping_snapshot_fields_are_stored_correctly(self):
        order = self.create_order(
            shipping_full_name='John Smith',
            shipping_phone='9123456780',
            shipping_address_line1='456 Second St',
            shipping_address_line2='Apt 2',
            shipping_city='Bengaluru',
            shipping_state='Karnataka',
            shipping_postal_code='560001',
            shipping_country='India',
        )
        self.assertEqual(order.shipping_full_name, 'John Smith')
        self.assertEqual(order.shipping_phone, '9123456780')
        self.assertEqual(order.shipping_address_line1, '456 Second St')
        self.assertEqual(order.shipping_address_line2, 'Apt 2')
        self.assertEqual(order.shipping_city, 'Bengaluru')
        self.assertEqual(order.shipping_state, 'Karnataka')
        self.assertEqual(order.shipping_postal_code, '560001')
        self.assertEqual(order.shipping_country, 'India')

    def test_subtotal_and_total_amount_are_stored_correctly(self):
        order = self.create_order(subtotal='99.99', total_amount='109.99')
        order.refresh_from_db()
        self.assertEqual(order.subtotal, Decimal('99.99'))
        self.assertEqual(order.total_amount, Decimal('109.99'))

    def test_order_user_uses_protect_behavior(self):
        self.create_order()
        with self.assertRaises(ProtectedError):
            self.user.delete()


class OrderItemModelTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='orderitemuser',
            email='orderitemuser@nostra.com',
            password='OrderPass@2026!',
        )
        self.category = Category.objects.create(name='Apparel')
        self.product = Product.objects.create(
            name='T-Shirt',
            description='A t-shirt',
            price='25.00',
            category=self.category,
        )
        self.size = ProductSize.objects.create(product=self.product, size='M')
        self.variant = ProductVariant.objects.create(
            product=self.product,
            size=self.size,
            stock_quantity=10,
        )
        self.order = Order.objects.create(
            user=self.user,
            order_number='ORD-1000',
            shipping_full_name='Jane Doe',
            shipping_phone='9876543210',
            shipping_address_line1='123 Main St',
            shipping_city='Chennai',
            shipping_state='Tamil Nadu',
            shipping_postal_code='600001',
            shipping_country='India',
            subtotal='50.00',
            total_amount='50.00',
        )

    def test_order_item_can_be_created_for_order(self):
        item = OrderItem.objects.create(
            order=self.order,
            variant=self.variant,
            quantity=2,
            unit_price='25.00',
        )
        self.assertEqual(item.order, self.order)
        self.assertEqual(item.variant, self.variant)
        self.assertIn(item, self.order.items.all())

    def test_order_item_quantity_must_be_at_least_one(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                OrderItem.objects.create(
                    order=self.order,
                    variant=self.variant,
                    quantity=0,
                    unit_price='25.00',
                )

    def test_order_item_unit_price_stores_purchase_time_price(self):
        item = OrderItem.objects.create(
            order=self.order,
            variant=self.variant,
            quantity=1,
            unit_price='25.00',
        )
        # The product's price changes later; the order item must keep the
        # price that was actually charged at purchase time.
        self.product.price = '40.00'
        self.product.save(update_fields=['price'])

        item.refresh_from_db()
        self.assertEqual(item.unit_price, Decimal('25.00'))

    def test_order_item_variant_uses_protect_behavior(self):
        OrderItem.objects.create(
            order=self.order,
            variant=self.variant,
            quantity=1,
            unit_price='25.00',
        )
        with self.assertRaises(ProtectedError):
            self.variant.delete()


class OrderSerializerTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='orderserializeruser',
            email='orderserializer@nostra.com',
            password='OrderPass@2026!',
        )
        self.category = Category.objects.create(name='Apparel')
        self.product = Product.objects.create(
            name='T-Shirt',
            description='A t-shirt',
            price='25.00',
            category=self.category,
        )
        self.size = ProductSize.objects.create(product=self.product, size='M')
        self.color = ProductColor.objects.create(product=self.product, color_name='Red')
        self.variant = ProductVariant.objects.create(
            product=self.product,
            size=self.size,
            color=self.color,
            sku='TSHIRT-RED-M',
            stock_quantity=10,
        )
        self.order = Order.objects.create(
            user=self.user,
            order_number='ORD-2000',
            shipping_full_name='Jane Doe',
            shipping_phone='9876543210',
            shipping_address_line1='123 Main St',
            shipping_city='Chennai',
            shipping_state='Tamil Nadu',
            shipping_postal_code='600001',
            shipping_country='India',
            subtotal='50.00',
            total_amount='50.00',
        )
        self.item = OrderItem.objects.create(
            order=self.order,
            variant=self.variant,
            quantity=2,
            unit_price='25.00',
        )

    def test_order_serialization_includes_expected_fields(self):
        data = OrderSerializer(self.order).data
        self.assertEqual(
            set(data.keys()),
            {
                'id', 'order_number', 'status',
                'shipping_full_name', 'shipping_phone', 'shipping_address_line1',
                'shipping_address_line2', 'shipping_city', 'shipping_state',
                'shipping_postal_code', 'shipping_country',
                'subtotal', 'total_amount', 'items',
                'created_at', 'updated_at',
            },
        )

    def test_order_serializer_does_not_expose_user(self):
        data = OrderSerializer(self.order).data
        self.assertNotIn('user', data)

    def test_order_serializer_user_is_not_writable(self):
        serializer = OrderSerializer(data={
            'user': self.user.id,
            'order_number': 'ORD-9999',
            'shipping_full_name': 'Jane Doe',
            'shipping_phone': '9876543210',
            'shipping_address_line1': '123 Main St',
            'shipping_city': 'Chennai',
            'shipping_state': 'Tamil Nadu',
            'shipping_postal_code': '600001',
            'shipping_country': 'India',
            'subtotal': '50.00',
            'total_amount': '50.00',
        })
        self.assertNotIn('user', serializer.fields)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertNotIn('user', serializer.validated_data)

    def test_order_serializer_includes_items(self):
        data = OrderSerializer(self.order).data
        self.assertEqual(len(data['items']), 1)
        self.assertEqual(data['items'][0]['id'], self.item.id)

    def test_order_item_serialization_includes_expected_fields(self):
        data = OrderItemSerializer(self.item).data
        self.assertEqual(
            set(data.keys()),
            {'id', 'variant', 'quantity', 'unit_price', 'created_at'},
        )
        self.assertEqual(data['quantity'], 2)
        self.assertEqual(data['unit_price'], '25.00')

    def test_order_item_serialization_includes_nested_variant_product_size_color(self):
        data = OrderItemSerializer(self.item).data
        variant_data = data['variant']

        self.assertEqual(variant_data['id'], self.variant.id)
        self.assertEqual(variant_data['sku'], 'TSHIRT-RED-M')
        self.assertEqual(variant_data['stock_quantity'], 10)
        self.assertTrue(variant_data['is_active'])

        self.assertEqual(variant_data['product']['id'], self.product.id)
        self.assertEqual(variant_data['product']['name'], 'T-Shirt')
        self.assertEqual(variant_data['product']['price'], '25.00')

        self.assertEqual(variant_data['size']['size'], 'M')
        self.assertEqual(variant_data['color']['color_name'], 'Red')


class OrderListAPITests(APITestCase):
    url = '/api/products/orders/'

    def setUp(self):
        self.user = User.objects.create_user(
            username='orderapiuser',
            email='orderapi@nostra.com',
            password='OrderPass@2026!',
        )
        self.other_user = User.objects.create_user(
            username='otherorderapiuser',
            email='otherorderapi@nostra.com',
            password='OrderPass@2026!',
        )
        self.category = Category.objects.create(name='Apparel')
        self.product = Product.objects.create(
            name='T-Shirt',
            description='A t-shirt',
            price='25.00',
            category=self.category,
        )
        self.size = ProductSize.objects.create(product=self.product, size='M')
        self.color = ProductColor.objects.create(product=self.product, color_name='Red')
        self.variant = ProductVariant.objects.create(
            product=self.product,
            size=self.size,
            color=self.color,
            stock_quantity=10,
        )

    def create_order(self, user, order_number, **overrides):
        data = {
            'user': user,
            'order_number': order_number,
            'shipping_full_name': 'Jane Doe',
            'shipping_phone': '9876543210',
            'shipping_address_line1': '123 Main St',
            'shipping_city': 'Chennai',
            'shipping_state': 'Tamil Nadu',
            'shipping_postal_code': '600001',
            'shipping_country': 'India',
            'subtotal': '25.00',
            'total_amount': '25.00',
        }
        data.update(overrides)
        return Order.objects.create(**data)

    def test_unauthenticated_access_is_rejected(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_returns_only_current_users_orders(self):
        own_order = self.create_order(self.user, 'ORD-OWN')
        self.create_order(self.other_user, 'ORD-OTHER')

        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id'], own_order.id)

    def test_orders_are_returned_newest_first(self):
        first = self.create_order(self.user, 'ORD-FIRST')
        second = self.create_order(self.user, 'ORD-SECOND')

        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.url)
        ids = [item['id'] for item in response.data]
        self.assertEqual(ids, [second.id, first.id])

    def test_list_includes_nested_order_items(self):
        order = self.create_order(self.user, 'ORD-ITEMS')
        item = OrderItem.objects.create(
            order=order, variant=self.variant, quantity=2, unit_price='25.00',
        )

        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.url)
        order_data = response.data[0]
        self.assertEqual(len(order_data['items']), 1)
        self.assertEqual(order_data['items'][0]['id'], item.id)
        self.assertEqual(order_data['items'][0]['variant']['id'], self.variant.id)


class OrderDetailAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='orderdetailapiuser',
            email='orderdetailapi@nostra.com',
            password='OrderPass@2026!',
        )
        self.other_user = User.objects.create_user(
            username='otherorderdetailapiuser',
            email='otherorderdetailapi@nostra.com',
            password='OrderPass@2026!',
        )
        self.category = Category.objects.create(name='Apparel')
        self.product = Product.objects.create(
            name='T-Shirt',
            description='A t-shirt',
            price='25.00',
            category=self.category,
        )
        self.size = ProductSize.objects.create(product=self.product, size='M')
        self.color = ProductColor.objects.create(product=self.product, color_name='Red')
        self.variant = ProductVariant.objects.create(
            product=self.product,
            size=self.size,
            color=self.color,
            sku='TSHIRT-RED-M',
            stock_quantity=10,
        )
        self.order = Order.objects.create(
            user=self.user,
            order_number='ORD-3000',
            shipping_full_name='Jane Doe',
            shipping_phone='9876543210',
            shipping_address_line1='123 Main St',
            shipping_city='Chennai',
            shipping_state='Tamil Nadu',
            shipping_postal_code='600001',
            shipping_country='India',
            subtotal='50.00',
            total_amount='50.00',
        )
        self.item = OrderItem.objects.create(
            order=self.order, variant=self.variant, quantity=2, unit_price='25.00',
        )

    def detail_url(self, pk):
        return f'/api/products/orders/{pk}/'

    def test_unauthenticated_access_is_rejected(self):
        response = self.client.get(self.detail_url(self.order.id))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_retrieve_own_order(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.detail_url(self.order.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], self.order.id)
        self.assertEqual(response.data['order_number'], 'ORD-3000')

    def test_another_user_cannot_retrieve_someone_elses_order(self):
        self.client.force_authenticate(user=self.other_user)
        response = self.client.get(self.detail_url(self.order.id))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_nonexistent_order_returns_404(self):
        self.client.force_authenticate(user=self.user)
        nonexistent_id = self.order.id + 1000
        response = self.client.get(self.detail_url(nonexistent_id))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_detail_includes_nested_order_items(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.detail_url(self.order.id))
        self.assertEqual(len(response.data['items']), 1)
        item_data = response.data['items'][0]
        self.assertEqual(item_data['id'], self.item.id)
        self.assertEqual(item_data['quantity'], 2)
        self.assertEqual(item_data['variant']['id'], self.variant.id)
        self.assertEqual(item_data['variant']['product']['id'], self.product.id)
        self.assertEqual(item_data['variant']['size']['size'], 'M')
        self.assertEqual(item_data['variant']['color']['color_name'], 'Red')


class OrderPlaceAPITests(APITestCase):
    url = '/api/products/orders/place/'

    def setUp(self):
        self.user = User.objects.create_user(
            username='placeorderuser',
            email='placeorder@nostra.com',
            password='OrderPass@2026!',
        )
        self.other_user = User.objects.create_user(
            username='otherplaceorderuser',
            email='otherplaceorder@nostra.com',
            password='OrderPass@2026!',
        )
        self.category = Category.objects.create(name='Apparel')
        self.product = Product.objects.create(
            name='T-Shirt',
            description='A t-shirt',
            price='25.00',
            category=self.category,
        )
        self.size = ProductSize.objects.create(product=self.product, size='M')
        self.color = ProductColor.objects.create(product=self.product, color_name='Red')
        self.variant = ProductVariant.objects.create(
            product=self.product,
            size=self.size,
            color=self.color,
            stock_quantity=10,
        )
        self.address = Address.objects.create(
            user=self.user,
            full_name='Jane Doe',
            phone='9876543210',
            address_line1='123 Main St',
            city='Chennai',
            state='Tamil Nadu',
            postal_code='600001',
            is_default=True,
        )
        self.other_address = Address.objects.create(
            user=self.other_user,
            full_name='John Smith',
            phone='9123456780',
            address_line1='456 Second St',
            city='Bengaluru',
            state='Karnataka',
            postal_code='560001',
        )

    def add_to_cart(self, variant, quantity, user=None):
        cart, _ = Cart.objects.get_or_create(user=user or self.user)
        return CartItem.objects.create(cart=cart, variant=variant, quantity=quantity)

    def place_order(self, data=None, user=None):
        self.client.force_authenticate(user=user or self.user)
        return self.client.post(self.url, data or {}, format='json')

    # -- authentication / basic gating ------------------------------------

    def test_unauthenticated_request_is_rejected(self):
        self.add_to_cart(self.variant, 1)
        response = self.client.post(self.url, {'address_id': self.address.id}, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_empty_cart_is_rejected(self):
        response = self.place_order({'address_id': self.address.id})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Order.objects.count(), 0)

    def test_missing_address_and_no_default_is_rejected(self):
        self.address.is_default = False
        self.address.save(update_fields=['is_default'])
        self.add_to_cart(self.variant, 1)

        response = self.place_order({})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Order.objects.count(), 0)

    def test_missing_address_uses_default_address(self):
        self.add_to_cart(self.variant, 1)
        response = self.place_order({})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['shipping_full_name'], 'Jane Doe')

    def test_another_users_address_is_rejected(self):
        self.add_to_cart(self.variant, 1)
        response = self.place_order({'address_id': self.other_address.id})
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(Order.objects.count(), 0)

    # -- availability / stock validation -----------------------------------

    def test_inactive_variant_is_rejected(self):
        self.variant.is_active = False
        self.variant.save(update_fields=['is_active'])
        self.add_to_cart(self.variant, 1)

        response = self.place_order({'address_id': self.address.id})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Order.objects.count(), 0)
        # rollback: cart item and stock untouched
        self.assertTrue(CartItem.objects.filter(cart__user=self.user).exists())
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock_quantity, 10)

    def test_inactive_product_is_rejected(self):
        self.product.is_active = False
        self.product.save(update_fields=['is_active'])
        self.add_to_cart(self.variant, 1)

        response = self.place_order({'address_id': self.address.id})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Order.objects.count(), 0)
        self.assertTrue(CartItem.objects.filter(cart__user=self.user).exists())

    def test_insufficient_stock_is_rejected(self):
        self.add_to_cart(self.variant, 11)  # only 10 in stock

        response = self.place_order({'address_id': self.address.id})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Order.objects.count(), 0)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock_quantity, 10)

    def test_rollback_leaves_no_partial_order_with_multiple_items(self):
        other_variant = ProductVariant.objects.create(
            product=self.product,
            size=ProductSize.objects.create(product=self.product, size='L'),
            stock_quantity=1,
        )
        self.add_to_cart(self.variant, 2)
        self.add_to_cart(other_variant, 5)  # exceeds stock of 1

        response = self.place_order({'address_id': self.address.id})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Order.objects.count(), 0)
        self.assertEqual(OrderItem.objects.count(), 0)
        # neither item's stock was touched, even though the first was valid
        self.variant.refresh_from_db()
        other_variant.refresh_from_db()
        self.assertEqual(self.variant.stock_quantity, 10)
        self.assertEqual(other_variant.stock_quantity, 1)
        self.assertEqual(CartItem.objects.filter(cart__user=self.user).count(), 2)

    # -- successful checkout -------------------------------------------------

    def test_successful_checkout(self):
        self.add_to_cart(self.variant, 2)
        response = self.place_order({'address_id': self.address.id})

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Order.objects.count(), 1)
        order = Order.objects.get()
        self.assertEqual(order.user, self.user)
        self.assertEqual(order.status, Order.Status.PENDING)
        self.assertEqual(response.data['id'], order.id)
        self.assertEqual(len(response.data['items']), 1)

    def test_stock_is_decremented_after_checkout(self):
        self.add_to_cart(self.variant, 3)
        self.place_order({'address_id': self.address.id})
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock_quantity, 7)

    def test_cart_is_cleared_after_checkout(self):
        self.add_to_cart(self.variant, 1)
        self.place_order({'address_id': self.address.id})

        self.assertFalse(CartItem.objects.filter(cart__user=self.user).exists())
        # the Cart row itself is kept, not deleted
        self.assertTrue(Cart.objects.filter(user=self.user).exists())

    def test_shipping_address_is_snapshotted(self):
        self.add_to_cart(self.variant, 1)
        response = self.place_order({'address_id': self.address.id})
        order = Order.objects.get(id=response.data['id'])

        self.assertEqual(order.shipping_full_name, 'Jane Doe')
        self.assertEqual(order.shipping_city, 'Chennai')

        # mutating the saved Address afterward must not change the order
        self.address.full_name = 'Changed Name'
        self.address.city = 'Mumbai'
        self.address.save(update_fields=['full_name', 'city'])

        order.refresh_from_db()
        self.assertEqual(order.shipping_full_name, 'Jane Doe')
        self.assertEqual(order.shipping_city, 'Chennai')

    def test_unit_price_snapshot(self):
        self.add_to_cart(self.variant, 1)
        response = self.place_order({'address_id': self.address.id})
        order = Order.objects.get(id=response.data['id'])
        item = order.items.get()
        self.assertEqual(item.unit_price, Decimal('25.00'))

        # changing the product's price afterward must not change the order item
        self.product.price = '99.99'
        self.product.save(update_fields=['price'])

        item.refresh_from_db()
        self.assertEqual(item.unit_price, Decimal('25.00'))

    def test_subtotal_and_total_amount_calculation(self):
        other_variant = ProductVariant.objects.create(
            product=self.product,
            color=ProductColor.objects.create(product=self.product, color_name='Blue'),
            stock_quantity=5,
        )
        self.add_to_cart(self.variant, 2)   # 2 x 25.00 = 50.00
        self.add_to_cart(other_variant, 1)  # 1 x 25.00 = 25.00

        response = self.place_order({'address_id': self.address.id})
        order = Order.objects.get(id=response.data['id'])
        order.refresh_from_db()

        self.assertEqual(order.subtotal, Decimal('75.00'))
        self.assertEqual(order.total_amount, Decimal('75.00'))

    def test_order_user_is_server_controlled(self):
        self.add_to_cart(self.variant, 1)
        response = self.place_order({
            'address_id': self.address.id,
            'user': self.other_user.id,
        })
        order = Order.objects.get(id=response.data['id'])
        self.assertEqual(order.user, self.user)

    def test_bogus_client_fields_are_ignored(self):
        self.add_to_cart(self.variant, 1)
        response = self.place_order({
            'address_id': self.address.id,
            'unit_price': '0.01',
            'quantity': 999,
            'subtotal': '0.01',
            'total_amount': '0.01',
            'order_number': 'HACKED-0001',
            'status': Order.Status.DELIVERED,
        })

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        order = Order.objects.get(id=response.data['id'])
        self.assertEqual(order.subtotal, Decimal('25.00'))
        self.assertEqual(order.total_amount, Decimal('25.00'))
        self.assertNotEqual(order.order_number, 'HACKED-0001')
        self.assertEqual(order.status, Order.Status.PENDING)
        item = order.items.get()
        self.assertEqual(item.unit_price, Decimal('25.00'))
        self.assertEqual(item.quantity, 1)

    def test_order_number_uniqueness_across_orders(self):
        self.add_to_cart(self.variant, 1)
        first = self.place_order({'address_id': self.address.id})

        self.add_to_cart(self.variant, 1)
        second = self.place_order({'address_id': self.address.id})

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertNotEqual(first.data['order_number'], second.data['order_number'])

    def test_sequential_stock_race_scenario(self):
        scarce_variant = ProductVariant.objects.create(
            product=self.product,
            size=ProductSize.objects.create(product=self.product, size='XL'),
            stock_quantity=1,
        )
        self.add_to_cart(scarce_variant, 1, user=self.user)
        self.add_to_cart(scarce_variant, 1, user=self.other_user)

        first = self.place_order({'address_id': self.address.id}, user=self.user)
        second = self.place_order({'address_id': self.other_address.id}, user=self.other_user)

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)

        scarce_variant.refresh_from_db()
        self.assertEqual(scarce_variant.stock_quantity, 0)
        self.assertEqual(Order.objects.filter(user=self.other_user).count(), 0)

    def test_existing_order_and_cart_apis_still_work_after_checkout(self):
        self.add_to_cart(self.variant, 1)
        place_response = self.place_order({'address_id': self.address.id})
        order_id = place_response.data['id']

        self.client.force_authenticate(user=self.user)

        cart_response = self.client.get('/api/products/cart/')
        self.assertEqual(cart_response.status_code, status.HTTP_200_OK)
        self.assertEqual(cart_response.data['items'], [])

        list_response = self.client.get('/api/products/orders/')
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_response.data), 1)
        self.assertEqual(list_response.data[0]['id'], order_id)

        detail_response = self.client.get(f'/api/products/orders/{order_id}/')
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_response.data['id'], order_id)
