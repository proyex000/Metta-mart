from datetime import datetime, timedelta
from django.db import transaction
from django.db.models import F
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from accounts.models import User
from accounts.permissions import IsAdminRole
from core.models import AuditLog, StoreSetting
from .models import Category, Order, OrderItem, OrderStatusHistory, Payment, Product, StockMovement
from .permissions import IsAdminOrReadOnly
from .notifications import notify_admins, notify_user
from .serializers import CategorySerializer, CheckoutSerializer, OrderSerializer, ProductSerializer, StockMovementSerializer

def pickup_is_open(now=None):
    setting = StoreSetting.objects.filter(key="checkout").first()
    config = setting.value if setting and isinstance(setting.value, dict) else {}
    days = config.get("operating_days", [])
    opening_time = config.get("opening_time", "")
    closing_time = config.get("closing_time", "")
    if not config.get("pickup_enabled", True) or not opening_time or not closing_time:
        return False
    local_now = timezone.localtime(now or timezone.now())
    day_codes = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
    if day_codes[local_now.weekday()] not in days:
        return False
    try:
        opening = datetime.strptime(opening_time, "%H:%M").time()
        closing = datetime.strptime(closing_time, "%H:%M").time()
    except (TypeError, ValueError):
        return False
    current = local_now.time().replace(tzinfo=None)
    return opening <= current <= closing




def record_order_status(order, new_status, actor, note=""):
    old_status = order.status
    if old_status == new_status:
        return
    order.status = new_status
    order.save(update_fields=("status", "updated_at"))
    OrderStatusHistory.objects.create(order=order, from_status=old_status, to_status=new_status, actor=actor, note=note)
    notify_user(order.customer, "order.status", "Status pesanan diperbarui", "Pesanan " + order.code + " sekarang: " + new_status.replace("_", " ") + (". " + note if note else ""), "/orders/" + order.code)


def release_order_stock(order, actor, note):
    items = order.items.exclude(product_id__isnull=True).order_by("product_id")
    for item in items:
        product = Product.objects.select_for_update().get(pk=item.product_id)
        Product.objects.filter(pk=product.pk).update(stock=F("stock") + item.quantity)
        product.refresh_from_db(fields=("stock",))
        StockMovement.objects.create(product=product, kind=StockMovement.Kind.RELEASED, quantity_delta=item.quantity, stock_after=product.stock, reference=order.code, note=note, actor=actor)


def expire_due_qris_orders(now=None, batch_size=100):
    now = now or timezone.now()
    candidates = Order.objects.filter(
        status=Order.Status.AWAITING_PAYMENT,
        payment__status=Payment.Status.PENDING_VERIFICATION,
        expires_at__lte=now,
    ).order_by("pk").values_list("pk", flat=True)[:batch_size]
    expired_count = 0
    for order_id in list(candidates):
        with transaction.atomic():
            order = Order.objects.select_for_update().select_related("payment", "customer").filter(
                pk=order_id,
                status=Order.Status.AWAITING_PAYMENT,
                payment__status=Payment.Status.PENDING_VERIFICATION,
                expires_at__lte=now,
            ).first()
            if order is None:
                continue
            release_order_stock(order, None, "QRIS kedaluwarsa; stok dikembalikan")
            order.payment.status = Payment.Status.EXPIRED
            order.payment.save(update_fields=("status", "updated_at"))
            record_order_status(order, Order.Status.EXPIRED, None, "Batas pembayaran QRIS berakhir")
            AuditLog.objects.create(event="order.expired", target_type="order", target_id=order.code)
            expired_count += 1
    return expired_count


class CategoryListCreateView(generics.ListCreateAPIView):
    serializer_class = CategorySerializer
    permission_classes = [IsAdminOrReadOnly]

    def get_queryset(self):
        queryset = Category.objects.all()
        return queryset if self.request.user.role == User.Role.ADMIN else queryset.filter(is_active=True)


class CategoryDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAdminRole]

    def perform_destroy(self, instance):
        if instance.products.exists():
            instance.is_active = False
            instance.save(update_fields=("is_active",))
        else:
            instance.delete()


class ProductListCreateView(generics.ListCreateAPIView):
    serializer_class = ProductSerializer
    permission_classes = [IsAdminOrReadOnly]

    def get_queryset(self):
        queryset = Product.objects.select_related("category")
        include_inactive = self.request.user.role == User.Role.ADMIN and self.request.query_params.get("include_inactive") == "true"
        if not include_inactive:
            queryset = queryset.filter(is_active=True, category__is_active=True)
        category = self.request.query_params.get("category")
        search = self.request.query_params.get("search", "").strip()
        if category:
            queryset = queryset.filter(category__slug=category)
        if search:
            queryset = queryset.filter(name__icontains=search)
        if self.request.query_params.get("low_stock") == "true":
            queryset = queryset.filter(stock__lte=F("min_stock"))
        return queryset

    def perform_create(self, serializer):
        product = serializer.save()
        AuditLog.objects.create(actor=self.request.user, event="product.created", target_type="product", target_id=str(product.pk))


class ProductDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Product.objects.select_related("category")
    serializer_class = ProductSerializer
    permission_classes = [IsAdminRole]

    def perform_update(self, serializer):
        product = serializer.save()
        AuditLog.objects.create(actor=self.request.user, event="product.updated", target_type="product", target_id=str(product.pk))

    def perform_destroy(self, instance):
        if instance.order_items.exists() or instance.stock_movements.exists():
            instance.is_active = False
            instance.save(update_fields=("is_active", "updated_at"))
        else:
            instance.delete()
        AuditLog.objects.create(actor=self.request.user, event="product.archived", target_type="product", target_id=str(instance.pk))


class StockAdjustmentView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        note = str(request.data.get("note", "")).strip()[:240]
        target_value = request.data.get("target_stock")
        with transaction.atomic():
            product = get_object_or_404(Product.objects.select_for_update(), pk=pk)
            if target_value is not None:
                try:
                    target = int(target_value)
                    expected = int(request.data.get("expected_stock"))
                except (TypeError, ValueError):
                    raise ValidationError({"target_stock": "Stok tujuan dan stok awal wajib berupa bilangan bulat."})
                if target < 0 or target > 1000000:
                    raise ValidationError({"target_stock": "Stok tujuan di luar batas yang diizinkan."})
                if product.stock != expected:
                    error = APIException("Stok telah berubah sejak halaman dibuka. Muat ulang data sebelum menyimpan.")
                    error.status_code = 409
                    raise error
                delta = target - product.stock
            else:
                try:
                    delta = int(request.data.get("quantity_delta"))
                except (TypeError, ValueError):
                    raise ValidationError({"quantity_delta": "Jumlah perubahan stok harus berupa bilangan bulat."})
                if delta == 0 or abs(delta) > 100000:
                    raise ValidationError({"quantity_delta": "Perubahan stok harus antara -100000 sampai 100000 dan bukan nol."})
                if product.stock + delta < 0:
                    raise ValidationError({"quantity_delta": "Stok tidak boleh menjadi negatif."})
            if delta == 0:
                return Response(ProductSerializer(product).data)
            Product.objects.filter(pk=pk).update(stock=F("stock") + delta)
            product.refresh_from_db()
            StockMovement.objects.create(product=product, kind=StockMovement.Kind.RESTOCK if delta > 0 else StockMovement.Kind.ADJUSTMENT, quantity_delta=delta, stock_after=product.stock, note=note, actor=request.user)
            AuditLog.objects.create(actor=request.user, event="stock.adjusted", target_type="product", target_id=str(product.pk), metadata={"delta": delta, "stock_after": product.stock, "note": note})
        return Response(ProductSerializer(product).data)


class StockMovementListView(generics.ListAPIView):
    serializer_class = StockMovementSerializer
    permission_classes = [IsAdminRole]

    def get_queryset(self):
        queryset = StockMovement.objects.select_related("product", "actor")
        product_id = self.request.query_params.get("product")
        return queryset.filter(product_id=product_id) if product_id else queryset


class CheckoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        expire_due_qris_orders()
        if request.user.role not in {User.Role.STUDENT, User.Role.PARENT}:
            raise PermissionDenied("Checkout online hanya tersedia untuk akun siswa dan orang tua.")
        serializer = CheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        setting = StoreSetting.objects.filter(key="checkout").first()
        config = setting.value if setting and isinstance(setting.value, dict) else {}
        payment_method = data["payment_method"]
        fulfillment = data["fulfillment"]
        if payment_method == Payment.Method.CASH and not config.get("cash_enabled", True):
            raise ValidationError({"payment_method": "Pembayaran tunai sedang dinonaktifkan."})
        if payment_method == Payment.Method.BANK_TRANSFER and not (config.get("bank_transfer_enabled") and config.get("bank_account_number")):
            raise ValidationError({"payment_method": "Transfer bank belum dikonfigurasi oleh admin."})
        if payment_method == Payment.Method.QRIS and not (config.get("qris_enabled") and config.get("qris_image_url")):
            raise ValidationError({"payment_method": "QRIS toko belum dikonfigurasi oleh admin."})
        if fulfillment != Order.Fulfillment.PICKUP or not config.get("pickup_enabled", True):
            raise ValidationError({"fulfillment": "Pemesanan online hanya tersedia dengan pengambilan di koperasi."})
        delivery_fee = 0
        item_ids = [item["product_id"] for item in data["items"]]
        quantities = {item["product_id"]: item["quantity"] for item in data["items"]}
        with transaction.atomic():
            products = {p.pk: p for p in Product.objects.select_for_update().select_related("category").filter(pk__in=item_ids, is_active=True, category__is_active=True)}
            if len(products) != len(item_ids):
                raise ValidationError({"items": "Satu atau lebih produk tidak tersedia."})
            subtotal = 0
            lines = []
            for product_id in item_ids:
                product = products[product_id]
                quantity = quantities[product_id]
                if product.stock < quantity:
                    raise ValidationError({"items": f"Stok {product.name} tidak mencukupi. Tersedia: {product.stock}."})
                subtotal += product.price * quantity
                lines.append((product, quantity, product.price * quantity))
            payment_status = Payment.Status.PENDING_VERIFICATION if payment_method == Payment.Method.QRIS else Payment.Status.UNPAID
            order_status = Order.Status.AWAITING_PAYMENT if payment_method in {Payment.Method.QRIS, Payment.Method.BANK_TRANSFER} else Order.Status.PENDING_REVIEW
            order = Order.objects.create(customer=request.user, created_by=request.user, status=order_status, fulfillment=Order.Fulfillment.PICKUP, delivery_address="", customer_note=data.get("customer_note", "").strip(), subtotal=subtotal, delivery_fee=0, total=subtotal, expires_at=timezone.now() + timedelta(minutes=20) if payment_method == Payment.Method.QRIS else None)
            for product, quantity, line_total in lines:
                changed = Product.objects.filter(pk=product.pk, stock__gte=quantity).update(stock=F("stock") - quantity)
                if not changed:
                    raise ValidationError({"items": f"Stok {product.name} baru saja berubah. Silakan periksa keranjang."})
                product.refresh_from_db()
                OrderItem.objects.create(order=order, product=product, product_name=product.name, sku=product.sku or "", unit=product.unit, unit_price=product.price, quantity=quantity, line_total=line_total)
                StockMovement.objects.create(product=product, kind=StockMovement.Kind.RESERVED, quantity_delta=-quantity, stock_after=product.stock, reference=order.code, note="Stok direservasi untuk pesanan", actor=request.user)
            Payment.objects.create(order=order, method=payment_method, status=payment_status, amount=order.total, reference=order.code)
            OrderStatusHistory.objects.create(order=order, from_status="", to_status=order.status, actor=request.user, note="Pesanan dibuat")
            AuditLog.objects.create(actor=request.user, event="order.created", target_type="order", target_id=order.code, metadata={"total": order.total, "payment_method": payment_method})
            notify_admins("order.new", "Pesanan baru masuk", "Pesanan " + order.code + " dari " + request.user.full_name + " menunggu proses.")
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)


class OrderListView(generics.ListAPIView):
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        expire_due_qris_orders()
        queryset = Order.objects.select_related("customer", "payment").prefetch_related("items", "status_history")
        if self.request.user.role != User.Role.ADMIN:
            queryset = queryset.filter(customer=self.request.user)
        state = self.request.query_params.get("status")
        return queryset.filter(status=state) if state else queryset


class OrderDetailView(generics.RetrieveAPIView):
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = "code"

    def get_queryset(self):
        queryset = Order.objects.select_related("customer", "payment").prefetch_related("items", "status_history")
        return queryset if self.request.user.role == User.Role.ADMIN else queryset.filter(customer=self.request.user)


class OrderActionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, code):
        action = str(request.data.get("action", "")).strip()
        note = str(request.data.get("note", "")).strip()[:500]
        with transaction.atomic():
            order = get_object_or_404(Order.objects.select_for_update().select_related("payment", "customer"), code=code)
            role = request.user.role
            if action == "cancel":
                if role not in {User.Role.ADMIN, User.Role.STUDENT, User.Role.PARENT}:
                    raise PermissionDenied("Anda tidak berhak membatalkan pesanan ini.")
                if role != User.Role.ADMIN and order.customer_id != request.user.id:
                    raise PermissionDenied("Pesanan ini bukan milik Anda.")
                if order.status not in {Order.Status.AWAITING_PAYMENT, Order.Status.PENDING_REVIEW}:
                    raise ValidationError("Pesanan yang sudah diterima tidak dapat dibatalkan melalui aksi ini.")
                release_order_stock(order, request.user, "Pesanan dibatalkan; stok dikembalikan")
                if order.payment.status == Payment.Status.PENDING_VERIFICATION:
                    order.payment.status = Payment.Status.EXPIRED
                    order.payment.save(update_fields=("status", "updated_at"))
                elif order.payment.status == Payment.Status.PAID and order.payment.method != Payment.Method.CASH:
                    order.payment.status = Payment.Status.REFUND_PENDING
                    order.payment.verification_note = "Pesanan dibatalkan; pengembalian dana perlu diproses manual."
                    order.payment.save(update_fields=("status", "verification_note", "updated_at"))
                record_order_status(order, Order.Status.CANCELLED, request.user, note or "Dibatalkan")
                if role != User.Role.ADMIN:
                    notify_admins("order.cancelled", "Pesanan dibatalkan", "Pesanan " + order.code + " dibatalkan pelanggan.")
            elif action == "submit_payment_reference":
                if role not in {User.Role.STUDENT, User.Role.PARENT} or order.customer_id != request.user.id:
                    raise PermissionDenied("Hanya pemilik pesanan yang dapat mengirim referensi pembayaran.")
                if order.status != Order.Status.AWAITING_PAYMENT or order.payment.method != Payment.Method.BANK_TRANSFER:
                    raise ValidationError("Pesanan ini tidak menunggu pembayaran transfer bank.")
                if order.payment.status not in {Payment.Status.UNPAID, Payment.Status.FAILED}:
                    raise ValidationError("Referensi pembayaran sudah dikirim atau pesanan tidak dapat dibayar.")
                payment_reference = str(request.data.get("payment_reference", "")).strip()
                if not payment_reference or len(payment_reference) > 120:
                    raise ValidationError({"payment_reference": "Masukkan nomor referensi transfer yang valid (maksimal 120 karakter)."})
                order.payment.payment_reference = payment_reference
                order.payment.status = Payment.Status.PENDING_VERIFICATION
                order.payment.save(update_fields=("payment_reference", "status", "updated_at"))
                notify_admins("payment.transfer.submitted", "Referensi transfer masuk", "Pesanan " + order.code + " menunggu verifikasi transfer.")
            elif action == "verify_payment":
                if role != User.Role.ADMIN:
                    raise PermissionDenied("Hanya admin yang dapat memverifikasi pembayaran.")
                if order.status != Order.Status.AWAITING_PAYMENT or order.payment.method not in {Payment.Method.QRIS, Payment.Method.BANK_TRANSFER} or order.payment.status != Payment.Status.PENDING_VERIFICATION:
                    raise ValidationError("Pesanan ini tidak sedang menunggu verifikasi pembayaran.")
                if order.payment.method == Payment.Method.QRIS and order.expires_at and order.expires_at <= timezone.now():
                    raise ValidationError("Batas pembayaran QRIS telah berakhir. Pembayaran tidak dapat diverifikasi.")
                order.payment.status = Payment.Status.PAID
                order.payment.paid_at = timezone.now()
                order.payment.verified_by = request.user
                order.payment.verification_note = note
                order.payment.save(update_fields=("status", "paid_at", "verified_by", "verification_note", "updated_at"))
                record_order_status(order, Order.Status.PENDING_REVIEW, request.user, "Pembayaran diverifikasi admin")
            elif action == "reject_payment":
                if role != User.Role.ADMIN:
                    raise PermissionDenied("Hanya admin yang dapat menolak referensi pembayaran.")
                if order.status != Order.Status.AWAITING_PAYMENT or order.payment.method != Payment.Method.BANK_TRANSFER or order.payment.status != Payment.Status.PENDING_VERIFICATION:
                    raise ValidationError("Transfer ini tidak sedang menunggu verifikasi.")
                order.payment.status = Payment.Status.FAILED
                order.payment.verified_by = request.user
                order.payment.verification_note = note or "Referensi pembayaran tidak cocok. Kirim referensi yang benar."
                order.payment.save(update_fields=("status", "verified_by", "verification_note", "updated_at"))
                notify_user(order.customer, "payment.transfer.rejected", "Referensi transfer perlu diperbaiki", order.payment.verification_note, "/orders/" + order.code)
            elif action == "mark_refunded":
                if role != User.Role.ADMIN:
                    raise PermissionDenied("Hanya admin yang dapat mencatat pengembalian dana.")
                if order.payment.status != Payment.Status.REFUND_PENDING:
                    raise ValidationError("Pembayaran ini tidak sedang menunggu pengembalian dana.")
                order.payment.status = Payment.Status.REFUNDED
                order.payment.verified_by = request.user
                order.payment.verification_note = note or "Pengembalian dana telah dilakukan dan dikonfirmasi admin."
                order.payment.save(update_fields=("status", "verified_by", "verification_note", "updated_at"))
            elif action == "accept":
                if role != User.Role.ADMIN:
                    raise PermissionDenied("Hanya admin yang dapat menerima pesanan.")
                if order.status != Order.Status.PENDING_REVIEW:
                    raise ValidationError("Pesanan belum siap diterima atau sudah diproses.")
                if order.payment.method != Payment.Method.CASH and order.payment.status != Payment.Status.PAID:
                    raise ValidationError("Verifikasi pembayaran sebelum menerima pesanan.")
                record_order_status(order, Order.Status.ACCEPTED, request.user, note)
            elif action == "reject":
                if role != User.Role.ADMIN:
                    raise PermissionDenied("Hanya admin yang dapat menolak pesanan.")
                if order.status not in {Order.Status.PENDING_REVIEW, Order.Status.AWAITING_PAYMENT}:
                    raise ValidationError("Pesanan yang sudah diterima tidak dapat ditolak.")
                release_order_stock(order, request.user, "Pesanan ditolak; stok dikembalikan")
                if order.payment.status == Payment.Status.PENDING_VERIFICATION:
                    order.payment.status = Payment.Status.EXPIRED
                    order.payment.save(update_fields=("status", "updated_at"))
                elif order.payment.status == Payment.Status.PAID:
                    order.payment.status = Payment.Status.REFUND_PENDING
                    order.payment.verification_note = "Pesanan ditolak; pengembalian dana perlu diproses manual."
                    order.payment.save(update_fields=("status", "verification_note", "updated_at"))
                record_order_status(order, Order.Status.REJECTED, request.user, note or "Ditolak oleh admin")
            else:
                if role != User.Role.ADMIN:
                    raise PermissionDenied("Aksi ini hanya tersedia untuk admin.")
                transitions = {"start_processing": (Order.Status.ACCEPTED, Order.Status.PROCESSING), "mark_ready": (Order.Status.PROCESSING, Order.Status.READY), "complete": (Order.Status.READY, Order.Status.COMPLETED)}
                if action not in transitions:
                    raise ValidationError({"action": "Aksi pesanan tidak dikenal."})
                expected, target = transitions[action]
                allowed = order.status in expected if isinstance(expected, tuple) else order.status == expected
                if not allowed:
                    raise ValidationError("Perubahan status tidak sesuai alur pesanan.")
                if action == "complete" and order.fulfillment != Order.Fulfillment.PICKUP:
                    raise ValidationError("Hanya pesanan ambil di koperasi yang dapat diselesaikan.")
                if action == "complete" and not pickup_is_open():
                    raise ValidationError("Pengambilan hanya dapat dikonfirmasi pada hari dan jam operasional koperasi.")
                if action == "complete" and order.payment.method != Payment.Method.CASH and order.payment.status != Payment.Status.PAID:
                    raise ValidationError("Pembayaran transfer/QRIS harus diverifikasi sebelum barang diserahkan.")
                if action == "complete" and order.payment.method == Payment.Method.CASH:
                    order.payment.status = Payment.Status.PAID
                    order.payment.paid_at = timezone.now()
                    order.payment.verified_by = request.user
                    order.payment.save(update_fields=("status", "paid_at", "verified_by", "updated_at"))
                record_order_status(order, target, request.user, note)
            AuditLog.objects.create(actor=request.user, event=f"order.{action}", target_type="order", target_id=order.code, metadata={"status": order.status, "note": note})
            order.refresh_from_db()
        return Response(OrderSerializer(order).data)
