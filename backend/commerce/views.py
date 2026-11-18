from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from core.models import AuditLog
from .models import Order, PaymentEvent, Product
from .permissions import IsAdminRole as CommerceAdminOnly
from .serializers import OrderCreateSerializer, OrderReadSerializer, ProductSerializer


class ProductListCreateView(generics.ListCreateAPIView):
    serializer_class = ProductSerializer

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
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = serializer.save()
        AuditLog.objects.create(actor=request.user, event="order.created", target_type="order", target_id=str(order.pk), metadata={"code": order.code, "total": order.total})
        return Response(OrderReadSerializer(order).data, status=status.HTTP_201_CREATED)


class OrderDetailView(generics.RetrieveAPIView):
    serializer_class = OrderReadSerializer

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
            order.status, order.cancelled_at = Order.Status.CANCELLED, now
        else:
            raise ValidationError({"status": "Perubahan status pesanan tidak valid."})
        order.save()
        AuditLog.objects.create(actor=request.user, event=f"order.{action}", target_type="order", target_id=str(order.pk), metadata={"code": order.code})
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
        return Response(OrderReadSerializer(order).data)
