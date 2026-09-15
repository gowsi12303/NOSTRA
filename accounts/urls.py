from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    CurrentUserView,
    CustomerDetailAdminView,
    CustomerListAdminView,
    LoginView,
    RegisterView,
)

urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),
    path('login/', LoginView.as_view(), name='login'),
    # SimpleJWT's own, unmodified view — exchanges a refresh token for a
    # new access token. Accessible without an access-token Authorization
    # header (AllowAny is DRF's default here, same as LoginView).
    path('token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('me/', CurrentUserView.as_view(), name='current-user'),
    path('admin/customers/', CustomerListAdminView.as_view(), name='customer-list-admin'),
    path('admin/customers/<int:pk>/', CustomerDetailAdminView.as_view(), name='customer-detail-admin'),
]
