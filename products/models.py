from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models


class Category(models.Model):
    name = models.CharField(max_length=255, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = 'categories'

    def __str__(self):
        return self.name


class Product(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    category = models.ForeignKey(
        Category,
        on_delete=models.PROTECT,
        related_name='products',
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class ProductImage(models.Model):
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='images',
    )
    image = models.ImageField(upload_to='products/')
    alt_text = models.CharField(max_length=255, blank=True)
    is_primary = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Image for {self.product.name}'


class ProductSize(models.Model):
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='sizes',
    )
    size = models.CharField(max_length=10)
    stock_quantity = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['product', 'size'],
                name='unique_product_size',
            ),
        ]

    def __str__(self):
        return f'{self.product.name} - {self.size}'


class ProductColor(models.Model):
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='colors',
    )
    color_name = models.CharField(max_length=50)
    hex_code = models.CharField(
        max_length=7,
        blank=True,
        validators=[
            RegexValidator(
                regex=r'^#[0-9A-Fa-f]{6}$',
                message='Enter a valid hex color, e.g. #FF0000.',
            ),
        ],
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['product', 'color_name'],
                name='unique_product_color',
            ),
        ]

    def __str__(self):
        return f'{self.product.name} - {self.color_name}'


class ProductVariant(models.Model):
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='variants',
    )
    size = models.ForeignKey(
        ProductSize,
        on_delete=models.CASCADE,
        related_name='variants',
        null=True,
        blank=True,
    )
    color = models.ForeignKey(
        ProductColor,
        on_delete=models.CASCADE,
        related_name='variants',
        null=True,
        blank=True,
    )
    sku = models.CharField(max_length=64, unique=True, blank=True, null=True)
    stock_quantity = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['product', 'size', 'color'],
                condition=models.Q(size__isnull=False, color__isnull=False),
                name='unique_variant_size_and_color',
            ),
            models.UniqueConstraint(
                fields=['product', 'size'],
                condition=models.Q(color__isnull=True),
                name='unique_variant_size_only',
            ),
            models.UniqueConstraint(
                fields=['product', 'color'],
                condition=models.Q(size__isnull=True),
                name='unique_variant_color_only',
            ),
            models.CheckConstraint(
                condition=models.Q(size__isnull=False) | models.Q(color__isnull=False),
                name='variant_requires_size_or_color',
            ),
        ]

    def clean(self):
        if self.size_id and self.size.product_id != self.product_id:
            raise ValidationError('Size must belong to the same product as the variant.')
        if self.color_id and self.color.product_id != self.product_id:
            raise ValidationError('Color must belong to the same product as the variant.')

    def __str__(self):
        size_label = self.size.size if self.size else '-'
        color_label = self.color.color_name if self.color else '-'
        return f'{self.product.name} - {size_label}/{color_label}'


class Cart(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='cart',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'Cart for {self.user}'


class CartItem(models.Model):
    cart = models.ForeignKey(
        Cart,
        on_delete=models.CASCADE,
        related_name='items',
    )
    variant = models.ForeignKey(
        ProductVariant,
        on_delete=models.CASCADE,
        related_name='cart_items',
    )
    quantity = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['cart', 'variant'],
                name='unique_cart_variant',
            ),
            models.CheckConstraint(
                condition=models.Q(quantity__gte=1),
                name='cartitem_quantity_at_least_one',
            ),
        ]

    def __str__(self):
        return f'{self.quantity} x {self.variant} (cart #{self.cart_id})'


class WishlistItem(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='wishlist_items',
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name='wishlisted_by',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'product'],
                name='unique_user_wishlist_product',
            ),
        ]

    def __str__(self):
        return f'{self.user} wishlisted {self.product.name}'


class Address(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='addresses',
    )
    full_name = models.CharField(max_length=255)
    phone = models.CharField(max_length=20)
    address_line1 = models.CharField(max_length=255)
    address_line2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100)
    postal_code = models.CharField(max_length=10)
    country = models.CharField(max_length=100, default='India')
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['user'],
                condition=models.Q(is_default=True),
                name='unique_default_address_per_user',
            ),
        ]

    def __str__(self):
        return f'{self.full_name} - {self.address_line1}, {self.city} ({self.user})'


class Order(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        CONFIRMED = 'confirmed', 'Confirmed'
        SHIPPED = 'shipped', 'Shipped'
        DELIVERED = 'delivered', 'Delivered'
        CANCELLED = 'cancelled', 'Cancelled'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='orders',
    )
    order_number = models.CharField(max_length=32, unique=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )

    # Shipping details are snapshotted here rather than FK'd to Address,
    # since Address rows are freely editable/deletable by their owner and an
    # order must keep reflecting what was true at the time it was placed.
    shipping_full_name = models.CharField(max_length=255)
    shipping_phone = models.CharField(max_length=20)
    shipping_address_line1 = models.CharField(max_length=255)
    shipping_address_line2 = models.CharField(max_length=255, blank=True)
    shipping_city = models.CharField(max_length=100)
    shipping_state = models.CharField(max_length=100)
    shipping_postal_code = models.CharField(max_length=10)
    shipping_country = models.CharField(max_length=100)

    subtotal = models.DecimalField(max_digits=10, decimal_places=2)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'Order {self.order_number} ({self.user})'


class OrderItem(models.Model):
    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name='items',
    )
    variant = models.ForeignKey(
        ProductVariant,
        on_delete=models.PROTECT,
        related_name='order_items',
    )
    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity__gte=1),
                name='orderitem_quantity_at_least_one',
            ),
        ]

    def __str__(self):
        return f'{self.quantity} x {self.variant} (order #{self.order_id})'


class Payment(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        PROCESSING = 'processing', 'Processing'
        PAID = 'paid', 'Paid'
        FAILED = 'failed', 'Failed'
        REFUNDED = 'refunded', 'Refunded'
        CANCELLED = 'cancelled', 'Cancelled'

    order = models.ForeignKey(
        Order,
        on_delete=models.PROTECT,
        related_name='payments',
    )
    # Gateway-agnostic: which provider ('razorpay', 'stripe', 'manual', ...)
    # and that provider's own opaque reference for this payment attempt —
    # never gateway-specific columns, so a provider can be added later
    # without a schema change. No card numbers, CVV, UPI credentials, or
    # other sensitive payment data are ever stored here or in raw_response.
    provider = models.CharField(max_length=32)
    provider_reference = models.CharField(max_length=128, unique=True, blank=True, null=True)

    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default='INR')
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )

    raw_response = models.JSONField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'Payment for {self.order.order_number} - {self.status}'
