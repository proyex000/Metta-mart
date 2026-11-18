from django.db import transaction
from django.db.models import F
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from core.models import StoreSetting
from .models import InventoryMovement, Order, OrderItem, Product


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ("id", "name", "sku", "category", "price", "stock", "is_active", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Harga tidak boleh negatif.")
        return value


class OrderItemReadSerializer(serializers.ModelSerializer):
    product_id = serializers.IntegerField(source="product.id", read_only=True)

    class Meta:
        model = OrderItem
        fields = ("product_id", "product_name", "unit_price", "quantity", "line_total")


class OrderReadSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.full_name", read_only=True)
    items = OrderItemReadSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = ("id", "code", "customer_name", "status", "payment_method", "payment_status", "note", "subtotal", "total", "items", "created_at", "accepted_at", "ready_at", "completed_at", "cancelled_at")


class OrderCreateSerializer(serializers.Serializer):
    items = serializers.ListField(child=serializers.DictField(), allow_empty=False)
    payment_method = serializers.ChoiceField(choices=Order.PaymentMethod.choices)
    note = serializers.CharField(required=False, allow_blank=True, max_length=500)

    def validate_payment_method(self, value):
        setting = StoreSetting.objects.filter(key="payment_methods").first()
        enabled = setting.value if setting and isinstance(setting.value, dict) else {"cash": True, "bank_transfer": True, "qris": True}
        if not enabled.get(value, False):
            raise serializers.ValidationError("Metode pembayaran ini sedang tidak tersedia.")
        return value

    def validate_items(self, value):
        cleaned = []
        seen = set()
        for row in value:
            try:
                product_id = int(row.get("product_id"))
                quantity = int(row.get("quantity"))
            except (TypeError, ValueError):
                raise serializers.ValidationError("Produk dan jumlah harus valid.")
            if product_id in seen or quantity < 1:
                raise serializers.ValidationError("Produk tidak boleh duplikat dan jumlah minimal 1.")
            seen.add(product_id)
            cleaned.append({"product_id": product_id, "quantity": quantity})
        return cleaned

    @transaction.atomic
    def create(self, validated_data):
        rows = validated_data["items"]
        products = {p.id: p for p in Product.objects.select_for_update().filter(id__in=[r["product_id"] for r in rows], is_active=True).order_by("id")}
        if len(products) != len(rows):
            raise ValidationError({"items": "Satu atau lebih produk tidak tersedia."})
        subtotal = 0
        for row in rows:
            product = products[row["product_id"]]
            if product.stock < row["quantity"]:
                raise ValidationError({"items": f"Stok {product.name} tidak mencukupi."})
            subtotal += product.price * row["quantity"]
        order = Order.objects.create(
            customer=self.context["request"].user,
            payment_method=validated_data["payment_method"],
            note=validated_data.get("note", "").strip(),
            subtotal=subtotal,
            total=subtotal,
        )
        for row in rows:
            product = products[row["product_id"]]
            updated = Product.objects.filter(pk=product.pk, stock__gte=row["quantity"]).update(stock=F("stock") - row["quantity"])
            if not updated:
                raise ValidationError({"items": f"Stok {product.name} baru saja berubah. Muat ulang katalog."})
            InventoryMovement.objects.create(product=product, actor=self.context["request"].user, quantity_delta=-row["quantity"], reason="order_reserved", reference=order.code)
            OrderItem.objects.create(order=order, product=product, product_name=product.name, unit_price=product.price, quantity=row["quantity"], line_total=product.price * row["quantity"])
        return order
