from django.urls import path

from .views import (
    CartAddItemView,
    CartDetailView,
    CartItemDetailView,
    CategoryDetailView,
    CategoryListView,
    ProductDetailView,
    ProductListView,
)

urlpatterns = [
    path('', ProductListView.as_view(), name='product-list'),
    path('categories/', CategoryListView.as_view(), name='category-list'),
    path('categories/<int:pk>/', CategoryDetailView.as_view(), name='category-detail'),
    path('cart/', CartDetailView.as_view(), name='cart-detail'),
    path('cart/items/', CartAddItemView.as_view(), name='cart-add-item'),
    path('cart/items/<int:pk>/', CartItemDetailView.as_view(), name='cart-item-detail'),
    path('<int:pk>/', ProductDetailView.as_view(), name='product-detail'),
]
