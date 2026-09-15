import django_filters

from .models import Category, Order, Product, ProductVariant


class ProductFilter(django_filters.FilterSet):
    min_price = django_filters.NumberFilter(
        field_name='price',
        lookup_expr='gte',
    )
    max_price = django_filters.NumberFilter(
        field_name='price',
        lookup_expr='lte',
    )

    class Meta:
        model = Product
        fields = ['category', 'min_price', 'max_price']


class OrderFilter(django_filters.FilterSet):
    """Used by the staff-only OrderListAdminView. `created_after`/
    `created_before` compare against the date portion of created_at
    (not the full timestamp), so `created_before` includes every order
    placed on that date, not just ones before midnight."""
    created_after = django_filters.DateFilter(
        field_name='created_at',
        lookup_expr='date__gte',
    )
    created_before = django_filters.DateFilter(
        field_name='created_at',
        lookup_expr='date__lte',
    )

    class Meta:
        model = Order
        fields = ['status', 'user', 'created_after', 'created_before']


class AdminProductFilter(django_filters.FilterSet):
    """Used by the staff-only AdminProductListCreateView. Plain equality
    filters — unlike ProductFilter, is_active is exposed here since the
    admin list deliberately includes inactive products too."""
    class Meta:
        model = Product
        fields = ['category', 'is_active']


class AdminCategoryFilter(django_filters.FilterSet):
    """Used by the staff-only AdminCategoryListCreateView."""
    class Meta:
        model = Category
        fields = ['is_active']


class AdminProductVariantFilter(django_filters.FilterSet):
    """Used by the staff-only AdminProductVariantListView. Plain equality
    filters over existing ProductVariant fields/relationships only."""
    class Meta:
        model = ProductVariant
        fields = ['product', 'size', 'color', 'is_active']
