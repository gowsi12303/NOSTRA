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


class AdminCategorySerializer(serializers.ModelSerializer):
    """Staff-only category management serializer
    (AdminCategoryListCreateView/AdminCategoryDetailView) — a separate
    serializer from the public, read-only-in-practice CategorySerializer
    rather than modifying it. Functionally the same field list as
    CategorySerializer (Category has no relations worth nesting here —
    no unnecessary nested product data), but with id/created_at/
    updated_at explicitly marked read-only, since this one is actually
    used for writes."""
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
        read_only_fields = ['id', 'created_at', 'updated_at']


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


class AdminProductSerializer(serializers.ModelSerializer):
    """Staff-only product management serializer (AdminProductListCreateView/
    AdminProductDetailView) — deliberately separate from the public,
    fully-read-only ProductSerializer rather than modifying it.

    Unlike ProductSerializer, `category` is left as DRF's default
    auto-generated field for a ModelSerializer FK: a plain writable
    PrimaryKeyRelatedField, not the nested read-only CategorySerializer —
    so staff can set a product's category by id. images/sizes/colors/
    variants stay read-only nested views (reusing the same serializers
    ProductSerializer uses) for visibility only; creating/editing those
    sub-resources isn't in scope here, they remain Django-admin-only.
    id/created_at/updated_at are server-managed and read-only."""
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
        read_only_fields = ['id', 'created_at', 'updated_at']


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


class AdminProductVariantSerializer(serializers.ModelSerializer):
    """Staff-only variant/inventory management serializer
    (AdminProductVariantListView/AdminProductVariantDetailView).

    product/size/color are read-only here (nested, reusing
    ProductSummarySerializer/ProductSizeSerializer/ProductColorSerializer
    — the same shape as CartItemVariantSerializer, so a product's price
    is visible via the nested product object even though ProductVariant
    itself has no price field of its own). They're deliberately not
    writable: ProductVariant's product+size+color combinations are
    enforced by conditional UniqueConstraints (constraints with a
    `condition=Q(...)`), which DRF cannot auto-generate a validator for
    the way it does a plain unique_together — allowing them to be
    reassigned via PATCH would risk an unhandled IntegrityError (a raw
    500) instead of a clean 400. Reassigning a variant to a different
    product/size/color is a data-modeling change, not an
    inventory-management one, and isn't needed here.

    sku/stock_quantity/is_active stay writable — that covers every real
    inventory operation (restock, deactivate, correct SKU).
    stock_quantity explicitly declares min_value=0 for a clear, documented
    400 on a negative value (ProductVariant.stock_quantity is already a
    PositiveIntegerField, so DRF would reject a negative value with a 400
    even without this — this just makes that guarantee explicit here)."""
    product = ProductSummarySerializer(read_only=True)
    size = ProductSizeSerializer(read_only=True)
    color = ProductColorSerializer(read_only=True)
    stock_quantity = serializers.IntegerField(min_value=0)

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
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


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


class PaymentStatusUpdateSerializer(serializers.Serializer):
    # Only ever a target status value. Whether that specific transition is
    # actually allowed from the payment's current status is validated by
    # the view (PaymentStatusUpdateView), not here — this serializer only
    # guards against a value that isn't one of Payment's defined statuses
    # at all.
    status = serializers.ChoiceField(choices=Payment.Status.choices)


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


class OrderStatusUpdateSerializer(serializers.Serializer):
    # Only ever a target status value, restricted to Order's own defined
    # statuses — no new statuses are introduced here. Whether that specific
    # transition is allowed from the order's current status is validated
    # by the view (OrderStatusUpdateView), not here.
    status = serializers.ChoiceField(choices=Order.Status.choices)
