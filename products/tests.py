import shutil
import tempfile

from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from .models import (
    Category,
    Product,
    ProductColor,
    ProductImage,
    ProductSize,
    ProductVariant,
)

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
        names = [item['name'] for item in response.data]
        self.assertIn('Laptop', names)
        self.assertIn('Phone', names)
        self.assertNotIn('T-Shirt', names)

    def test_filter_by_min_price_excludes_cheaper_products(self):
        response = self.client.get(self.url, {'min_price': '400'})
        names = [item['name'] for item in response.data]
        self.assertIn('Laptop', names)
        self.assertIn('Phone', names)
        self.assertNotIn('T-Shirt', names)

    def test_filter_by_max_price_excludes_pricier_products(self):
        response = self.client.get(self.url, {'max_price': '50'})
        names = [item['name'] for item in response.data]
        self.assertIn('T-Shirt', names)
        self.assertNotIn('Laptop', names)
        self.assertNotIn('Phone', names)

    def test_search_by_product_name(self):
        response = self.client.get(self.url, {'search': 'Lap'})
        names = [item['name'] for item in response.data]
        self.assertIn('Laptop', names)
        self.assertNotIn('Phone', names)
        self.assertNotIn('T-Shirt', names)
        # inactive products must stay excluded even if the name matches
        self.assertNotIn('Old Laptop', names)

    def test_ordering_by_price_ascending(self):
        response = self.client.get(self.url, {'ordering': 'price'})
        prices = [float(item['price']) for item in response.data]
        self.assertEqual(prices, sorted(prices))

    def test_ordering_by_price_descending(self):
        response = self.client.get(self.url, {'ordering': '-price'})
        prices = [float(item['price']) for item in response.data]
        self.assertEqual(prices, sorted(prices, reverse=True))

    def test_combining_multiple_filters(self):
        response = self.client.get(self.url, {
            'category': self.category_electronics.id,
            'min_price': '400',
            'max_price': '600',
            'ordering': 'price',
        })
        names = [item['name'] for item in response.data]
        self.assertEqual(names, ['Phone'])


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
