import hashlib
import json
from django.db import transaction
from django.contrib.auth import get_user_model
from django.db.models import F, Sum, Count
from django.db.models.functions import TruncDate, TruncHour, TruncMonth, TruncWeek
from datetime import datetime, timedelta
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from core.models import AuditLog, Notification, StoreSetting
from .delivery import quote_delivery, store_is_open
from .models import InventoryMovement, Order, OrderItem, PaymentEvent, Product
from .permissions import IsAdminRole as CommerceAdminOnly
from .serializers import InventoryMovementSerializer, cancel_block_reason, OrderCreateSerializer, OrderReadSerializer, ProductSerializer
from core.pagination import OptionalPaginationMixin


def account_notification_enabled(user, preference, default=True):
    key = f"user_notification_preferences_{user.pk}"
    saved = StoreSetting.objects.filter(key=key).only("value").first()
    values = saved.value if saved and isinstance(saved.value, dict) else {}
    return values.get(preference, default)


def notify_user(user, title, message, kind="info", target_code=""):
    preference = {
        "order": "order_updates",
        "payment": "order_updates",
        "stock": "stock_updates",
        "announcement": "promotions",
        "promotion": "promotions",
    }.get(kind)
    if preference and user.role in ("student", "parent"):
        # Every notification type, including announcements/promotions, is on unless the account turned it off.
        if not account_notification_enabled(user, preference, True):
            return
    Notification.objects.create(recipient=user, title=title, message=message, kind=kind, target_code=target_code)


def notify_customers(title, message, kind="stock"):
    User = get_user_model()
    recipients = list(User.objects.filter(is_active=True, role__in=("student", "parent")).only("id", "role"))
    keys = [f"user_notification_preferences_{user.pk}" for user in recipients]
    saved = {
        item.key: item.value
        for item in StoreSetting.objects.filter(key__in=keys)
    }
    preference = "stock_updates" if kind == "stock" else "promotions"
    default = True
    notifications = []
    for user in recipients:
        values = saved.get(f"user_notification_preferences_{user.pk}")
        if not isinstance(values, dict):
            values = {}
        if values.get(preference, default):
            notifications.append(Notification(recipient=user, title=title, message=message, kind=kind))
    if notifications:
        Notification.objects.bulk_create(notifications)
    return len(notifications)


def notify_admins(title, message, kind="order", target_code=""):
    preferences = StoreSetting.objects.filter(key="notification_preferences").first()
    preference_key = "low_stock_alerts" if kind == "stock" else "order_alerts"
    if preferences and isinstance(preferences.value, dict) and not preferences.value.get(preference_key, True):
        return
    User = get_user_model()
    Notification.objects.bulk_create([
        Notification(recipient=user, title=title, message=message, kind=kind, target_code=target_code)
        for user in User.objects.filter(role="admin", is_active=True)
    ])


def pickup_is_open(now):
    return store_is_open(now)


NET_REVENUE = F("total") - F("delivery_fee")  # ongkir diteruskan ke kurir, bukan pendapatan koperasi


def cancel_order(order, actor, now):
    """Batalkan pesanan dan kembalikan stok tepat satu kali; pemanggil mengunci baris order."""
    changed = Order.objects.filter(pk=order.pk, status__in=(Order.Status.PENDING, Order.Status.ACCEPTED, Order.Status.READY)).update(status=Order.Status.CANCELLED, cancelled_at=now)
    if not changed:
        raise ValidationError({"status": "Pesanan sudah berubah atau sudah dibatalkan; stok tidak dikembalikan ulang."})
    for item in order.items.all():
        Product.objects.filter(pk=item.product_id).update(stock=F("stock") + item.quantity)
        InventoryMovement.objects.create(product_id=item.product_id, actor=actor, quantity_delta=item.quantity, reason="order_cancelled", reference=order.code)
    order.status, order.cancelled_at = Order.Status.CANCELLED, now


class ProductListCreateView(OptionalPaginationMixin, generics.ListCreateAPIView):
    serializer_class = ProductSerializer

    @transaction.atomic
    def perform_create(self, serializer):
        note = serializer.validated_data.get("stock_note", "").strip()
        product = serializer.save()
        if product.stock:
            InventoryMovement.objects.create(product=product, actor=self.request.user, quantity_delta=product.stock, reason="initial_stock", reference=note)
        if product.is_active and product.stock > 0:
            notify_customers("Produk baru tersedia", f"{product.name} sekarang tersedia di katalog MettaMart.", kind="stock")
        if product.stock < 10:
            preferences = StoreSetting.objects.filter(key="notification_preferences").first()
            if not preferences or not isinstance(preferences.value, dict) or preferences.value.get("low_stock_alerts", True):
                notify_admins("Stok produk menipis", f"{product.name} hanya tersisa {product.stock} unit.", kind="stock")

    def get_queryset(self):
        # Archived products remain in the database for historical references,
        # but must not appear in active product catalogs, including admin stock.
        return Product.objects.filter(is_active=True)

    def get_permissions(self):
        return [CommerceAdminOnly()] if self.request.method == "POST" else [permissions.IsAuthenticated()]


class ProductDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    permission_classes = [CommerceAdminOnly]

    @transaction.atomic
    def perform_update(self, serializer):
        # Lock and refresh the row before comparing stock so concurrent admin edits
        # cannot produce a stale stock delta in the inventory ledger.
        locked_product = Product.objects.select_for_update().get(pk=serializer.instance.pk)
        serializer.instance = locked_product
        previous_stock = locked_product.stock
        note = serializer.validated_data.get("stock_note", "").strip()
        product = serializer.save()
        delta = product.stock - previous_stock
        if delta:
            InventoryMovement.objects.create(product=product, actor=self.request.user, quantity_delta=delta, reason="manual_adjustment", reference=note)
            if previous_stock <= 0 and product.stock > 0 and product.is_active:
                notify_customers("Stok tersedia kembali", f"{product.name} sekarang tersedia kembali di MettaMart.", kind="stock")
            if previous_stock >= 10 and product.stock < 10:
                preferences = StoreSetting.objects.filter(key="notification_preferences").first()
                if not preferences or not isinstance(preferences.value, dict) or preferences.value.get("low_stock_alerts", True):
                    notify_admins("Stok produk menipis", f"{product.name} hanya tersisa {product.stock} unit.", kind="stock")

    def perform_destroy(self, instance):
        # Keep products referenced by stock history or orders so audit trails remain valid.
        if instance.stock_movements.exists() or instance.order_items.exists():
            if instance.is_active:
                instance.is_active = False
                instance.save(update_fields=["is_active", "updated_at"])
            return
        # `image` is a plain text column (Base64 data URL, or a legacy media path), not a
        # FileField, so there is no file-storage object to clean up here. Deleting the row
        # also removes the stored image data.
        instance.delete()


class OrderListCreateView(OptionalPaginationMixin, generics.ListCreateAPIView):
    def get_queryset(self):
        qs = Order.objects.select_related("customer", "beneficiary").prefetch_related("items")
        if self.request.user.role != "admin":
            qs = qs.filter(customer=self.request.user)
        return qs

    def get_serializer_class(self):
        return OrderCreateSerializer if self.request.method == "POST" else OrderReadSerializer

    def create(self, request, *args, **kwargs):
        if request.user.role not in ("student", "parent"):
            return Response({"detail": "Pembuatan pesanan mandiri hanya tersedia untuk siswa dan orang tua."}, status=status.HTTP_403_FORBIDDEN)

        # Validate first: GoSend address geocoding performs an external network
        # request and must never hold the order/stock database transaction open.
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            order = serializer.save()
            if getattr(serializer, "idempotent_replay", False):
                return Response(OrderReadSerializer(order).data, status=status.HTTP_200_OK)
            AuditLog.objects.create(actor=request.user, event="order.created", target_type="order", target_id=str(order.pk), metadata={"code": order.code, "total": order.total})
            via = " (diantar via GoSend)" if order.delivery_method == Order.DeliveryMethod.GOSEND else ""
            notify_admins("Pesanan baru masuk", f"{request.user.full_name} membuat pesanan {order.code}{via}.", target_code=order.code)
            response_data = OrderReadSerializer(order).data

        return Response(response_data, status=status.HTTP_201_CREATED)


class DeliveryQuoteView(APIView):
    """Estimasi ongkir GoSend untuk alamat tujuan (siswa/orang tua)."""

    def post(self, request):
        if request.user.role not in ("student", "parent"):
            return Response({"detail": "Estimasi ongkir hanya tersedia untuk siswa dan orang tua."}, status=status.HTTP_403_FORBIDDEN)
        quote = quote_delivery(str(request.data.get("address", "")))
        return Response({
            "distance_km": str(quote["distance_km"]) if quote.get("distance_km") is not None else None,
            "fee": quote["fee"],
            "manual_review": bool(quote.get("manual_review", False)),
            "message": quote.get("message", ""),
        })


class OrderCancelView(APIView):
    """Pelanggan membatalkan pesanannya sendiri, hanya selama belum dibayar."""

    @transaction.atomic
    def post(self, request, code):
        order = Order.objects.select_for_update().filter(code=code, customer=request.user).first()
        if not order:
            return Response({"detail": "Pesanan tidak ditemukan."}, status=404)
        reason = cancel_block_reason(order)
        if reason:
            raise ValidationError({"status": reason})
        cancel_order(order, request.user, timezone.now())
        order.save()
        AuditLog.objects.create(actor=request.user, event="order.cancel_by_customer", target_type="order", target_id=str(order.pk), metadata={"code": order.code})
        notify_user(request.user, "Pesanan dibatalkan", f"Pesanan {order.code} telah Anda batalkan dan stok dikembalikan.", kind="order", target_code=order.code)
        notify_admins("Pesanan dibatalkan pelanggan", f"{request.user.full_name} membatalkan pesanan {order.code}.", target_code=order.code)
        return Response(OrderReadSerializer(order).data)


class OrderDetailView(generics.RetrieveAPIView):
    serializer_class = OrderReadSerializer
    lookup_field = "code"

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["include_payment_info"] = True
        return context

    def get_queryset(self):
        qs = Order.objects.select_related("customer", "beneficiary").prefetch_related("items")
        return qs if self.request.user.role == "admin" else qs.filter(customer=self.request.user)


class AdminOrderListView(OptionalPaginationMixin, generics.ListAPIView):
    permission_classes = [CommerceAdminOnly]
    queryset = Order.objects.select_related("customer", "beneficiary").prefetch_related("items")
    serializer_class = OrderReadSerializer


class AdminOrderActionView(APIView):
    permission_classes = [CommerceAdminOnly]

    @transaction.atomic
    def post(self, request, code, action):
        order = Order.objects.select_for_update().filter(code=code).first()
        if not order:
            return Response({"detail": "Pesanan tidak ditemukan."}, status=404)
        now = timezone.now()
        if action == "accept" and order.status == Order.Status.PENDING:
            if order.delivery_method == Order.DeliveryMethod.GOSEND and not order.delivery_fee_confirmed:
                raise ValidationError({"delivery_fee": "Tetapkan ongkir manual terlebih dahulu sebelum mengonfirmasi pesanan."})
            order.status, order.accepted_at = Order.Status.ACCEPTED, now
        elif action == "ready" and order.status == Order.Status.ACCEPTED:
            order.status, order.ready_at = Order.Status.READY, now
        elif action == "start-delivery" and order.delivery_method == Order.DeliveryMethod.GOSEND and order.status == Order.Status.READY:
            if not pickup_is_open(now):
                raise ValidationError({"delivery": "Penyerahan pesanan ke kurir hanya dapat dilakukan pada jam operasional koperasi."})
            if order.payment_method != Order.PaymentMethod.CASH and order.payment_status != Order.PaymentStatus.PAID:
                raise ValidationError({"payment_status": "Pembayaran transfer/QRIS harus diverifikasi sebelum pesanan diserahkan ke kurir."})
            order.status, order.delivering_at = Order.Status.DELIVERING, now
        elif action == "complete-delivery" and order.delivery_method == Order.DeliveryMethod.GOSEND and order.status == Order.Status.DELIVERING:
            order.status, order.completed_at = Order.Status.COMPLETED, now
            if order.payment_method == Order.PaymentMethod.CASH and order.payment_status == Order.PaymentStatus.UNPAID:
                order.payment_status = Order.PaymentStatus.PAID
                PaymentEvent.objects.create(order=order, actor=request.user, event="cash_collected", note="Tunai diterima saat pengantaran GoSend dikonfirmasi.")
        elif action == "complete-pickup" and order.delivery_method == Order.DeliveryMethod.PICKUP and order.status == Order.Status.READY:
            if not pickup_is_open(now):
                raise ValidationError({"pickup": "Pengambilan hanya dapat dikonfirmasi pada hari dan jam operasional koperasi. Atur jam operasional terlebih dahulu."})
            if order.payment_method != Order.PaymentMethod.CASH and order.payment_status != Order.PaymentStatus.PAID:
                raise ValidationError({"payment_status": "Pembayaran transfer/QRIS harus diverifikasi sebelum barang diserahkan."})
            order.status, order.completed_at = Order.Status.COMPLETED, now
            if order.payment_method == Order.PaymentMethod.CASH and order.payment_status == Order.PaymentStatus.UNPAID:
                order.payment_status = Order.PaymentStatus.PAID
                PaymentEvent.objects.create(order=order, actor=request.user, event="cash_collected", note="Tunai diterima saat pengambilan.")
        elif action == "cancel" and order.status in (Order.Status.PENDING, Order.Status.ACCEPTED, Order.Status.READY):
            if order.payment_status == Order.PaymentStatus.PAID:
                raise ValidationError({"payment_status": "Pesanan yang sudah dibayar tidak dapat dibatalkan. Kebijakan sistem tidak menyediakan pengembalian dana."})
            if order.payment_status == Order.PaymentStatus.PENDING:
                raise ValidationError({"payment_status": "Pembayaran sedang menunggu verifikasi. Rekonsiliasi pembayaran terlebih dahulu sebelum membatalkan pesanan."})
            cancel_order(order, request.user, now)
        else:
            raise ValidationError({"status": "Perubahan status pesanan tidak valid."})
        order.save()
        AuditLog.objects.create(actor=request.user, event=f"order.{action}", target_type="order", target_id=str(order.pk), metadata={"code": order.code})
        messages = {
            "accept": ("Pesanan sedang diproses", f"Pesanan {order.code} telah dikonfirmasi koperasi."),
            "ready": ("Pesanan siap diambil", f"Pesanan {order.code} sudah siap. Silakan ambil saat jam operasional."),
            "start-delivery": ("Pesanan sedang diantar", f"Pesanan {order.code} telah diserahkan kepada kurir GoSend dan sedang diantar ke alamat Anda."),
            "complete-delivery": ("Pesanan sudah diantar", f"Pesanan {order.code} telah diterima dan pengantaran dikonfirmasi Admin."),
            "complete-pickup": ("Pengambilan selesai", f"Pesanan {order.code} telah diserahkan."),
            "cancel": ("Pesanan dibatalkan", f"Pesanan {order.code} dibatalkan dan stok dikembalikan."),
        }
        if order.delivery_method == Order.DeliveryMethod.GOSEND:
            messages["ready"] = ("Pesanan siap diantar", f"Pesanan {order.code} sudah siap dan menunggu diserahkan kepada kurir GoSend.")
        title, message = messages[action]
        notify_user(order.customer, title, message, kind="order", target_code=order.code)
        return Response(OrderReadSerializer(order).data)


class AdminDeliveryFeeActionView(APIView):
    permission_classes = [CommerceAdminOnly]

    @transaction.atomic
    def post(self, request, code):
        order = Order.objects.select_for_update().filter(code=code).first()
        if not order:
            return Response({"detail": "Pesanan tidak ditemukan."}, status=404)
        if order.delivery_method != Order.DeliveryMethod.GOSEND:
            raise ValidationError({"delivery_fee": "Ongkir manual hanya berlaku untuk pesanan GoSend."})
        if order.status != Order.Status.PENDING or order.payment_status != Order.PaymentStatus.UNPAID:
            raise ValidationError({"delivery_fee": "Ongkir hanya dapat ditetapkan sebelum pesanan dikonfirmasi dan dibayar."})
        if order.delivery_fee_confirmed:
            raise ValidationError({"delivery_fee": "Ongkir pesanan ini sudah ditetapkan."})
        value = request.data.get("delivery_fee")
        if isinstance(value, bool):
            raise ValidationError({"delivery_fee": "Ongkir harus berupa bilangan bulat Rp0–1.000.000."})
        try:
            fee = int(value)
        except (TypeError, ValueError):
            raise ValidationError({"delivery_fee": "Ongkir harus berupa bilangan bulat Rp0–1.000.000."})
        if fee < 0 or fee > 1_000_000 or str(fee) != str(value).strip():
            raise ValidationError({"delivery_fee": "Ongkir harus berupa bilangan bulat Rp0–1.000.000."})

        order.delivery_fee = fee
        order.total = order.subtotal + fee
        order.delivery_fee_confirmed = True
        order.save(update_fields=["delivery_fee", "total", "delivery_fee_confirmed", "updated_at"])
        PaymentEvent.objects.create(
            order=order,
            actor=request.user,
            event="delivery_fee_set",
            note=f"Ongkir manual ditetapkan sebesar Rp{fee}.",
        )
        AuditLog.objects.create(
            actor=request.user,
            event="delivery.fee_set",
            target_type="order",
            target_id=str(order.pk),
            metadata={"code": order.code, "delivery_fee": fee, "total": order.total},
        )
        notify_user(
            order.customer,
            "Ongkir pesanan telah ditetapkan",
            f"Ongkir pesanan {order.code} sebesar Rp{fee:,}. Total akhir yang harus dibayar Rp{order.total:,}. Silakan lanjutkan setelah menerima informasi ini.",
            kind="order",
            target_code=order.code,
        )
        return Response(OrderReadSerializer(order).data)


class AdminPaymentActionView(APIView):
    permission_classes = [CommerceAdminOnly]

    @transaction.atomic
    def post(self, request, code, action):
        order = Order.objects.select_for_update().filter(code=code).first()
        if not order:
            return Response({"detail": "Pesanan tidak ditemukan."}, status=404)
        if order.status == Order.Status.CANCELLED:
            raise ValidationError({"payment_status": "Pembayaran pesanan yang dibatalkan tidak dapat diverifikasi."})
        note = str(request.data.get("note", "")).strip()
        if action == "reject" and len(note) < 3:
            raise ValidationError({"note": "Alasan penolakan wajib diisi (minimal 3 karakter) agar pelanggan tahu tindakan yang perlu dilakukan."})
        if len(note) > 500:
            raise ValidationError({"note": "Catatan maksimal 500 karakter."})

        if action == "verify" and order.payment_method != Order.PaymentMethod.CASH and order.payment_status == Order.PaymentStatus.PENDING:
            order.payment_status = Order.PaymentStatus.PAID
        elif action == "reject" and order.payment_method != Order.PaymentMethod.CASH and order.payment_status == Order.PaymentStatus.PENDING:
            order.payment_status = Order.PaymentStatus.FAILED
        else:
            raise ValidationError({"payment_status": "Verifikasi pembayaran tidak valid."})
        order.save(update_fields=["payment_status", "updated_at"])
        PaymentEvent.objects.create(order=order, actor=request.user, event=action, note=note)
        AuditLog.objects.create(actor=request.user, event=f"payment.{action}", target_type="order", target_id=str(order.pk), metadata={"code": order.code, "note": note})
        title = "Pembayaran berhasil diverifikasi" if action == "verify" else "Pembayaran perlu diperiksa kembali"
        message = (
            f"Pembayaran pesanan {order.code} telah diverifikasi dan dinyatakan lunas."
            if action == "verify"
            else f"Pembayaran pesanan {order.code} belum dapat diverifikasi. Alasan: {note}"
        )
        notify_user(order.customer, title, message, kind="payment", target_code=order.code)
        return Response(OrderReadSerializer(order).data)


class PaymentSubmissionView(APIView):
    @transaction.atomic
    def post(self, request, code):
        # Serialize payment submissions against admin verification and cancellation.
        order = Order.objects.select_for_update().filter(code=code, customer=request.user).first()
        if not order:
            return Response({"detail": "Pesanan tidak ditemukan."}, status=404)
        if order.status == Order.Status.CANCELLED:
            raise ValidationError({"payment": "Pesanan yang dibatalkan tidak dapat menerima konfirmasi pembayaran."})
        if order.payment_method == Order.PaymentMethod.CASH:
            raise ValidationError({"payment": "Pembayaran tunai dikonfirmasi admin saat penyerahan."})
        if order.status not in (Order.Status.ACCEPTED, Order.Status.READY):
            raise ValidationError({"payment": "Pembayaran baru dapat dilakukan setelah pesanan dikonfirmasi admin."})
        if order.delivery_method == Order.DeliveryMethod.GOSEND and not order.delivery_fee_confirmed:
            raise ValidationError({"payment": "Ongkir masih menunggu penetapan admin. Tunggu notifikasi total akhir sebelum membayar."})
        if order.payment_status not in (Order.PaymentStatus.UNPAID, Order.PaymentStatus.FAILED):
            raise ValidationError({"payment": "Status pembayaran tidak dapat diubah."})
        sender_name = str(request.data.get("sender_name", "")).strip()[:120]
        payment_source = str(request.data.get("payment_source", "")).strip()[:80]
        account_last4 = str(request.data.get("account_last4", "")).strip()
        if not sender_name:
            raise ValidationError({"sender_name": "Nama pemilik rekening/e-wallet wajib diisi."})
        if not payment_source:
            raise ValidationError({"payment_source": "Nama bank atau e-wallet asal wajib diisi."})
        if account_last4 and (len(account_last4) != 4 or not account_last4.isdigit()):
            raise ValidationError({"account_last4": "Isi tepat 4 digit terakhir rekening, atau kosongkan jika tidak ada."})
        note = str(request.data.get("note", "")).strip()[:300]
        order.payment_sender_name = sender_name
        order.payment_source = payment_source
        order.payment_account_last4 = account_last4
        order.payment_status = Order.PaymentStatus.PENDING
        order.save(update_fields=["payment_sender_name", "payment_source", "payment_account_last4", "payment_status", "updated_at"])
        event_note = f"Pengirim: {sender_name}; sumber: {payment_source}; rekening akhir: {account_last4 or '-'}"
        if note:
            event_note += f"; catatan: {note}"
        PaymentEvent.objects.create(order=order, actor=request.user, event="submitted", note=event_note[:500])
        AuditLog.objects.create(actor=request.user, event="payment.submitted", target_type="order", target_id=str(order.pk), metadata={"code": order.code})
        notify_admins("Konfirmasi pembayaran masuk", f"{request.user.full_name} mengirim identitas pembayaran untuk {order.code} atas nama {sender_name} ({payment_source}).", kind="payment", target_code=order.code)
        return Response(OrderReadSerializer(order).data)


class AdminInventoryMovementListView(OptionalPaginationMixin, generics.ListAPIView):
    default_limit = 200
    permission_classes = [CommerceAdminOnly]
    queryset = InventoryMovement.objects.select_related("product", "actor").all().order_by("-created_at")
    serializer_class = InventoryMovementSerializer


class AdminSalesReportView(APIView):
    permission_classes = [CommerceAdminOnly]

    def get(self, request):
        today = timezone.localdate()
        now = timezone.now()
        period = str(request.query_params.get("period", "7d"))
        start = end = None
        bucket = "day"

        month_start = today.replace(day=1)
        if period == "1d":
            start, end, bucket = today - timedelta(days=1), today, "three_hours"
        elif period == "7d":
            start, end, bucket = today - timedelta(days=6), today, "day"
        elif period == "1m":
            start, end, bucket = today - timedelta(days=29), today, "week"
        elif period == "3m":
            start, end, bucket = today - timedelta(days=89), today, "month"
        elif period == "1y":
            start, end, bucket = today - timedelta(days=364), today, "month"
        elif period == "custom":
            try:
                start = datetime.strptime(request.query_params.get("from", ""), "%Y-%m-%d").date()
                end = datetime.strptime(request.query_params.get("to", ""), "%Y-%m-%d").date()
            except (TypeError, ValueError):
                raise ValidationError({"date_range": "Tanggal awal dan akhir wajib diisi dengan format yang valid."})
            if start > end:
                raise ValidationError({"date_range": "Tanggal awal tidak boleh melewati tanggal akhir."})
            span = (end - start).days + 1
            bucket = "day" if span <= 7 else "week" if span <= 45 else "month"
        else:
            raise ValidationError({"period": "Periode laporan tidak dikenal."})

        paid_orders = Order.objects.filter(
            status=Order.Status.COMPLETED,
            payment_status=Order.PaymentStatus.PAID,
            completed_at__isnull=False,
        )
        today_summary = paid_orders.filter(completed_at__date=today).aggregate(total=Sum(NET_REVENUE), count=Count("id"))
        month_summary = paid_orders.filter(completed_at__date__gte=month_start, completed_at__date__lte=today).aggregate(total=Sum(NET_REVENUE), count=Count("id"))

        if bucket == "three_hours":
            # Eight rolling three-hour windows covering exactly the last 24 hours.
            first_boundary = now - timedelta(hours=24)
            daily = []
            for index in range(8):
                interval_start = first_boundary + timedelta(hours=index * 3)
                interval_end = interval_start + timedelta(hours=3)
                aggregate = paid_orders.filter(
                    completed_at__gte=interval_start,
                    completed_at__lt=min(interval_end, now),
                ).aggregate(total=Sum(NET_REVENUE), count=Count("id"))
                local_start = timezone.localtime(interval_start)
                local_end = timezone.localtime(min(interval_end, now))
                daily.append({
                    "date": interval_start.isoformat(),
                    "label": f"{local_start:%H.%M}–{local_end:%H.%M}",
                    "total": aggregate["total"] or 0,
                    "orders": aggregate["count"] or 0,
                })
        else:
            scoped_orders = paid_orders.filter(completed_at__date__gte=start, completed_at__date__lte=end)
            if bucket == "day":
                grouped = scoped_orders.annotate(bucket=TruncDate("completed_at")).values("bucket").annotate(total=Sum(NET_REVENUE), count=Count("id")).order_by("bucket")
                values = {row["bucket"].isoformat(): row for row in grouped}
                daily = []
                day = start
                while day <= end:
                    row = values.get(day.isoformat(), {})
                    daily.append({"date": day.isoformat(), "label": day.strftime("%d %b"), "total": row.get("total") or 0, "orders": row.get("count") or 0})
                    day += timedelta(days=1)
            elif bucket == "week":
                grouped = scoped_orders.annotate(bucket=TruncWeek("completed_at")).values("bucket").annotate(total=Sum(NET_REVENUE), count=Count("id")).order_by("bucket")
                values = {row["bucket"].date().isoformat(): row for row in grouped}
                week = start - timedelta(days=start.weekday())
                daily = []
                while week <= end:
                    row = values.get(week.isoformat(), {})
                    daily.append({"date": week.isoformat(), "label": week.strftime("%d %b"), "total": row.get("total") or 0, "orders": row.get("count") or 0})
                    week += timedelta(days=7)
            else:
                grouped = scoped_orders.annotate(bucket=TruncMonth("completed_at")).values("bucket").annotate(total=Sum(NET_REVENUE), count=Count("id")).order_by("bucket")
                values = {row["bucket"].date().replace(day=1).isoformat(): row for row in grouped}
                month = start.replace(day=1)
                daily = []
                while month <= end:
                    row = values.get(month.isoformat(), {})
                    daily.append({"date": month.isoformat(), "label": month.strftime("%b %y"), "total": row.get("total") or 0, "orders": row.get("count") or 0})
                    month = (month.replace(day=28) + timedelta(days=4)).replace(day=1)

        product_orders = Order.objects.filter(
            status=Order.Status.COMPLETED,
            payment_status=Order.PaymentStatus.PAID,
            completed_at__isnull=False,
        )
        if period == "1d":
            product_orders = product_orders.filter(completed_at__gte=now - timedelta(hours=24), completed_at__lte=now)
        else:
            product_orders = product_orders.filter(completed_at__date__gte=start, completed_at__date__lte=end)
        top_products = list(
            OrderItem.objects.filter(order__in=product_orders).values("product_name").annotate(
                quantity=Sum("quantity"), revenue=Sum("line_total")
            ).order_by("-quantity", "-revenue")[:5]
        )
        month_total = month_summary["total"] or 0
        month_count = month_summary["count"] or 0
        return Response({
            "period": {"from": start.isoformat(), "to": end.isoformat(), "type": period},
            "today": {"revenue": today_summary["total"] or 0, "orders": today_summary["count"] or 0},
            "month": {"revenue": month_total, "orders": month_count, "average_order": round(month_total / month_count) if month_count else 0},
            "daily": daily,
            "top_products": top_products,
        })

class AdminDashboardView(APIView):
    permission_classes = [CommerceAdminOnly]

    def get(self, request):
        from accounts.models import User
        today = timezone.localdate()
        seven_days_ago = today - timedelta(days=6)
        products = Product.objects.filter(is_active=True)
        orders = Order.objects.all()
        completed_paid = orders.filter(
            status=Order.Status.COMPLETED,
            payment_status=Order.PaymentStatus.PAID,
            completed_at__isnull=False,
        )
        daily_rows = completed_paid.filter(
            completed_at__date__gte=seven_days_ago,
            completed_at__date__lte=today,
        ).values("completed_at__date").annotate(
            revenue=Sum(NET_REVENUE), orders=Count("id")
        ).order_by("completed_at__date")
        by_day = {row["completed_at__date"].isoformat(): row for row in daily_rows}
        daily = []
        for offset in range(6, -1, -1):
            day = today - timedelta(days=offset)
            row = by_day.get(day.isoformat(), {})
            daily.append({
                "date": day.isoformat(),
                "revenue": row.get("revenue") or 0,
                "orders": row.get("orders") or 0,
            })
        recent = orders.select_related("customer").prefetch_related("items")[:6]
        return Response({
            "products": products.count(),
            "orders_pending": orders.filter(status=Order.Status.PENDING).count(),
            "orders_processing": orders.filter(status=Order.Status.ACCEPTED).count(),
            "orders_ready": orders.filter(status=Order.Status.READY).count(),
            "customers": User.objects.filter(role__in=(User.Role.STUDENT, User.Role.PARENT), is_active=True).count(),
            "low_stock": list(products.filter(stock__lt=10).order_by("stock", "name").values("id", "name", "stock")[:8]),
            "today_revenue": completed_paid.filter(completed_at__date=today).aggregate(total=Sum(NET_REVENUE))["total"] or 0,
            "daily": daily,
            "recent_orders": [{
                "code": order.code,
                "customer_name": "Penjualan POS" if order.sales_channel == "pos" else order.customer.full_name,
                "beneficiary_name": order.beneficiary.full_name if order.beneficiary_id else None,
                "total": order.total,
                "delivery_method": order.delivery_method,
                "sales_channel": order.sales_channel,
                "status": order.status,
                "payment_status": order.payment_status,
                "created_at": order.created_at,
            } for order in recent],
        })

class AdminPOSCheckoutView(APIView):
    permission_classes = [CommerceAdminOnly]

    @transaction.atomic
    def post(self, request):
        rows = request.data.get("items")
        method = request.data.get("payment_method", "cash")
        idempotency_key = request.headers.get("Idempotency-Key", "").strip()
        if not idempotency_key:
            raise ValidationError({"idempotency_key": "Kunci transaksi wajib dikirim. Muat ulang halaman POS lalu coba lagi."})
        if len(idempotency_key) < 8 or len(idempotency_key) > 64:
            raise ValidationError({"idempotency_key": "Kunci transaksi tidak valid."})
        if method not in Order.PaymentMethod.values:
            raise ValidationError({"payment_method": "Metode pembayaran POS tidak valid."})
        if not isinstance(rows, list) or not rows:
            raise ValidationError({"items": "Tambahkan minimal satu produk ke transaksi."})
        setting = StoreSetting.objects.filter(key="payment_methods").first()
        enabled = setting.value if setting and isinstance(setting.value, dict) else {"cash": True, "bank_transfer": True, "qris": True}
        if not enabled.get(method, False):
            raise ValidationError({"payment_method": "Metode pembayaran ini sedang dinonaktifkan."})
        now = timezone.now()
        cleaned = []
        seen = set()
        for row in rows:
            try:
                raw_product_id, raw_quantity = row.get("product_id"), row.get("quantity")
            except AttributeError:
                raise ValidationError({"items": "Produk dan jumlah harus valid."})
            # Reject booleans and floats instead of accepting Python's lossy int conversion.
            if isinstance(raw_product_id, bool) or isinstance(raw_quantity, bool):
                raise ValidationError({"items": "Produk dan jumlah harus berupa bilangan bulat yang valid."})
            if not isinstance(raw_product_id, (int, str)) or not isinstance(raw_quantity, (int, str)):
                raise ValidationError({"items": "Produk dan jumlah harus berupa bilangan bulat yang valid."})
            try:
                product_id, quantity = int(raw_product_id), int(raw_quantity)
            except (TypeError, ValueError):
                raise ValidationError({"items": "Produk dan jumlah harus berupa bilangan bulat yang valid."})
            if (isinstance(raw_product_id, str) and not raw_product_id.strip().lstrip("+").isdigit()) or (isinstance(raw_quantity, str) and not raw_quantity.strip().lstrip("+").isdigit()):
                raise ValidationError({"items": "Produk dan jumlah harus berupa bilangan bulat yang valid."})
            if product_id in seen or quantity < 1:
                raise ValidationError({"items": "Produk tidak boleh duplikat dan jumlah minimal 1."})
            seen.add(product_id)
            cleaned.append({"product_id": product_id, "quantity": quantity})
        fingerprint_payload = {
            "items": cleaned,
            "payment_method": method,
            "note": str(request.data.get("note", "")).strip()[:500],
            "cash_received": request.data.get("cash_received") if method == Order.PaymentMethod.CASH else None,
        }
        fingerprint = hashlib.sha256(json.dumps(fingerprint_payload, sort_keys=True, separators=(",", ":"), default=str).encode()).hexdigest()
        if idempotency_key:
            get_user_model().objects.select_for_update().get(pk=request.user.pk)
            existing = Order.objects.filter(idempotency_key=idempotency_key).first()
            if existing:
                if existing.customer_id != request.user.pk or existing.request_fingerprint != fingerprint or existing.sales_channel != "pos":
                    raise ValidationError({"idempotency_key": "Kunci ini sudah digunakan untuk transaksi lain."})
                return Response(OrderReadSerializer(existing).data, status=status.HTTP_200_OK)
        products = {
            product.id: product
            for product in Product.objects.select_for_update().filter(id__in=[row["product_id"] for row in cleaned], is_active=True).order_by("id")
        }
        if len(products) != len(cleaned):
            raise ValidationError({"items": "Satu atau lebih produk tidak tersedia."})
        total = 0
        for row in cleaned:
            product = products[row["product_id"]]
            if product.stock < row["quantity"]:
                raise ValidationError({"items": f"Stok {product.name} tidak mencukupi."})
            total += product.price * row["quantity"]
        cash_received = None
        if method == Order.PaymentMethod.CASH:
            try:
                cash_received = int(request.data.get("cash_received"))
            except (TypeError, ValueError):
                raise ValidationError({"cash_received": "Masukkan jumlah uang tunai yang diterima."})
            if cash_received < total:
                raise ValidationError({"cash_received": "Uang yang diterima kurang dari total transaksi."})
        note = str(request.data.get("note", "")).strip()[:500]
        order = Order.objects.create(
            customer=request.user,
            idempotency_key=idempotency_key or None,
            request_fingerprint=fingerprint if idempotency_key else "",
            sales_channel="pos",
            cash_received=cash_received,
            status=Order.Status.COMPLETED,
            payment_method=method,
            payment_status=Order.PaymentStatus.PAID,
            note=note,
            subtotal=total,
            total=total,
            accepted_at=now,
            ready_at=now,
            completed_at=now,
        )
        for row in cleaned:
            product = products[row["product_id"]]
            updated = Product.objects.filter(pk=product.pk, stock__gte=row["quantity"]).update(stock=F("stock") - row["quantity"])
            if not updated:
                raise ValidationError({"items": f"Stok {product.name} baru saja berubah. Muat ulang POS."})
            InventoryMovement.objects.create(product=product, actor=request.user, quantity_delta=-row["quantity"], reason="pos_sale", reference=order.code)
            OrderItem.objects.create(order=order, product=product, product_name=product.name, unit_price=product.price, quantity=row["quantity"], line_total=product.price * row["quantity"])
        PaymentEvent.objects.create(order=order, actor=request.user, event="pos_sale", note=(f"Uang diterima Rp{cash_received}; kembalian Rp{cash_received - total}." if cash_received is not None else "Pembayaran non-tunai diterima dan dikonfirmasi admin pada POS."))
        AuditLog.objects.create(actor=request.user, event="pos.checkout", target_type="order", target_id=str(order.pk), metadata={"code": order.code, "total": total, "payment_method": method})
        return Response(OrderReadSerializer(order).data, status=status.HTTP_201_CREATED)
