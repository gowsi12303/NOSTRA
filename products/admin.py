from django.contrib import admin

from .models import Category, Product, ProductColor, ProductImage, ProductSize


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


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'price', 'is_active', 'has_images', 'created_at', 'updated_at')
    list_filter = ('is_active', 'category')
    search_fields = ('name', 'description')
    inlines = [ProductImageInline, ProductSizeInline, ProductColorInline]

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
