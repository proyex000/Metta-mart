import base64
import binascii
import hashlib
import json
from io import BytesIO
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from PIL import Image, UnidentifiedImageError
from django.db.models import F
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from .delivery import operating_hours_text, quote_delivery, store_is_open
from core.models import StoreSetting
from .models import InventoryMovement, Order, OrderItem, Product
from .order_policy import cancel_stale_orders, enforce_order_limits


MAX_PRODUCT_IMAGE_DATA_URL_LENGTH = 380_000
MAX_PRODUCT_IMAGE_BYTES = 285_000


class ProductSerializer(serializers.ModelSerializer):
    stock_note = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=80)
    image = serializers.CharField(
        required=False, write_only=True, allow_blank=True, allow_null=True,
        max_length=MAX_PRODUCT_IMAGE_DATA_URL_LENGTH,
    )
    remove_image = serializers.BooleanField(write_only=True, required=False, default=False)
    image_url = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Product
        fields = ("id", "name", "sku", "category", "price", "stock", "is_active", "image", "image_url", "remove_image", "stock_note", "created_at", "updated_at")
        read_only_fields = ("id", "image_url", "created_at", "updated_at")

    def get_image_url(self, obj):
        if not obj.image:
            return None
        # New product photos are data URLs stored directly in TiDB. Keep legacy
        # upload paths readable while old media files are still available.
        if obj.image.startswith("data:image/"):
            return obj.image
        legacy_url = f"{settings.MEDIA_URL}{str(obj.image).lstrip('/')}"
        request = self.context.get("request")
        return request.build_absolute_uri(legacy_url) if request else legacy_url

    def validate_image(self, value):
        if value in (None, ""):
            return value
        try:
            header, encoded = value.split(",", 1)
            mime_types = {
                "data:image/jpeg;base64": "JPEG",
                "data:image/png;base64": "PNG",
                "data:image/webp;base64": "WEBP",
            }
            expected_format = mime_types.get(header)
            if not expected_format:
                raise serializers.ValidationError("Format gambar harus JPG, PNG, atau WEBP dalam format Base64.")
            raw = base64.b64decode(encoded, validate=True)
            if not raw or len(raw) > MAX_PRODUCT_IMAGE_BYTES:
                raise serializers.ValidationError("Ukuran gambar setelah kompresi maksimal 285 KB.")
            with Image.open(BytesIO(raw)) as image:
                if image.format != expected_format:
                    raise serializers.ValidationError("Format data gambar tidak sesuai dengan isinya.")
                if image.width > 4000 or image.height > 4000:
                    raise serializers.ValidationError("Resolusi gambar maksimal 4000 × 4000 piksel.")
                image.verify()
        except serializers.ValidationError:
            raise
        except (ValueError, binascii.Error, UnidentifiedImageError, OSError, Image.DecompressionBombError):
            raise serializers.ValidationError("Data gambar tidak valid atau rusak.")
        return value

    def validate(self, attrs):
        if self.instance and "stock" in attrs and attrs["stock"] != self.instance.stock and not attrs.get("stock_note", "").strip():
            raise serializers.ValidationError({"stock_note": "Isi alasan perubahan stok agar riwayat persediaan dapat diaudit."})
        return attrs

    def create(self, validated_data):
        validated_data.pop("stock_note", None)
        remove_image = validated_data.pop("remove_image", False)
        if remove_image:
            validated_data["image"] = None
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data.pop("stock_note", None)
        remove_image = validated_data.pop("remove_image", False)
        if remove_image and not validated_data.get("image"):
            validated_data["image"] = None
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


def cancel_block_reason(order):
    """Alasan pesanan tidak boleh dibatalkan pelanggan; None bila boleh. Pembatalan hanya sebelum dibayar."""
    if order.sales_channel != "online":
        return "Transaksi POS tidak dapat dibatalkan oleh pelanggan."
    if order.status == Order.Status.CANCELLED:
        return "Pesanan ini sudah dibatalkan."
    if order.status not in (Order.Status.PENDING, Order.Status.ACCEPTED, Order.Status.READY):
        return "Pesanan yang sudah selesai tidak dapat dibatalkan."
    if order.payment_status == Order.PaymentStatus.PAID:
        return "Pesanan yang sudah dibayar tidak dapat dibatalkan."
    if order.payment_status == Order.PaymentStatus.PENDING:
        return "Pembayaran sedang diverifikasi admin, sehingga pesanan tidak dapat dibatalkan. Hubungi admin bila ada kendala."
    return None


class OrderReadSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    customer_email = serializers.SerializerMethodField()
    can_cancel = serializers.SerializerMethodField()
    payment_info = serializers.SerializerMethodField()

    def get_can_cancel(self, obj):
        return cancel_block_reason(obj) is None

    def get_payment_info(self, obj):
        """Rekening/QRIS only belongs on the customer's order-detail response, never in list payloads."""
        if not self.context.get("include_payment_info", False):
            return None
        if obj.payment_method == Order.PaymentMethod.CASH or obj.status not in (Order.Status.ACCEPTED, Order.Status.READY):
            return None
        if obj.payment_status not in (Order.PaymentStatus.UNPAID, Order.PaymentStatus.FAILED, Order.PaymentStatus.PENDING):
            return None
        # List serializers share their context, so fetch this store-wide setting once
        # per response instead of issuing one database query for every order.
        cache_key = "_payment_instructions_cache"
        if cache_key not in self.context:
            setting = StoreSetting.objects.filter(key="payment_instructions").first()
            self.context[cache_key] = setting.value if setting and isinstance(setting.value, dict) else {}
        data = self.context[cache_key]
        if obj.payment_method == Order.PaymentMethod.BANK_TRANSFER:
            return {"bank_name": data.get("bank_name", ""), "account_name": data.get("account_name", ""), "account_number": data.get("account_number", ""), "qris_image": ""}
        return {"bank_name": "", "account_name": "", "account_number": "", "qris_image": data.get("qris_image", "")}

    def get_customer_name(self, obj):
        return "Penjualan POS" if obj.sales_channel == "pos" else obj.customer.full_name

    def get_customer_email(self, obj):
        return "" if obj.sales_channel == "pos" else (obj.customer.email or "")

    beneficiary_name = serializers.CharField(source="beneficiary.full_name", read_only=True, allow_null=True)
    change_due = serializers.SerializerMethodField()

    def get_change_due(self, obj):
        return obj.cash_received - obj.total if obj.cash_received is not None else None

    items = OrderItemReadSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = ("id", "code", "customer_name", "customer_email", "beneficiary_name", "sales_channel", "status", "payment_method", "payment_status", "payment_sender_name", "payment_source", "payment_account_last4", "note", "subtotal", "total", "cash_received", "change_due", "delivery_method", "delivery_fee", "delivery_fee_confirmed", "delivery_distance_km", "delivery_address", "delivery_recipient", "delivery_phone", "can_cancel", "payment_info", "items", "created_at", "accepted_at", "ready_at", "completed_at", "cancelled_at")


class OrderCreateSerializer(serializers.Serializer):
    items = serializers.ListField(child=serializers.DictField(), allow_empty=False)
    payment_method = serializers.ChoiceField(choices=Order.PaymentMethod.choices)
    note = serializers.CharField(required=False, allow_blank=True, max_length=500)
    delivery_method = serializers.ChoiceField(choices=Order.DeliveryMethod.choices, required=False, default=Order.DeliveryMethod.PICKUP)
    delivery_address = serializers.CharField(required=False, allow_blank=True, max_length=300)
    delivery_recipient = serializers.CharField(required=False, allow_blank=True, max_length=120)
    delivery_phone = serializers.CharField(required=False, allow_blank=True, max_length=20)

    def validate(self, attrs):
        request = self.context.get("request")
        key = request.headers.get("Idempotency-Key", "").strip() if request else ""
        if not key:
            raise ValidationError({"idempotency_key": "Kunci transaksi wajib dikirim. Muat ulang halaman checkout lalu coba lagi."})
        if len(key) < 8 or len(key) > 64:
            raise ValidationError({"idempotency_key": "Kunci transaksi tidak valid."})
        if key:
            attrs["_idempotency_key"] = key
        if attrs.get("delivery_method") != Order.DeliveryMethod.GOSEND:
            for field in ("delivery_address", "delivery_recipient", "delivery_phone"):
                attrs.pop(field, None)
            return attrs
        if not store_is_open():
            raise ValidationError({"delivery_method": f"Pesanan GoSend hanya dapat dibuat pada jam operasional koperasi ({operating_hours_text()})."})
        if attrs["payment_method"] == Order.PaymentMethod.CASH:
            raise ValidationError({"payment_method": "Pesanan GoSend harus dibayar lewat transfer bank atau QRIS agar kurir dapat dipesan."})
        recipient = attrs.get("delivery_recipient", "").strip()
        phone = "".join(ch for ch in attrs.get("delivery_phone", "") if ch.isdigit())
        if not recipient:
            raise ValidationError({"delivery_recipient": "Nama penerima wajib diisi."})
        if not 9 <= len(phone) <= 15:
            raise ValidationError({"delivery_phone": "Isi nomor HP/WhatsApp penerima yang valid (9–15 digit)."})
        quote = quote_delivery(attrs.get("delivery_address", ""))
        attrs.update(delivery_recipient=recipient, delivery_phone=phone, delivery_address=attrs["delivery_address"].strip(), _quote=quote)
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
        key = validated_data.pop("_idempotency_key", "")
        self.idempotent_replay = False
        request = self.context["request"]
        fingerprint_data = {name: value for name, value in validated_data.items() if not name.startswith("_")}
        fingerprint = hashlib.sha256(json.dumps(fingerprint_data, sort_keys=True, separators=(",", ":"), default=str).encode()).hexdigest()
        if key:
            get_user_model().objects.select_for_update().get(pk=request.user.pk)
            existing = Order.objects.filter(idempotency_key=key).first()
            if existing:
                if existing.customer_id != request.user.pk or existing.request_fingerprint != fingerprint or existing.sales_channel != "online":
                    raise ValidationError({"idempotency_key": "Kunci ini sudah digunakan untuk pesanan lain."})
                self.idempotent_replay = True
                return existing
        # Cleanup only this account on checkout; the scheduled command handles all accounts.
        cancel_stale_orders(customer=request.user)
        enforce_order_limits(request.user)
        products = {p.id: p for p in Product.objects.select_for_update().filter(id__in=[r["product_id"] for r in rows], is_active=True).order_by("id")}
        if len(products) != len(rows):
            raise ValidationError({"items": "Satu atau lebih produk tidak tersedia."})
        subtotal = 0
        for row in rows:
            product = products[row["product_id"]]
            if product.stock < row["quantity"]:
                raise ValidationError({"items": f"Stok {product.name} tidak mencukupi."})
            subtotal += product.price * row["quantity"]
        quote = validated_data.get("_quote")
        delivery = {}
        if quote:
            delivery = {
                "delivery_method": Order.DeliveryMethod.GOSEND,
                "delivery_fee": quote["fee"],
                "delivery_fee_confirmed": not quote.get("manual_review", False),
                "delivery_distance_km": quote.get("distance_km"),
                "delivery_address": validated_data["delivery_address"],
                "delivery_recipient": validated_data["delivery_recipient"],
                "delivery_phone": validated_data["delivery_phone"],
            }
        order = Order.objects.create(
            customer=request.user,
            idempotency_key=key or None,
            request_fingerprint=fingerprint if key else "",
            payment_method=validated_data["payment_method"],
            note=validated_data.get("note", "").strip(),
            subtotal=subtotal,
            total=subtotal + delivery.get("delivery_fee", 0),
            **delivery,
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
