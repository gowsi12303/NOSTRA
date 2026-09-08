from rest_framework import generics
from rest_framework.permissions import AllowAny

from .models import Product
from .serializers import ProductSerializer


class ProductListView(generics.ListAPIView):
    serializer_class = ProductSerializer
    permission_classes = [AllowAny]
    queryset = Product.objects.filter(is_active=True)


class ProductDetailView(generics.RetrieveAPIView):
    serializer_class = ProductSerializer
    permission_classes = [AllowAny]
    queryset = Product.objects.filter(is_active=True)
