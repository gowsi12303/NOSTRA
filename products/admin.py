from django.contrib import admin

from .models import (
    Category,
    Payment,
    Product,
    ProductColor,
    ProductImage,
    ProductSize,
    ProductVariant,
)


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
