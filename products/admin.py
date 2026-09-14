from django import forms
from django.contrib import admin

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
from .views import ORDER_STATUS_TRANSITIONS


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_active', 'created_at', 'updated_at')
    list_filter = ('is_active',)
    search_fields = ('name', 'description')


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 0


class ProductSizeInline(admin.TabularInline):
    model = ProductSize
    extra = 0


class ProductColorInline(admin.TabularInline):
    model = ProductColor
    extra = 0


class ProductVariantInline(admin.TabularInline):
    model = ProductVariant
    extra = 0
    fields = ('size', 'color', 'sku', 'stock_quantity', 'is_active')


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'price', 'is_active', 'has_images', 'created_at', 'updated_at')
    list_filter = ('is_active', 'category')
    search_fields = ('name', 'description')
    inlines = [ProductImageInline, ProductSizeInline, ProductColorInline, ProductVariantInline]

    @admin.display(boolean=True, description='Has Images')
    def has_images(self, obj):
        return obj.images.exists()


@admin.register(ProductImage)
class ProductImageAdmin(admin.ModelAdmin):
    list_display = ('product', 'alt_text', 'is_primary', 'created_at')
    list_filter = ('is_primary',)
    search_fields = ('product__name', 'alt_text')


@admin.register(ProductSize)
class ProductSizeAdmin(admin.ModelAdmin):
    list_display = ('product', 'size', 'stock_quantity', 'is_active', 'created_at', 'updated_at')
    list_filter = ('is_active', 'size')
    search_fields = ('product__name', 'size')


@admin.register(ProductColor)
class ProductColorAdmin(admin.ModelAdmin):
    list_display = ('product', 'color_name', 'hex_code', 'is_active', 'created_at', 'updated_at')
    list_filter = ('is_active',)
    search_fields = ('product__name', 'color_name')


@admin.register(ProductVariant)
class ProductVariantAdmin(admin.ModelAdmin):
    list_display = ('product', 'size', 'color', 'sku', 'stock_quantity', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('product__name', 'sku')


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    # raw_response is deliberately left out of list_display (it's a
    # potentially large JSON blob, not useful in a list row) but is not
    # excluded/restricted for the change (detail) view — along with
    # provider_reference, both remain visible there via the default
    # change-form field set, since no `fields`/`exclude` is set here.
    list_display = ('id', 'order', 'provider', 'amount', 'currency', 'status', 'created_at')
    list_filter = ('provider', 'status', 'currency')
    search_fields = ('order__order_number', 'provider_reference')


# --- Order / OrderItem ---------------------------------------------------

class OrderItemInline(admin.TabularInline):
    """Read-only: order lines are a purchase-time snapshot created
    atomically by the checkout flow (OrderPlaceView), together with the
    stock decrement and Order.subtotal/total_amount. Editing them here
    would silently desync those from the order they belong to, so this
    inline is for staff visibility only, not editing."""
    model = OrderItem
    extra = 0
    fields = ('variant', 'quantity', 'unit_price', 'created_at')
    readonly_fields = ('variant', 'quantity', 'unit_price', 'created_at')
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


class OrderAdminForm(forms.ModelForm):
    """Enforces the same one-way order status state machine
    (ORDER_STATUS_TRANSITIONS, defined in views.py) that
    OrderStatusUpdateView enforces via the API, so staff can't use the
    admin to jump straight from e.g. 'pending' to 'delivered'. The
    'status' field itself is still just Order.Status's existing choices —
    no new status (e.g. 'processing') is introduced here or anywhere
    else."""
    class Meta:
        model = Order
        fields = '__all__'

    def clean_status(self):
        new_status = self.cleaned_data['status']
        # self.instance still holds the status as loaded from the
        # database at this point — cleaned_data isn't written onto the
        # instance until after all clean_<field> methods have run.
        current_status = self.instance.status if self.instance.pk else None
        if current_status is not None and new_status != current_status:
            allowed_next_statuses = ORDER_STATUS_TRANSITIONS.get(current_status, set())
            if new_status not in allowed_next_statuses:
                raise forms.ValidationError(
                    f'Cannot transition order from "{current_status}" to "{new_status}".'
                )
        return new_status


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    form = OrderAdminForm
    list_display = ('order_number', 'user', 'status', 'total_amount', 'created_at')
    list_filter = ('status',)
    search_fields = ('order_number', 'user__username', 'user__email')
    ordering = ('-created_at',)
    inlines = [OrderItemInline]


@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):
    list_display = ('order', 'variant', 'quantity', 'unit_price', 'created_at')
    search_fields = ('order__order_number', 'variant__sku', 'variant__product__name')


# --- Cart / CartItem ------------------------------------------------------

class CartItemInline(admin.TabularInline):
    model = CartItem
    extra = 0
    fields = ('variant', 'quantity')


@admin.register(Cart)
class CartAdmin(admin.ModelAdmin):
    list_display = ('user', 'item_count', 'created_at', 'updated_at')
    search_fields = ('user__username', 'user__email')
    inlines = [CartItemInline]

    @admin.display(description='Items')
    def item_count(self, obj):
        return obj.items.count()


@admin.register(CartItem)
class CartItemAdmin(admin.ModelAdmin):
    list_display = ('cart', 'variant', 'quantity', 'created_at', 'updated_at')
    search_fields = ('cart__user__username', 'cart__user__email', 'variant__sku', 'variant__product__name')


# --- Wishlist --------------------------------------------------------------

@admin.register(WishlistItem)
class WishlistItemAdmin(admin.ModelAdmin):
    list_display = ('user', 'product', 'created_at')
    search_fields = ('user__username', 'user__email', 'product__name')


# --- Address ----------------------------------------------------------------

@admin.register(Address)
class AddressAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'user', 'city', 'state', 'country', 'is_default', 'created_at')
    list_filter = ('is_default', 'country')
    search_fields = ('full_name', 'user__username', 'user__email', 'phone', 'city', 'postal_code')
