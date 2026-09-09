from django.db.models import Prefetch
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import AllowAny

from .filters import ProductFilter
from .models import Category, Product, ProductVariant
from .pagination import ProductPagination
from .serializers import CategorySerializer, ProductSerializer


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
