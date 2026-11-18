from django.db import transaction
from django.contrib.auth import get_user_model
from django.db.models import F, Sum, Count
from datetime import datetime, timedelta
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from core.models import AuditLog, Notification, StoreSetting
from .models import InventoryMovement, Order, OrderItem, PaymentEvent, Product
from .permissions import IsAdminRole as CommerceAdminOnly
from .serializers import InventoryMovementSerializer, OrderCreateSerializer, OrderReadSerializer, ProductSerializer


def notify_user(user, title, message, kind="info", target_code=""):
    Notification.objects.create(recipient=user, title=title, message=message, kind=kind, target_code=target_code)


def notify_admins(title, message, kind="order", target_code=""):
    User = get_user_model()
    Notification.objects.bulk_create([
        Notification(recipient=user, title=title, message=message, kind=kind, target_code=target_code)
        for user in User.objects.filter(role="admin", is_active=True)
    ])


def pickup_is_open(now):
    setting = StoreSetting.objects.filter(key="operating_hours").first()
    hours = setting.value if setting and isinstance(setting.value, dict) else {}
    days = hours.get("days", [])
    open_time, close_time = hours.get("open_time", ""), hours.get("close_time", "")
    if not open_time or not close_time:
        return False
    local_now = timezone.localtime(now)
    day_codes = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
    if day_codes[local_now.weekday()] not in days:
        return False
    opening = datetime.strptime(open_time, "%H:%M").time()
    closing = datetime.strptime(close_time, "%H:%M").time()
    return opening <= local_now.time().replace(tzinfo=None) <= closing




class ProductListCreateView(generics.ListCreateAPIView):
    serializer_class = ProductSerializer

    def perform_create(self, serializer):
        product = serializer.save()
        if product.stock:
            InventoryMovement.objects.create(product=product, actor=self.request.user, quantity_delta=product.stock, reason="initial_stock")

    def get_queryset(self):
        qs = Product.objects.all()
        if self.request.user.role != "admin":
            qs = qs.filter(is_active=True)
        return qs

    def get_permissions(self):
        return [CommerceAdminOnly()] if self.request.method == "POST" else [permissions.IsAuthenticated()]


class ProductDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    permission_classes = [CommerceAdminOnly]

    @transaction.atomic
    def perform_update(self, serializer):
        previous_stock = serializer.instance.stock
        product = serializer.save()
        delta = product.stock - previous_stock
        if delta:
            InventoryMovement.objects.create(product=product, actor=self.request.user, quantity_delta=delta, reason="manual_adjustment")

    def perform_destroy(self, instance):
        if instance.order_items.exists():
            instance.is_active = False
            instance.save(update_fields=["is_active", "updated_at"])
        else:
            instance.delete()


class OrderListCreateView(generics.ListCreateAPIView):
    def get_queryset(self):
        qs = Order.objects.select_related("customer").prefetch_related("items")
        if self.request.user.role != "admin":
            qs = qs.filter(customer=self.request.user)
        return qs

    def get_serializer_class(self):
        return OrderCreateSerializer if self.request.method == "POST" else OrderReadSerializer

    def create(self, request, *args, **kwargs):
        if request.user.role not in ("student", "parent"):
            return Response({"detail": "Pembuatan pesanan mandiri hanya tersedia untuk siswa dan orang tua."}, status=status.HTTP_403_FORBIDDEN)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = serializer.save()
        AuditLog.objects.create(actor=request.user, event="order.created", target_type="order", target_id=str(order.pk), metadata={"code": order.code, "total": order.total})
        notify_admins("Pesanan baru masuk", f"{request.user.full_name} membuat pesanan {order.code}.", target_code=order.code)
        return Response(OrderReadSerializer(order).data, status=status.HTTP_201_CREATED)


class OrderDetailView(generics.RetrieveAPIView):
    serializer_class = OrderReadSerializer
    lookup_field = "code"

    def get_queryset(self):
        qs = Order.objects.select_related("customer").prefetch_related("items")
        return qs if self.request.user.role == "admin" else qs.filter(customer=self.request.user)


class AdminOrderListView(generics.ListAPIView):
    permission_classes = [CommerceAdminOnly]
    queryset = Order.objects.select_related("customer").prefetch_related("items")
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
            order.status, order.accepted_at = Order.Status.ACCEPTED, now
        elif action == "ready" and order.status == Order.Status.ACCEPTED:
            order.status, order.ready_at = Order.Status.READY, now
        elif action == "complete-pickup" and order.status == Order.Status.READY:
            if not pickup_is_open(now):
                raise ValidationError({"pickup": "Pengambilan hanya dapat dikonfirmasi pada hari dan jam operasional koperasi. Atur jam operasional terlebih dahulu."})
            if order.payment_method != Order.PaymentMethod.CASH and order.payment_status != Order.PaymentStatus.PAID:
                raise ValidationError({"payment_status": "Pembayaran transfer/QRIS harus diverifikasi sebelum barang diserahkan."})
            order.status, order.completed_at = Order.Status.COMPLETED, now
            if order.payment_method == Order.PaymentMethod.CASH and order.payment_status == Order.PaymentStatus.UNPAID:
                order.payment_status = Order.PaymentStatus.PAID
                PaymentEvent.objects.create(order=order, actor=request.user, event="cash_collected", note="Tunai diterima saat pengambilan.")
        elif action == "cancel" and order.status in (Order.Status.PENDING, Order.Status.ACCEPTED):
            if order.payment_status == Order.PaymentStatus.PAID:
                raise ValidationError({"payment_status": "Pesanan yang sudah dibayar tidak dapat dibatalkan melalui alur biasa."})
            for item in order.items.all():
                Product.objects.filter(pk=item.product_id).update(stock=F("stock") + item.quantity)
                InventoryMovement.objects.create(product_id=item.product_id, actor=request.user, quantity_delta=item.quantity, reason="order_cancelled", reference=order.code)
            order.status, order.cancelled_at = Order.Status.CANCELLED, now
        else:
            raise ValidationError({"status": "Perubahan status pesanan tidak valid."})
        order.save()
        AuditLog.objects.create(actor=request.user, event=f"order.{action}", target_type="order", target_id=str(order.pk), metadata={"code": order.code})
        messages = {
            "accept": ("Pesanan sedang diproses", f"Pesanan {order.code} telah dikonfirmasi koperasi."),
            "ready": ("Pesanan siap diambil", f"Pesanan {order.code} sudah siap. Silakan ambil saat jam operasional."),
            "complete-pickup": ("Pengambilan selesai", f"Pesanan {order.code} telah diserahkan."),
            "cancel": ("Pesanan dibatalkan", f"Pesanan {order.code} dibatalkan dan stok dikembalikan."),
        }
        title, message = messages[action]
        notify_user(order.customer, title, message, kind="order", target_code=order.code)
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
        if action == "verify" and order.payment_method != Order.PaymentMethod.CASH and order.payment_status == Order.PaymentStatus.PENDING:
            order.payment_status = Order.PaymentStatus.PAID
        elif action == "reject" and order.payment_method != Order.PaymentMethod.CASH and order.payment_status == Order.PaymentStatus.PENDING:
            order.payment_status = Order.PaymentStatus.FAILED
        else:
            raise ValidationError({"payment_status": "Verifikasi pembayaran tidak valid."})
        order.save(update_fields=["payment_status", "updated_at"])
        PaymentEvent.objects.create(order=order, actor=request.user, event=action, note=str(request.data.get("note", ""))[:500])
        AuditLog.objects.create(actor=request.user, event=f"payment.{action}", target_type="order", target_id=str(order.pk), metadata={"code": order.code})
        title = "Pembayaran berhasil diverifikasi" if action == "verify" else "Pembayaran perlu diperiksa kembali"
        message = f"Status pembayaran pesanan {order.code}: {'lunas' if action == 'verify' else 'ditolak'}. Periksa detail pesanan."
        notify_user(order.customer, title, message, kind="payment", target_code=order.code)
        return Response(OrderReadSerializer(order).data)


class PaymentSubmissionView(APIView):
    def post(self, request, code):
        order = Order.objects.filter(code=code, customer=request.user).first()
        if not order:
            return Response({"detail": "Pesanan tidak ditemukan."}, status=404)
        if order.status == Order.Status.CANCELLED:
            raise ValidationError({"payment": "Pesanan yang dibatalkan tidak dapat menerima konfirmasi pembayaran."})
        if order.payment_method == Order.PaymentMethod.CASH:
            raise ValidationError({"payment": "Pembayaran tunai dikonfirmasi admin saat penyerahan."})
        if order.payment_status not in (Order.PaymentStatus.UNPAID, Order.PaymentStatus.FAILED):
            raise ValidationError({"payment": "Status pembayaran tidak dapat diubah."})
        note = str(request.data.get("note", "")).strip()[:500]
        if not note:
            raise ValidationError({"note": "Isi referensi atau keterangan pembayaran untuk diperiksa admin."})
        order.payment_status = Order.PaymentStatus.PENDING
        order.save(update_fields=["payment_status", "updated_at"])
        PaymentEvent.objects.create(order=order, actor=request.user, event="submitted", note=note)
        AuditLog.objects.create(actor=request.user, event="payment.submitted", target_type="order", target_id=str(order.pk), metadata={"code": order.code})
        notify_admins("Konfirmasi pembayaran masuk", f"{request.user.full_name} mengirim konfirmasi pembayaran untuk {order.code}.", kind="payment", target_code=order.code)
        return Response(OrderReadSerializer(order).data)


class AdminInventoryMovementListView(generics.ListAPIView):
    permission_classes = [CommerceAdminOnly]
    queryset = InventoryMovement.objects.select_related("product", "actor").all()
    serializer_class = InventoryMovementSerializer


class AdminSalesReportView(APIView):
    permission_classes = [CommerceAdminOnly]

    def get(self, request):
        today = timezone.localdate()
        month_start = today.replace(day=1)
        paid_orders = Order.objects.filter(
            status=Order.Status.COMPLETED,
            payment_status=Order.PaymentStatus.PAID,
            completed_at__isnull=False,
        )
        today_orders = paid_orders.filter(completed_at__date=today)
        month_orders = paid_orders.filter(completed_at__date__gte=month_start, completed_at__date__lte=today)
        today_summary = today_orders.aggregate(total=Sum("total"), count=Count("id"))
        month_summary = month_orders.aggregate(total=Sum("total"), count=Count("id"))
        daily_rows = month_orders.filter(
            completed_at__date__gte=today - timedelta(days=6)
        ).values("completed_at__date").annotate(total=Sum("total"), count=Count("id")).order_by("completed_at__date")
        daily_by_date = {row["completed_at__date"].isoformat(): row for row in daily_rows}
        daily = []
        for offset in range(6, -1, -1):
            day = today - timedelta(days=offset)
            row = daily_by_date.get(day.isoformat(), {})
            daily.append({
                "date": day.isoformat(),
                "total": row.get("total") or 0,
                "orders": row.get("count") or 0,
            })
        top_products = list(
            OrderItem.objects.filter(
                order__status=Order.Status.COMPLETED,
                order__payment_status=Order.PaymentStatus.PAID,
                order__completed_at__date__gte=month_start,
                order__completed_at__date__lte=today,
            ).values("product_name").annotate(
                quantity=Sum("quantity"), revenue=Sum("line_total")
            ).order_by("-revenue")[:5]
        )
        month_total = month_summary["total"] or 0
        month_count = month_summary["count"] or 0
        return Response({
            "period": {"from": month_start.isoformat(), "to": today.isoformat()},
            "today": {"revenue": today_summary["total"] or 0, "orders": today_summary["count"] or 0},
            "month": {
                "revenue": month_total,
                "orders": month_count,
                "average_order": round(month_total / month_count) if month_count else 0,
            },
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
            revenue=Sum("total"), orders=Count("id")
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
            "today_revenue": completed_paid.filter(completed_at__date=today).aggregate(total=Sum("total"))["total"] or 0,
            "daily": daily,
            "recent_orders": [{
                "code": order.code,
                "customer_name": "Penjualan POS" if order.sales_channel == "pos" else order.customer.full_name,
                "beneficiary_name": order.beneficiary.full_name if order.beneficiary_id else None,
                "total": order.total,
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
        if method not in Order.PaymentMethod.values:
            raise ValidationError({"payment_method": "Metode pembayaran POS tidak valid."})
        if not isinstance(rows, list) or not rows:
            raise ValidationError({"items": "Tambahkan minimal satu produk ke transaksi."})
        setting = StoreSetting.objects.filter(key="payment_methods").first()
        enabled = setting.value if setting and isinstance(setting.value, dict) else {"cash": True, "bank_transfer": True, "qris": True}
        if not enabled.get(method, False):
            raise ValidationError({"payment_method": "Metode pembayaran ini sedang dinonaktifkan."})
        now = timezone.now()
        if not pickup_is_open(now):
            raise ValidationError({"operating_hours": "Transaksi POS hanya dapat dilakukan saat koperasi buka. Atur jam operasional terlebih dahulu."})
        cleaned = []
        seen = set()
        for row in rows:
            try:
                product_id, quantity = int(row.get("product_id")), int(row.get("quantity"))
            except (AttributeError, TypeError, ValueError):
                raise ValidationError({"items": "Produk dan jumlah harus valid."})
            if product_id in seen or quantity < 1:
                raise ValidationError({"items": "Produk tidak boleh duplikat dan jumlah minimal 1."})
            seen.add(product_id)
            cleaned.append({"product_id": product_id, "quantity": quantity})
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
            Product.objects.filter(pk=product.pk, stock__gte=row["quantity"]).update(stock=F("stock") - row["quantity"])
            InventoryMovement.objects.create(product=product, actor=request.user, quantity_delta=-row["quantity"], reason="pos_sale", reference=order.code)
            OrderItem.objects.create(order=order, product=product, product_name=product.name, unit_price=product.price, quantity=row["quantity"], line_total=product.price * row["quantity"])
        PaymentEvent.objects.create(order=order, actor=request.user, event="pos_sale", note=(f"Uang diterima Rp{cash_received}; kembalian Rp{cash_received - total}." if cash_received is not None else "Pembayaran non-tunai diterima dan dikonfirmasi admin pada POS."))
        AuditLog.objects.create(actor=request.user, event="pos.checkout", target_type="order", target_id=str(order.pk), metadata={"code": order.code, "total": total, "payment_method": method})
        return Response(OrderReadSerializer(order).data, status=status.HTTP_201_CREATED)
