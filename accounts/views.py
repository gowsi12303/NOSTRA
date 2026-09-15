from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework_simplejwt.views import TokenObtainPairView

from products.pagination import ProductPagination

from .models import User
from .serializers import CustomerSerializer, RegisterSerializer


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]


class LoginView(TokenObtainPairView):
    """Accepts username/password and returns JWT access + refresh tokens."""
    permission_classes = [AllowAny]


class CustomerListAdminView(generics.ListAPIView):
    """Staff/admin-only, read-only directory of customer accounts. No
    mutation here — create/update/deactivate a user isn't implemented
    yet, this is listing only. Reuses ProductPagination (generic
    PageNumberPagination config, not product-specific) for the same
    pagination behavior as the rest of the API."""
    serializer_class = CustomerSerializer
    permission_classes = [IsAdminUser]
    queryset = User.objects.all().order_by('-date_joined')
    filter_backends = [
        DjangoFilterBackend,
        SearchFilter,
        OrderingFilter,
    ]
    filterset_fields = ['is_active']
    search_fields = ['username', 'email', 'first_name', 'last_name']
    ordering_fields = ['date_joined', 'username', 'email']
    pagination_class = ProductPagination


class CustomerDetailAdminView(generics.RetrieveAPIView):
    """Staff/admin-only: retrieve a single customer account. Reuses
    CustomerSerializer as-is (same safe field set as
    CustomerListAdminView, same excluded sensitive fields) — no
    pagination here, a single-object detail view has nothing to
    paginate. Read-only, same as the list view: no
    update/deactivate/delete here."""
    serializer_class = CustomerSerializer
    permission_classes = [IsAdminUser]
    queryset = User.objects.all()
