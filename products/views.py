import uuid

from django.db import transaction
from django.db.models import F, Prefetch
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, serializers, status
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .filters import ProductFilter
from .models import (
    Address,
    Cart,
    CartItem,
    Category,
    Order,
    OrderItem,
    Payment,
    Product,
    ProductVariant,
    WishlistItem,
)
from .pagination import ProductPagination
from .serializers import (
    AddressSerializer,
    CartItemSerializer,
    CartSerializer,
    CategorySerializer,
    OrderSerializer,
    PaymentSerializer,
    ProductSerializer,
    WishlistItemSerializer,
)


def _active_products_optimized():
    """Active products with related data fetched up front to avoid N+1 queries
    when ProductSerializer nests category/images/sizes/colors/variants."""
    return Product.objects.filter(is_active=True).select_related('category').prefetch_related(
        'images',
        'sizes',
        'colors',
        Prefetch('variants', queryset=ProductVariant.objects.select_related('size', 'color')),
    )


class ProductListView(generics.ListAPIView):
    serializer_class = ProductSerializer
    permission_classes = [AllowAny]
    queryset = _active_products_optimized().order_by('id')
    filter_backends = [
        DjangoFilterBackend,
        SearchFilter,
        OrderingFilter,
    ]
    filterset_class = ProductFilter
    search_fields = ['name']
    ordering_fields = ['price']
    pagination_class = ProductPagination


class ProductDetailView(generics.RetrieveAPIView):
    serializer_class = ProductSerializer
    permission_classes = [AllowAny]
    queryset = _active_products_optimized()


class CategoryListView(generics.ListAPIView):
    serializer_class = CategorySerializer
    permission_classes = [AllowAny]
    queryset = Category.objects.filter(is_active=True)


class CategoryDetailView(generics.RetrieveAPIView):
    serializer_class = CategorySerializer
    permission_classes = [AllowAny]
    queryset = Category.objects.filter(is_active=True)


# --- Cart -------------------------------------------------------------
# Input-only serializers for validating cart write requests. These are kept
# here (rather than in serializers.py) since they're view-level request
# validation, not representations of Cart/CartItem — CartSerializer and
# CartItemSerializer (from serializers.py) are used for every response.

class AddCartItemInputSerializer(serializers.Serializer):
    variant_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1)


class UpdateCartItemInputSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=1)


class CartDetailView(generics.RetrieveAPIView):
    """Retrieve the authenticated user's cart, creating it on first access."""
    serializer_class = CartSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        cart, _ = Cart.objects.get_or_create(user=self.request.user)
        return cart


class CartAddItemView(generics.GenericAPIView):
    """Add a ProductVariant (with a quantity) to the authenticated user's
    cart. If the variant is already in the cart, its quantity is increased
    instead of creating a duplicate CartItem."""
    serializer_class = CartItemSerializer
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        input_serializer = AddCartItemInputSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        variant_id = input_serializer.validated_data['variant_id']
        quantity = input_serializer.validated_data['quantity']

        variant = get_object_or_404(ProductVariant, pk=variant_id)
        if not variant.is_active or not variant.product.is_active:
            return Response(
                {'detail': 'This product variant is not available.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            cart, _ = Cart.objects.get_or_create(user=request.user)
            item = CartItem.objects.select_for_update().filter(
                cart=cart, variant=variant,
            ).first()
            new_quantity = quantity + (item.quantity if item else 0)

            if new_quantity > variant.stock_quantity:
                return Response(
                    {'detail': f'Only {variant.stock_quantity} in stock.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if item:
                item.quantity = new_quantity
                item.save(update_fields=['quantity', 'updated_at'])
                created = False
            else:
                item = CartItem.objects.create(cart=cart, variant=variant, quantity=new_quantity)
                created = True

        response_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(CartItemSerializer(item).data, status=response_status)


class CartItemDetailView(generics.GenericAPIView):
    """Update the quantity of, or remove, a single CartItem — scoped to the
    authenticated user's own cart, so another user's items are unreachable."""
    serializer_class = CartItemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return CartItem.objects.filter(cart__user=self.request.user)

    def patch(self, request, *args, **kwargs):
        item = self.get_object()
        input_serializer = UpdateCartItemInputSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        quantity = input_serializer.validated_data['quantity']

        if quantity > item.variant.stock_quantity:
            return Response(
                {'detail': f'Only {item.variant.stock_quantity} in stock.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            item = CartItem.objects.select_for_update().get(pk=item.pk)
            item.quantity = quantity
            item.save(update_fields=['quantity', 'updated_at'])

        return Response(CartItemSerializer(item).data, status=status.HTTP_200_OK)

    def delete(self, request, *args, **kwargs):
        item = self.get_object()
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# --- Wishlist -----------------------------------------------------------
# Input-only serializer for validating wishlist write requests, kept here
# (not in serializers.py) for the same reason as the Cart input
# serializers above — WishlistItemSerializer is used for every response.

class AddWishlistItemInputSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()


class WishlistListCreateView(generics.GenericAPIView):
    """GET: the authenticated user's wishlist items.
    POST {product_id}: add a product to the authenticated user's wishlist."""
    serializer_class = WishlistItemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return WishlistItem.objects.filter(user=self.request.user).select_related('product')

    def get(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, *args, **kwargs):
        input_serializer = AddWishlistItemInputSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        product_id = input_serializer.validated_data['product_id']

        product = get_object_or_404(Product, pk=product_id)
        if not product.is_active:
            return Response(
                {'detail': 'This product is not available.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if WishlistItem.objects.filter(user=request.user, product=product).exists():
            return Response(
                {'detail': 'This product is already in your wishlist.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        item = WishlistItem.objects.create(user=request.user, product=product)
        return Response(self.get_serializer(item).data, status=status.HTTP_201_CREATED)


class WishlistItemDeleteView(generics.DestroyAPIView):
    """Remove a single WishlistItem — scoped to the authenticated user's own
    wishlist, so another user's items are unreachable (404, not 403)."""
    serializer_class = WishlistItemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return WishlistItem.objects.filter(user=self.request.user)


# --- Address --------------------------------------------------------------

class AddressListCreateView(generics.ListCreateAPIView):
    """GET: the authenticated user's addresses, default first then newest.
    POST: create an address for the authenticated user. Setting is_default
    unsets any previous default for that user."""
    serializer_class = AddressSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Address.objects.filter(user=self.request.user).order_by('-is_default', '-created_at')

    def perform_create(self, serializer):
        with transaction.atomic():
            if serializer.validated_data.get('is_default'):
                Address.objects.filter(
                    user=self.request.user, is_default=True,
                ).update(is_default=False)
            serializer.save(user=self.request.user)


class AddressDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Retrieve, update, or delete a single Address — scoped to the
    authenticated user's own addresses, so another user's address is
    unreachable (404, not 403). Setting is_default on update unsets any
    other default for that user."""
    serializer_class = AddressSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Address.objects.filter(user=self.request.user)

    def perform_update(self, serializer):
        with transaction.atomic():
            if serializer.validated_data.get('is_default'):
                Address.objects.filter(
                    user=self.request.user, is_default=True,
                ).exclude(pk=serializer.instance.pk).update(is_default=False)
            serializer.save()


# --- Order (read-only) ------------------------------------------------

def _user_orders_optimized(user):
    """A user's orders with items and each item's variant/product/size/color
    fetched up front to avoid N+1 queries when OrderSerializer nests them."""
    return Order.objects.filter(user=user).prefetch_related(
        Prefetch(
            'items',
            queryset=OrderItem.objects.select_related(
                'variant__product', 'variant__size', 'variant__color',
            ),
        ),
    )


class OrderListView(generics.ListAPIView):
    """The authenticated user's own orders, newest first."""
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return _user_orders_optimized(self.request.user).order_by('-created_at')


class OrderDetailView(generics.RetrieveAPIView):
    """A single order — scoped to the authenticated user's own orders, so
    another user's order is unreachable (404, not 403)."""
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return _user_orders_optimized(self.request.user)


# --- Place Order --------------------------------------------------------

class PlaceOrderInputSerializer(serializers.Serializer):
    # Only ever a reference to one of the user's own saved addresses.
    # Nothing else (price, quantity, totals, user, order_number) is ever
    # accepted here — those are always computed/assigned server-side.
    address_id = serializers.IntegerField(required=False)


class _CheckoutError(Exception):
    """Raised to abort the checkout transaction with a clean 400 response.
    Used instead of returning a Response directly from inside a `with
    transaction.atomic()` block once writes have started, since only a
    raised exception actually triggers Django's rollback."""

    def __init__(self, detail):
        self.detail = detail
        super().__init__(detail)


def _generate_order_number():
    return f'ORD-{timezone.now():%Y%m%d%H%M%S}-{uuid.uuid4().hex[:6].upper()}'


class OrderPlaceView(generics.GenericAPIView):
    """Place an order from the authenticated user's current cart.

    Validates address ownership, cart contents, variant/product
    availability, and stock (under row locks, re-checked after locking);
    snapshots the purchase-time price and shipping address; decrements
    stock with an atomic conditional update; creates the Order and its
    OrderItems; and empties the cart — all inside one transaction, so any
    failure leaves every one of those untouched."""
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        input_serializer = PlaceOrderInputSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        address_id = input_serializer.validated_data.get('address_id')

        if address_id is not None:
            # Scoped to request.user: another user's address 404s, it is
            # never usable regardless of whether it exists.
            address = get_object_or_404(Address, pk=address_id, user=request.user)
        else:
            address = Address.objects.filter(user=request.user, is_default=True).first()
            if address is None:
                return Response(
                    {'detail': 'No address provided and no default address is set.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        cart_items = list(
            CartItem.objects.filter(cart__user=request.user).select_related(
                'variant__product', 'variant__size', 'variant__color',
            )
        )
        if not cart_items:
            return Response(
                {'detail': 'Your cart is empty.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                variant_ids = sorted({item.variant_id for item in cart_items})
                # Lock every involved variant row, in a fixed (pk) order, so
                # two concurrent checkouts touching overlapping variants
                # never deadlock each other.
                variants = {
                    variant.id: variant
                    for variant in ProductVariant.objects.select_for_update()
                    .select_related('product', 'size', 'color')
                    .filter(pk__in=variant_ids)
                    .order_by('pk')
                }

                # Authoritative availability/stock check, against the
                # locked, up-to-date rows.
                for item in cart_items:
                    variant = variants[item.variant_id]
                    if not variant.is_active or not variant.product.is_active:
                        raise _CheckoutError(f'"{variant}" is no longer available.')
                    if item.quantity > variant.stock_quantity:
                        raise _CheckoutError(
                            f'Only {variant.stock_quantity} in stock for "{variant}".'
                        )

                subtotal = sum(
                    (variants[item.variant_id].product.price * item.quantity)
                    for item in cart_items
                )

                order = Order.objects.create(
                    user=request.user,
                    order_number=_generate_order_number(),
                    status=Order.Status.PENDING,
                    shipping_full_name=address.full_name,
                    shipping_phone=address.phone,
                    shipping_address_line1=address.address_line1,
                    shipping_address_line2=address.address_line2,
                    shipping_city=address.city,
                    shipping_state=address.state,
                    shipping_postal_code=address.postal_code,
                    shipping_country=address.country,
                    subtotal=subtotal,
                    total_amount=subtotal,
                )

                for item in cart_items:
                    variant = variants[item.variant_id]
                    # Atomic conditional decrement: the WHERE clause is
                    # evaluated by the database as part of this single
                    # UPDATE, so it's race-safe even without the lock above.
                    updated = ProductVariant.objects.filter(
                        pk=variant.pk, stock_quantity__gte=item.quantity,
                    ).update(stock_quantity=F('stock_quantity') - item.quantity)
                    if not updated:
                        raise _CheckoutError(
                            f'Only {variant.stock_quantity} in stock for "{variant}".'
                        )

                    OrderItem.objects.create(
                        order=order,
                        variant=variant,
                        quantity=item.quantity,
                        unit_price=variant.product.price,
                    )

                CartItem.objects.filter(cart__user=request.user).delete()
        except _CheckoutError as exc:
            return Response({'detail': exc.detail}, status=status.HTTP_400_BAD_REQUEST)

        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)


# --- Payment (create only) ----------------------------------------------

# No real gateway is integrated yet — these are just the provider values the
# create-payment endpoint currently accepts for a Payment attempt.
PAYMENT_PROVIDERS = ('manual', 'razorpay', 'stripe')


class CreatePaymentInputSerializer(serializers.Serializer):
    # Only ever a provider name. amount/currency/status/provider_reference/
    # raw_response/order are never accepted here — they're always
    # computed/assigned server-side.
    provider = serializers.ChoiceField(choices=PAYMENT_PROVIDERS)


class PaymentCreateView(generics.GenericAPIView):
    """Create a new Payment attempt for one of the authenticated user's own
    orders. The amount is always order.total_amount; the order must already
    belong to request.user (another user's order 404s); an order that
    already has a PAID payment cannot start another attempt. Order.status
    is never touched here — it only changes once a payment is verified as
    successful, which is not implemented yet."""
    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        input_serializer = CreatePaymentInputSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        provider = input_serializer.validated_data['provider']

        with transaction.atomic():
            # Lock this order's row for the duration of the check-and-create
            # sequence, so two concurrent requests for the same order can't
            # both pass the PAID check before either has written anything.
            # Still scoped to request.user: another user's order 404s here
            # exactly as before select_for_update() was added.
            order = get_object_or_404(
                Order.objects.select_for_update(),
                pk=self.kwargs['order_id'],
                user=request.user,
            )

            if order.payments.filter(status=Payment.Status.PAID).exists():
                return Response(
                    {'detail': 'This order has already been paid for.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            payment = Payment.objects.create(
                order=order,
                provider=provider,
                amount=order.total_amount,
                status=Payment.Status.PENDING,
            )

        return Response(PaymentSerializer(payment).data, status=status.HTTP_201_CREATED)
