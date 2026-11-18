from rest_framework import serializers
from .models import Category, Order, OrderItem, OrderStatusHistory, Payment, Product, StockMovement


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ("id", "name", "slug", "is_active", "sort_order")


class ProductSerializer(serializers.ModelSerializer):
    category_slug = serializers.SlugRelatedField(source="category", slug_field="slug", queryset=Category.objects.filter(is_active=True))
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = Product
        fields = ("id", "name", "sku", "barcode", "category_slug", "category_name", "description", "unit", "price", "cost_price", "stock", "min_stock", "image_url", "is_active", "created_at", "updated_at")
        read_only_fields = ("id", "stock", "created_at", "updated_at")

    def validate_sku(self, value):
        return value.strip() or None

    def validate_barcode(self, value):
        return value.strip() or None


class StockMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    actor_name = serializers.CharField(source="actor.full_name", read_only=True, default=None)

    class Meta:
        model = StockMovement
        fields = ("id", "product", "product_name", "kind", "quantity_delta", "stock_after", "reference", "note", "actor_name", "created_at")
        read_only_fields = fields


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ("id", "product", "product_name", "sku", "unit", "unit_price", "quantity", "line_total")


class PaymentSerializer(serializers.ModelSerializer):
    verified_by_name = serializers.CharField(source="verified_by.full_name", read_only=True, default=None)

    class Meta:
        model = Payment
        fields = ("method", "status", "amount", "reference", "paid_at", "verified_by_name", "verification_note")


class OrderStatusHistorySerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.full_name", read_only=True, default=None)

    class Meta:
        model = OrderStatusHistory
        fields = ("from_status", "to_status", "note", "actor_name", "created_at")


class OrderSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    customer_identifier = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, default=None)

    def get_customer_name(self, obj):
        return obj.customer.full_name if obj.customer_id else "Pelanggan toko"

    def get_customer_identifier(self, obj):
        return obj.customer.identifier if obj.customer_id else ""
    items = OrderItemSerializer(many=True, read_only=True)
    payment = PaymentSerializer(read_only=True)
    status_history = OrderStatusHistorySerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = ("id", "code", "customer", "customer_name", "customer_identifier", "created_by_name", "status", "fulfillment", "delivery_address", "customer_note", "admin_note", "subtotal", "delivery_fee", "total", "expires_at", "items", "payment", "status_history", "created_at", "updated_at")
        read_only_fields = fields


class CheckoutItemSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1, max_value=1000)


class CheckoutSerializer(serializers.Serializer):
    items = CheckoutItemSerializer(many=True, allow_empty=False)
    fulfillment = serializers.ChoiceField(choices=Order.Fulfillment.choices)
    delivery_address = serializers.CharField(required=False, allow_blank=True, max_length=1000)
    customer_note = serializers.CharField(required=False, allow_blank=True, max_length=500)
    payment_method = serializers.ChoiceField(choices=Payment.Method.choices)

    def validate(self, attrs):
        if attrs["fulfillment"] == Order.Fulfillment.DELIVERY and not attrs.get("delivery_address", "").strip():
            raise serializers.ValidationError({"delivery_address": "Alamat wajib diisi untuk pengiriman."})
        ids = [item["product_id"] for item in attrs["items"]]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError({"items": "Produk yang sama harus digabung dalam satu baris."})
        return attrs
