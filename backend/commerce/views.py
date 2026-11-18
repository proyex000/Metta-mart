from datetime import timedelta
from django.db import transaction
from django.db.models import F
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from accounts.models import User
from accounts.permissions import IsAdminRole
from core.models import AuditLog
from .models import Category, Order, OrderItem, OrderStatusHistory, Payment, Product, StockMovement
from .permissions import IsAdminOrReadOnly
from .serializers import CategorySerializer, CheckoutSerializer, OrderSerializer, ProductSerializer, StockMovementSerializer


def record_order_status(order, new_status, actor, note=""):
    old_status = order.status
    if old_status == new_status:
        return
    order.status = new_status
    order.save(update_fields=("status", "updated_at"))
    OrderStatusHistory.objects.create(order=order, from_status=old_status, to_status=new_status, actor=actor, note=note)


def release_order_stock(order, actor, note):
    for item in order.items.select_related("product").all():
        if item.product_id:
            Product.objects.filter(pk=item.product_id).update(stock=F("stock") + item.quantity)
            product = Product.objects.get(pk=item.product_id)
            StockMovement.objects.create(product=product, kind=StockMovement.Kind.RELEASED, quantity_delta=item.quantity, stock_after=product.stock, reference=order.code, note=note, actor=actor)


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


class ProductListCreateView(generics.ListCreateAPIView):
    serializer_class = ProductSerializer
    permission_classes = [IsAdminOrReadOnly]

    def get_queryset(self):
        queryset = Product.objects.select_related("category")
        if self.request.user.role != User.Role.ADMIN:
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
        try:
            delta = int(request.data.get("quantity_delta"))
        except (TypeError, ValueError):
            raise ValidationError({"quantity_delta": "Jumlah perubahan stok harus berupa bilangan bulat."})
        if delta == 0 or abs(delta) > 100000:
            raise ValidationError({"quantity_delta": "Perubahan stok harus antara -100000 sampai 100000 dan bukan nol."})
        note = str(request.data.get("note", "")).strip()[:240]
        with transaction.atomic():
            product = get_object_or_404(Product.objects.select_for_update(), pk=pk)
            updated = Product.objects.filter(pk=pk, stock__gte=max(0, -delta)).update(stock=F("stock") + delta)
            if not updated:
                raise ValidationError({"quantity_delta": "Stok tidak boleh menjadi negatif."})
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
        if request.user.role not in {User.Role.STUDENT, User.Role.PARENT}:
            raise PermissionDenied("Checkout online hanya tersedia untuk akun siswa dan orang tua.")
        serializer = CheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
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
            payment_method = data["payment_method"]
            payment_status = Payment.Status.PENDING_VERIFICATION if payment_method == Payment.Method.QRIS else Payment.Status.UNPAID
            order_status = Order.Status.AWAITING_PAYMENT if payment_method == Payment.Method.QRIS else Order.Status.PENDING_REVIEW
            order = Order.objects.create(customer=request.user, status=order_status, fulfillment=data["fulfillment"], delivery_address=data.get("delivery_address", "").strip(), customer_note=data.get("customer_note", "").strip(), subtotal=subtotal, total=subtotal, expires_at=timezone.now() + timedelta(minutes=20) if payment_method == Payment.Method.QRIS else None)
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
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)


class OrderListView(generics.ListAPIView):
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = Order.objects.select_related("customer", "payment").prefetch_related("items", "status_history")
        if self.request.user.role not in {User.Role.ADMIN, User.Role.CASHIER}:
            queryset = queryset.filter(customer=self.request.user)
        state = self.request.query_params.get("status")
        return queryset.filter(status=state) if state else queryset


class OrderDetailView(generics.RetrieveAPIView):
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = "code"

    def get_queryset(self):
        queryset = Order.objects.select_related("customer", "payment").prefetch_related("items", "status_history")
        return queryset if self.request.user.role in {User.Role.ADMIN, User.Role.CASHIER} else queryset.filter(customer=self.request.user)


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
                record_order_status(order, Order.Status.CANCELLED, request.user, note or "Dibatalkan")
            elif action == "verify_payment":
                if role != User.Role.ADMIN:
                    raise PermissionDenied("Hanya admin yang dapat memverifikasi pembayaran QRIS.")
                if order.status != Order.Status.AWAITING_PAYMENT or order.payment.method != Payment.Method.QRIS or order.payment.status != Payment.Status.PENDING_VERIFICATION:
                    raise ValidationError("Pesanan ini tidak sedang menunggu verifikasi QRIS.")
                order.payment.status = Payment.Status.PAID
                order.payment.paid_at = timezone.now()
                order.payment.verified_by = request.user
                order.payment.verification_note = note
                order.payment.save(update_fields=("status", "paid_at", "verified_by", "verification_note", "updated_at"))
                record_order_status(order, Order.Status.PENDING_REVIEW, request.user, "Pembayaran QRIS diverifikasi admin")
            elif action == "accept":
                if role != User.Role.ADMIN:
                    raise PermissionDenied("Hanya admin yang dapat menerima pesanan.")
                if order.status != Order.Status.PENDING_REVIEW:
                    raise ValidationError("Pesanan belum siap diterima atau sudah diproses.")
                if order.payment.method == Payment.Method.QRIS and order.payment.status != Payment.Status.PAID:
                    raise ValidationError("Verifikasi pembayaran QRIS sebelum menerima pesanan.")
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
                    order.payment.verification_note = "Pesanan ditolak; pengembalian dana QRIS perlu diproses manual."
                    order.payment.save(update_fields=("status", "verification_note", "updated_at"))
                record_order_status(order, Order.Status.REJECTED, request.user, note or "Ditolak oleh admin")
            else:
                if role not in {User.Role.ADMIN, User.Role.CASHIER}:
                    raise PermissionDenied("Aksi ini hanya tersedia untuk admin dan kasir.")
                transitions = {"start_processing": (Order.Status.ACCEPTED, Order.Status.PROCESSING), "mark_ready": (Order.Status.PROCESSING, Order.Status.READY), "dispatch": (Order.Status.READY, Order.Status.OUT_FOR_DELIVERY), "complete": ((Order.Status.READY, Order.Status.OUT_FOR_DELIVERY), Order.Status.COMPLETED)}
                if action not in transitions:
                    raise ValidationError({"action": "Aksi pesanan tidak dikenal."})
                expected, target = transitions[action]
                allowed = order.status in expected if isinstance(expected, tuple) else order.status == expected
                if not allowed:
                    raise ValidationError("Perubahan status tidak sesuai alur pesanan.")
                if action == "dispatch" and order.fulfillment != Order.Fulfillment.DELIVERY:
                    raise ValidationError("Pesanan ambil di toko tidak dapat dikirim.")
                if action == "complete" and order.payment.method == Payment.Method.QRIS and order.payment.status != Payment.Status.PAID:
                    raise ValidationError("Pembayaran QRIS harus lunas sebelum pesanan diselesaikan.")
                if action == "complete" and order.payment.method == Payment.Method.CASH:
                    order.payment.status = Payment.Status.PAID
                    order.payment.paid_at = timezone.now()
                    order.payment.verified_by = request.user
                    order.payment.save(update_fields=("status", "paid_at", "verified_by", "updated_at"))
                record_order_status(order, target, request.user, note)
            AuditLog.objects.create(actor=request.user, event=f"order.{action}", target_type="order", target_id=order.code, metadata={"status": order.status, "note": note})
            order.refresh_from_db()
        return Response(OrderSerializer(order).data)
