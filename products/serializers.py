from rest_framework import serializers

from .models import (
    Address,
    Cart,
    CartItem,
    Category,
    Order,
    OrderItem,
    Payment,
    Product,
    ProductColor,
    ProductImage,
    ProductSize,
    ProductVariant,
    WishlistItem,
)


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = [
            'id',
            'name',
            'description',
            'is_active',
            'created_at',
            'updated_at',
        ]


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = [
            'id',
            'image',
            'alt_text',
            'is_primary',
            'created_at',
        ]


class ProductSizeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductSize
        fields = [
            'id',
            'size',
            'stock_quantity',
            'is_active',
            'created_at',
            'updated_at',
        ]


class ProductColorSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductColor
        fields = [
            'id',
            'color_name',
            'hex_code',
            'is_active',
            'created_at',
            'updated_at',
        ]


class ProductVariantSerializer(serializers.ModelSerializer):
    size = ProductSizeSerializer(read_only=True)
    color = ProductColorSerializer(read_only=True)

    class Meta:
        model = ProductVariant
        fields = [
            'id',
            'size',
            'color',
            'sku',
            'stock_quantity',
            'is_active',
            'created_at',
            'updated_at',
        ]


class ProductSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    images = ProductImageSerializer(many=True, read_only=True)
    sizes = ProductSizeSerializer(many=True, read_only=True)
    colors = ProductColorSerializer(many=True, read_only=True)
    variants = ProductVariantSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        fields = [
            'id',
            'name',
            'description',
            'price',
            'category',
            'images',
            'sizes',
            'colors',
            'variants',
            'is_active',
            'created_at',
            'updated_at',
        ]


class ProductSummarySerializer(serializers.ModelSerializer):
    """Minimal, read-only product information needed to display a cart line item."""

    class Meta:
        model = Product
        fields = [
            'id',
            'name',
            'price',
        ]


class CartItemVariantSerializer(serializers.ModelSerializer):
    """Read-only ProductVariant representation tailored for the cart, including
    the parent product context that's implicit when a variant is nested inside
    ProductSerializer.variants but isn't otherwise available on its own."""

    product = ProductSummarySerializer(read_only=True)
    size = ProductSizeSerializer(read_only=True)
    color = ProductColorSerializer(read_only=True)

    class Meta:
        model = ProductVariant
        fields = [
            'id',
            'product',
            'size',
            'color',
            'sku',
            'stock_quantity',
            'is_active',
        ]


class CartItemSerializer(serializers.ModelSerializer):
    variant = CartItemVariantSerializer(read_only=True)

    class Meta:
        model = CartItem
        fields = [
            'id',
            'variant',
            'quantity',
            'created_at',
            'updated_at',
        ]


class CartSerializer(serializers.ModelSerializer):
    # 'user' is intentionally not a field here: the cart is always tied to the
    # authenticated request's user by the view (not implemented yet), never
    # accepted from client input.
    items = CartItemSerializer(many=True, read_only=True)

    class Meta:
        model = Cart
        fields = [
            'id',
            'items',
            'created_at',
            'updated_at',
        ]


class WishlistItemSerializer(serializers.ModelSerializer):
    # 'user' is intentionally not a field here: the wishlist entry is always
    # tied to the authenticated request's user by the view (not implemented
    # yet), never accepted from client input.
    product = ProductSummarySerializer(read_only=True)

    class Meta:
        model = WishlistItem
        fields = [
            'id',
            'product',
            'created_at',
            'updated_at',
        ]


class AddressSerializer(serializers.ModelSerializer):
    # 'user' is intentionally not a field here: an address is always tied to
    # the authenticated request's user by the view (not implemented yet),
    # never accepted from client input.
    class Meta:
        model = Address
        fields = [
            'id',
            'full_name',
            'phone',
            'address_line1',
            'address_line2',
            'city',
            'state',
            'postal_code',
            'country',
            'is_default',
            'created_at',
            'updated_at',
        ]


class PaymentSerializer(serializers.ModelSerializer):
    # Response-only representation: every field here is set by the view
    # (PaymentCreateView), never accepted as input through this serializer.
    # provider_reference and raw_response are intentionally excluded from
    # output — they're internal/gateway bookkeeping, not needed by clients.
    class Meta:
        model = Payment
        fields = [
            'id',
            'order',
            'provider',
            'amount',
            'currency',
            'status',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields


class OrderItemSerializer(serializers.ModelSerializer):
    # Reuses the same variant-with-product/size/color representation already
    # used for cart line items — a purchased line item needs the same
    # context (what was bought, in which size/color) as a cart line item.
    variant = CartItemVariantSerializer(read_only=True)

    class Meta:
        model = OrderItem
        fields = [
            'id',
            'variant',
            'quantity',
            'unit_price',
            'created_at',
        ]


class OrderSerializer(serializers.ModelSerializer):
    # 'user' is intentionally not a field here: an order always belongs to
    # the authenticated request's user by the view (not implemented yet),
    # never accepted from client input.
    items = OrderItemSerializer(many=True, read_only=True)
    # Read-only visibility into payment attempts for this order. Uses the
    # same PaymentSerializer as PaymentCreateView's response, so
    # provider_reference/raw_response stay excluded here too — no new
    # exposure, just visibility into the existing safe fields.
    payments = PaymentSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = [
            'id',
            'order_number',
            'status',
            'shipping_full_name',
            'shipping_phone',
            'shipping_address_line1',
            'shipping_address_line2',
            'shipping_city',
            'shipping_state',
            'shipping_postal_code',
            'shipping_country',
            'subtotal',
            'total_amount',
            'items',
            'payments',
            'created_at',
            'updated_at',
        ]
