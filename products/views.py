from django.db import transaction
from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, serializers, status
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .filters import ProductFilter
from .models import Cart, CartItem, Category, Product, ProductVariant
from .pagination import ProductPagination
from .serializers import CartItemSerializer, CartSerializer, CategorySerializer, ProductSerializer


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
