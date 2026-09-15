import uuid

from django.db import transaction
from django.db.models import F, Prefetch
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, serializers, status
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
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
    OrderStatusUpdateSerializer,
    PaymentSerializer,
    PaymentStatusUpdateSerializer,
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
    """A user's orders with items (and each item's variant/product/size/
    color) and payments fetched up front to avoid N+1 queries when
    OrderSerializer nests them."""
    return Order.objects.filter(user=user).prefetch_related(
        Prefetch(
            'items',
            queryset=OrderItem.objects.select_related(
                'variant__product', 'variant__size', 'variant__color',
            ),
        ),
        'payments',
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


# --- Order status update (staff/admin only) ------------------------------

# One-way fulfillment state machine: keys are the order's *current*
# status, values are the set of statuses it may move to next. Anything
# not listed (an omitted current status, or a target not in the set) is
# rejected. delivered/cancelled are terminal.
ORDER_STATUS_TRANSITIONS = {
    Order.Status.PENDING: {Order.Status.CONFIRMED, Order.Status.CANCELLED},
    Order.Status.CONFIRMED: {Order.Status.SHIPPED, Order.Status.CANCELLED},
    Order.Status.SHIPPED: {Order.Status.DELIVERED},
    Order.Status.DELIVERED: set(),
    Order.Status.CANCELLED: set(),
}


def _restore_stock_for_cancelled_order(order):
    """Restore each of the order's OrderItem quantities back onto its
    ProductVariant.stock_quantity. Called only once, by
    OrderStatusUpdateView, immediately after an order's transition has
    landed on cancelled — never for any other transition. Locks the
    involved variant rows first (in a fixed pk order, mirroring
    OrderPlaceView's checkout locking, so concurrent stock-affecting
    operations on the same variant can't deadlock or race each other),
    then applies each restoration as an atomic conditional UPDATE, the
    same pattern the checkout stock decrement uses.

    Double restoration isn't a separate case to guard against here: since
    cancelled is terminal in ORDER_STATUS_TRANSITIONS, a second attempt to
    cancel an already-cancelled order is rejected by the transition check
    in OrderStatusUpdateView.patch before this function is ever called
    again for the same order."""
    order_items = list(order.items.all())
    if not order_items:
        return

    variant_ids = sorted({item.variant_id for item in order_items})
    # Lock every involved variant row up front, in a fixed (pk) order, for
    # the same deadlock-avoidance reason OrderPlaceView locks them before
    # decrementing stock at checkout.
    list(ProductVariant.objects.select_for_update().filter(pk__in=variant_ids).order_by('pk'))

    for item in order_items:
        ProductVariant.objects.filter(pk=item.variant_id).update(
            stock_quantity=F('stock_quantity') + item.quantity,
        )


class OrderStatusUpdateView(generics.GenericAPIView):
    """Update an order's status. Enforces a one-way fulfillment state
    machine (ORDER_STATUS_TRANSITIONS) — delivered/cancelled can't be
    reopened, and every other transition not explicitly listed there is
    rejected. Does not touch Payment or cart — this is order-lifecycle
    (and, for cancellation only, inventory) only.

    Staff/admin only: IsAdminUser rejects unauthenticated requests with
    401 and authenticated non-staff users with 403. Because only staff
    can reach this endpoint at all, orders are looked up by order_id
    alone (not scoped to request.user) — staff must be able to update
    any customer's order."""
    serializer_class = OrderSerializer
    permission_classes = [IsAdminUser]

    def patch(self, request, *args, **kwargs):
        input_serializer = OrderStatusUpdateSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        new_status = input_serializer.validated_data['status']

        with transaction.atomic():
            # Not scoped to request.user: this endpoint is staff/admin
            # only (enforced by IsAdminUser above), and staff must be able
            # to update any customer's order, not just their own.
            order = get_object_or_404(
                Order.objects.select_for_update(),
                pk=self.kwargs['order_id'],
            )

            allowed_next_statuses = ORDER_STATUS_TRANSITIONS.get(order.status, set())
            if new_status not in allowed_next_statuses:
                return Response(
                    {
                        'detail': (
                            f'Cannot transition order from "{order.status}" '
                            f'to "{new_status}".'
                        ),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            order.status = new_status
            order.save(update_fields=['status', 'updated_at'])

            if new_status == Order.Status.CANCELLED:
                _restore_stock_for_cancelled_order(order)

        return Response(OrderSerializer(order).data, status=status.HTTP_200_OK)


class OrderCancelView(generics.GenericAPIView):
    """Let an authenticated customer cancel one of their own orders — the
    self-service counterpart to OrderStatusUpdateView's staff-only
    cancellation, not a replacement for it. Scoped to request.user, so
    another user's order 404s, same as every other customer-owned order
    endpoint.

    Only legal per ORDER_STATUS_TRANSITIONS: since cancelled is only a
    valid next status from pending or confirmed there, a shipped,
    delivered, or already-cancelled order is rejected with 400 — no new
    status or separate rule is introduced, this reuses the exact same
    transition table OrderStatusUpdateView enforces. Restores stock the
    same way a staff-initiated cancellation does, via
    _restore_stock_for_cancelled_order."""
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        with transaction.atomic():
            # Scoped to request.user: another user's order 404s here, no
            # existence leak either way — this is a customer self-service
            # endpoint, not admin/staff.
            order = get_object_or_404(
                Order.objects.select_for_update(),
                pk=self.kwargs['order_id'],
                user=request.user,
            )

            allowed_next_statuses = ORDER_STATUS_TRANSITIONS.get(order.status, set())
            if Order.Status.CANCELLED not in allowed_next_statuses:
                return Response(
                    {'detail': f'Cannot cancel an order with status "{order.status}".'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            order.status = Order.Status.CANCELLED
            order.save(update_fields=['status', 'updated_at'])
            _restore_stock_for_cancelled_order(order)

        return Response(OrderSerializer(order).data, status=status.HTTP_200_OK)


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


# Orders in these statuses can no longer accept a new payment attempt.
# Reuses ORDER_STATUS_TRANSITIONS's own terminal/non-terminal split as the
# rule (delivered/cancelled are exactly the two statuses with no allowed
# next transition) rather than a separate list, so it can't drift out of
# sync with the order lifecycle defined there.
ORDER_STATUSES_INELIGIBLE_FOR_PAYMENT = {
    order_status
    for order_status, allowed_next_statuses in ORDER_STATUS_TRANSITIONS.items()
    if not allowed_next_statuses
}


class PaymentCreateView(generics.GenericAPIView):
    """Create a new Payment attempt for one of the authenticated user's own
    orders. The amount is always order.total_amount; the order must already
    belong to request.user (another user's order 404s); an order that's
    already delivered or cancelled (see ORDER_STATUSES_INELIGIBLE_FOR_PAYMENT)
    can't start a new attempt at all, and one that already has a PAID
    payment can't start another either. Starting a new attempt supersedes
    any pending/processing attempt still in flight for this order — those
    are marked cancelled first, so at most one non-terminal Payment ever
    exists per order at a time. Order.status is only ever changed as a
    side effect of a payment reaching paid (see
    _confirm_order_after_payment) — never here."""
    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        input_serializer = CreatePaymentInputSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        provider = input_serializer.validated_data['provider']

        with transaction.atomic():
            # Lock this order's row for the duration of the check-and-create
            # sequence, so two concurrent requests for the same order can't
            # both pass the checks below before either has written anything.
            # Still scoped to request.user: another user's order 404s here
            # exactly as before select_for_update() was added.
            order = get_object_or_404(
                Order.objects.select_for_update(),
                pk=self.kwargs['order_id'],
                user=request.user,
            )

            if order.status in ORDER_STATUSES_INELIGIBLE_FOR_PAYMENT:
                return Response(
                    {'detail': f'Cannot create a payment for an order with status "{order.status}".'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if order.payments.filter(status=Payment.Status.PAID).exists():
                return Response(
                    {'detail': 'This order has already been paid for.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Starting a new attempt supersedes any attempt still in
            # flight: at most one pending/processing Payment ever exists
            # per order, so it's always clear which row is the live one.
            # Terminal attempts (failed/cancelled/refunded) are left
            # untouched — a paid one was already ruled out above.
            superseded_attempts = order.payments.filter(
                status__in=[Payment.Status.PENDING, Payment.Status.PROCESSING],
            )
            for attempt in superseded_attempts:
                attempt.status = Payment.Status.CANCELLED
                attempt.save(update_fields=['status', 'updated_at'])

            payment = Payment.objects.create(
                order=order,
                provider=provider,
                amount=order.total_amount,
                status=Payment.Status.PENDING,
            )

        return Response(PaymentSerializer(payment).data, status=status.HTTP_201_CREATED)


# --- Payment status update (dev/test only — NOT a real gateway webhook) --

# One-way state machine: keys are the payment's *current* status, values
# are the set of statuses it may move to next. Anything not listed here
# (an omitted current status, or a target not in the set) is rejected.
# paid/failed/cancelled/refunded are terminal except paid -> refunded.
PAYMENT_STATUS_TRANSITIONS = {
    Payment.Status.PENDING: {
        Payment.Status.PROCESSING,
        Payment.Status.FAILED,
        Payment.Status.CANCELLED,
    },
    Payment.Status.PROCESSING: {
        Payment.Status.PAID,
        Payment.Status.FAILED,
        Payment.Status.CANCELLED,
    },
    Payment.Status.PAID: {Payment.Status.REFUNDED},
    Payment.Status.FAILED: set(),
    Payment.Status.CANCELLED: set(),
    Payment.Status.REFUNDED: set(),
}


def _confirm_order_after_payment(order):
    """Auto-advance an order from pending -> confirmed once one of its
    payments has just become paid. Reuses ORDER_STATUS_TRANSITIONS (the
    same table OrderStatusUpdateView enforces) as the single source of
    truth for whether that's legal, instead of a separate rule — so if
    the order isn't pending, this is a no-op: an already-confirmed,
    shipped, or delivered order is left alone, and a cancelled order is
    never resurrected. The payment update itself always still succeeds
    regardless of what happens here.

    Caller is responsible for locking the order row (select_for_update())
    and passing in the freshly-locked instance, so this checks the
    current status only after that lock is held."""
    if order.status != Order.Status.PENDING:
        return
    if Order.Status.CONFIRMED not in ORDER_STATUS_TRANSITIONS.get(order.status, set()):
        return
    order.status = Order.Status.CONFIRMED
    order.save(update_fields=['status', 'updated_at'])


class PaymentStatusUpdateView(generics.GenericAPIView):
    """Update a payment's status for development/testing only — this is
    NOT a real Razorpay/Stripe webhook, and no gateway is integrated here.
    Enforces the same one-way state machine a real provider callback would
    need to: only the transitions in PAYMENT_STATUS_TRANSITIONS are
    allowed, paid/failed/cancelled/refunded can't be reopened (except
    paid -> refunded), and an order is never allowed a second paid
    payment. The only effect this has on Order.status: a payment reaching
    paid auto-confirms its order if (and only if) that order is still
    pending (see _confirm_order_after_payment) — every other payment
    status change leaves Order.status untouched.

    Staff/admin only: IsAdminUser rejects unauthenticated requests with
    401 and authenticated non-staff users with 403 — a normal customer,
    including the payment's own owner, can no longer self-report their
    payment as paid. Because only staff can reach this endpoint at all,
    the lookup below is scoped to payment_id/order_id only (not
    request.user) — staff must be able to update any customer's payment,
    same as OrderStatusUpdateView."""
    serializer_class = PaymentSerializer
    permission_classes = [IsAdminUser]

    def patch(self, request, *args, **kwargs):
        input_serializer = PaymentStatusUpdateSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        new_status = input_serializer.validated_data['status']

        with transaction.atomic():
            # Not scoped to request.user: this endpoint is staff/admin
            # only (enforced by IsAdminUser above). Still scoped to the
            # URL's order_id: a payment belonging to a different order
            # than the one in the URL 404s here, no existence leak
            # either way.
            payment = get_object_or_404(
                Payment.objects.select_for_update().select_related('order'),
                pk=self.kwargs['payment_id'],
                order__pk=self.kwargs['order_id'],
            )

            allowed_next_statuses = PAYMENT_STATUS_TRANSITIONS.get(payment.status, set())
            if new_status not in allowed_next_statuses:
                return Response(
                    {
                        'detail': (
                            f'Cannot transition payment from "{payment.status}" '
                            f'to "{new_status}".'
                        ),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if new_status == Payment.Status.PAID:
                already_has_paid_payment = payment.order.payments.filter(
                    status=Payment.Status.PAID,
                ).exclude(pk=payment.pk).exists()
                if already_has_paid_payment:
                    return Response(
                        {'detail': 'This order already has another paid payment.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            payment.status = new_status
            payment.save(update_fields=['status', 'updated_at'])

            if new_status == Payment.Status.PAID:
                # Explicitly locked (independent of the select_related
                # above) and re-checked before writing, same as every
                # other status-changing lock in this file.
                order = Order.objects.select_for_update().get(pk=payment.order_id)
                _confirm_order_after_payment(order)

        return Response(PaymentSerializer(payment).data, status=status.HTTP_200_OK)
