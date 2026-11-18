from django.db import transaction
from django.db.models import F
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from core.models import StoreSetting
from accounts.models import ParentStudentLink, User
from .models import InventoryMovement, Order, OrderItem, Product


class ProductSerializer(serializers.ModelSerializer):
    stock_note = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=80)

    class Meta:
        model = Product
        fields = ("id", "name", "sku", "category", "price", "stock", "is_active", "stock_note", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")

    def validate(self, attrs):
        if self.instance and "stock" in attrs and attrs["stock"] != self.instance.stock and not attrs.get("stock_note", "").strip():
            raise serializers.ValidationError({"stock_note": "Isi alasan perubahan stok agar riwayat persediaan dapat diaudit."})
        return attrs

    def create(self, validated_data):
        validated_data.pop("stock_note", None)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data.pop("stock_note", None)
        return super().update(instance, validated_data)

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
    customer_name = serializers.SerializerMethodField()

    def get_customer_name(self, obj):
        return "Penjualan POS" if obj.sales_channel == "pos" else obj.customer.full_name
    beneficiary_name = serializers.CharField(source="beneficiary.full_name", read_only=True, allow_null=True)
    change_due = serializers.SerializerMethodField()

    def get_change_due(self, obj):
        return obj.cash_received - obj.total if obj.cash_received is not None else None

    items = OrderItemReadSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = ("id", "code", "customer_name", "beneficiary_name", "sales_channel", "status", "payment_method", "payment_status", "payment_sender_name", "payment_source", "payment_account_last4", "note", "subtotal", "total", "cash_received", "change_due", "items", "created_at", "accepted_at", "ready_at", "completed_at", "cancelled_at")


class OrderCreateSerializer(serializers.Serializer):
    items = serializers.ListField(child=serializers.DictField(), allow_empty=False)
    payment_method = serializers.ChoiceField(choices=Order.PaymentMethod.choices)
    note = serializers.CharField(required=False, allow_blank=True, max_length=500)
    student_id = serializers.IntegerField(required=False, allow_null=True)

    def validate_student_id(self, value):
        user = self.context["request"].user
        if user.role != User.Role.PARENT:
            raise serializers.ValidationError("Hanya akun orang tua yang dapat memilih siswa penerima.")
        if not ParentStudentLink.objects.filter(parent=user, student_id=value, student__role=User.Role.STUDENT, student__is_active=True).exists():
            raise serializers.ValidationError("Siswa tersebut belum terhubung dengan akun orang tua ini. Hubungi admin koperasi.")
        return value

    def validate(self, attrs):
        if self.context["request"].user.role == User.Role.PARENT and not attrs.get("student_id"):
            raise serializers.ValidationError({"student_id": "Pilih siswa yang terhubung dengan akun orang tua ini."})
        return attrs

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
            beneficiary_id=validated_data.get("student_id"),
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


class InventoryMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    actor_name = serializers.CharField(source="actor.full_name", read_only=True, default=None)

    class Meta:
        model = InventoryMovement
        fields = ("id", "product", "product_name", "actor", "actor_name", "quantity_delta", "reason", "reference", "created_at")
        read_only_fields = fields
