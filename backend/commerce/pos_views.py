from django.db import transaction
from django.db.models import F, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from accounts.models import User
from core.models import AuditLog
from .models import CashMovement, CashierShift, Order, OrderItem, OrderStatusHistory, Payment, Product, StockMovement
from .permissions import IsAdminOrCashier
from .serializers import CheckoutSerializer, OrderSerializer


def shift_totals(shift):
    cash_sales = Payment.objects.filter(shift=shift, method=Payment.Method.CASH, status=Payment.Status.PAID).aggregate(total=Sum("amount"))["total"] or 0
    cash_in = CashMovement.objects.filter(shift=shift, kind=CashMovement.Kind.CASH_IN).aggregate(total=Sum("amount"))["total"] or 0
    cash_out = CashMovement.objects.filter(shift=shift, kind=CashMovement.Kind.CASH_OUT).aggregate(total=Sum("amount"))["total"] or 0
    return {"cash_sales": cash_sales, "cash_in": cash_in, "cash_out": cash_out, "expected_cash": shift.opening_cash + cash_sales + cash_in - cash_out}


def shift_payload(shift):
    totals = shift_totals(shift)
    return {
        "id": shift.pk, "status": shift.status, "opening_cash": shift.opening_cash,
        "expected_cash": totals["expected_cash"], "cash_sales": totals["cash_sales"],
        "cash_in": totals["cash_in"], "cash_out": totals["cash_out"],
        "opened_at": shift.opened_at, "closed_at": shift.closed_at,
        "closing_cash": shift.closing_cash, "opening_note": shift.opening_note,
        "closing_note": shift.closing_note,
        "cash_movements": list(shift.cash_movements.values("id", "kind", "amount", "note", "created_at")),
    }


def current_shift(user, lock=False):
    queryset = CashierShift.objects.filter(cashier=user, status=CashierShift.Status.OPEN)
    if lock:
        queryset = queryset.select_for_update()
    return queryset.order_by("-opened_at").first()


class CurrentShiftView(APIView):
    permission_classes = [IsAdminOrCashier]

    def get(self, request):
        shift = current_shift(request.user)
        return Response({"shift": shift_payload(shift) if shift else None})


class OpenShiftView(APIView):
    permission_classes = [IsAdminOrCashier]

    def post(self, request):
        try:
            opening_cash = int(request.data.get("opening_cash", 0))
        except (TypeError, ValueError):
            raise ValidationError({"opening_cash": "Saldo awal harus berupa bilangan bulat Rupiah."})
        if opening_cash < 0 or opening_cash > 1000000000:
            raise ValidationError({"opening_cash": "Saldo awal di luar batas yang diizinkan."})
        note = str(request.data.get("note", "")).strip()[:240]
        with transaction.atomic():
            User.objects.select_for_update().get(pk=request.user.pk)
            if current_shift(request.user, lock=True):
                raise ValidationError("Shift kasir masih terbuka. Tutup shift sebelumnya terlebih dahulu.")
            shift = CashierShift.objects.create(cashier=request.user, opening_cash=opening_cash, opening_note=note)
            AuditLog.objects.create(actor=request.user, event="pos.shift.opened", target_type="cashier_shift", target_id=str(shift.pk), metadata={"opening_cash": opening_cash})
        return Response(shift_payload(shift), status=status.HTTP_201_CREATED)


class CloseShiftView(APIView):
    permission_classes = [IsAdminOrCashier]

    def post(self, request):
        try:
            closing_cash = int(request.data.get("closing_cash"))
        except (TypeError, ValueError):
            raise ValidationError({"closing_cash": "Uang fisik di laci wajib berupa bilangan bulat Rupiah."})
        if closing_cash < 0 or closing_cash > 1000000000:
            raise ValidationError({"closing_cash": "Jumlah uang fisik di luar batas yang diizinkan."})
        note = str(request.data.get("note", "")).strip()[:240]
        with transaction.atomic():
            shift = current_shift(request.user, lock=True)
            if not shift:
                raise ValidationError("Tidak ada shift terbuka untuk ditutup.")
            totals = shift_totals(shift)
            shift.status = CashierShift.Status.CLOSED
            shift.expected_cash = totals["expected_cash"]
            shift.closing_cash = closing_cash
            shift.closing_note = note
            shift.closed_at = timezone.now()
            shift.save(update_fields=("status", "expected_cash", "closing_cash", "closing_note", "closed_at"))
            AuditLog.objects.create(actor=request.user, event="pos.shift.closed", target_type="cashier_shift", target_id=str(shift.pk), metadata={"expected_cash": totals["expected_cash"], "closing_cash": closing_cash, "variance": closing_cash - totals["expected_cash"]})
        return Response({**shift_payload(shift), "variance": closing_cash - totals["expected_cash"]})


class CashMovementView(APIView):
    permission_classes = [IsAdminOrCashier]

    def post(self, request):
        kind = request.data.get("kind")
        if kind not in {CashMovement.Kind.CASH_IN, CashMovement.Kind.CASH_OUT}:
            raise ValidationError({"kind": "Jenis pergerakan kas tidak valid."})
        try:
            amount = int(request.data.get("amount"))
        except (TypeError, ValueError):
            raise ValidationError({"amount": "Jumlah kas harus berupa bilangan bulat Rupiah."})
        note = str(request.data.get("note", "")).strip()[:240]
        if amount <= 0 or amount > 1000000000 or not note:
            raise ValidationError("Jumlah harus positif dan catatan wajib diisi.")
        with transaction.atomic():
            shift = current_shift(request.user, lock=True)
            if not shift:
                raise ValidationError("Buka shift sebelum mencatat kas masuk/keluar.")
            if kind == CashMovement.Kind.CASH_OUT and amount > shift_totals(shift)["expected_cash"]:
                raise ValidationError({"amount": "Kas keluar melebihi saldo kas yang seharusnya tersedia."})
            movement = CashMovement.objects.create(shift=shift, kind=kind, amount=amount, note=note, actor=request.user)
            AuditLog.objects.create(actor=request.user, event="pos.cash_movement", target_type="cashier_shift", target_id=str(shift.pk), metadata={"kind": kind, "amount": amount, "note": note})
        return Response({"id": movement.pk, "kind": movement.kind, "amount": movement.amount, "note": movement.note, "created_at": movement.created_at}, status=status.HTTP_201_CREATED)


class POSCheckoutView(APIView):
    permission_classes = [IsAdminOrCashier]

    def post(self, request):
        serializer = CheckoutSerializer(data={**request.data, "fulfillment": "pickup", "payment_method": "cash"})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        item_ids = [item["product_id"] for item in data["items"]]
        quantities = {item["product_id"]: item["quantity"] for item in data["items"]}
        with transaction.atomic():
            shift = current_shift(request.user, lock=True)
            if not shift:
                raise ValidationError("Buka shift kasir sebelum membuat transaksi POS.")
            products = {p.pk: p for p in Product.objects.select_for_update().select_related("category").filter(pk__in=item_ids, is_active=True, category__is_active=True)}
            if len(products) != len(item_ids):
                raise ValidationError({"items": "Satu atau lebih produk tidak tersedia."})
            subtotal = 0
            lines = []
            for product_id in item_ids:
                product = products[product_id]
                quantity = quantities[product_id]
                if product.stock < quantity:
                    raise ValidationError({"items": "Stok " + product.name + " tidak mencukupi. Tersedia: " + str(product.stock) + "."})
                line_total = product.price * quantity
                subtotal += line_total
                lines.append((product, quantity, line_total))
            try:
                cash_received = int(request.data.get("cash_received"))
            except (TypeError, ValueError):
                raise ValidationError({"cash_received": "Jumlah uang yang diterima wajib diisi."})
            if cash_received < subtotal:
                raise ValidationError({"cash_received": "Uang yang diterima kurang dari total transaksi."})
            if cash_received > 1000000000:
                raise ValidationError({"cash_received": "Jumlah uang yang diterima di luar batas."})
            change_due = cash_received - subtotal
            order = Order.objects.create(customer=None, created_by=request.user, status=Order.Status.COMPLETED, fulfillment=Order.Fulfillment.PICKUP, customer_note=str(data.get("customer_note", "")).strip(), subtotal=subtotal, total=subtotal)
            for product, quantity, line_total in lines:
                changed = Product.objects.filter(pk=product.pk, stock__gte=quantity).update(stock=F("stock") - quantity)
                if not changed:
                    raise ValidationError({"items": "Stok berubah selama transaksi. Periksa ulang keranjang."})
                product.refresh_from_db()
                OrderItem.objects.create(order=order, product=product, product_name=product.name, sku=product.sku or "", unit=product.unit, unit_price=product.price, quantity=quantity, line_total=line_total)
                StockMovement.objects.create(product=product, kind=StockMovement.Kind.SOLD, quantity_delta=-quantity, stock_after=product.stock, reference=order.code, note="Penjualan langsung melalui POS", actor=request.user)
            Payment.objects.create(order=order, shift=shift, method=Payment.Method.CASH, status=Payment.Status.PAID, amount=order.total, cash_received=cash_received, change_due=change_due, reference=order.code, paid_at=timezone.now(), verified_by=request.user)
            OrderStatusHistory.objects.create(order=order, from_status="", to_status=order.status, actor=request.user, note="Transaksi POS selesai dan dibayar tunai")
            AuditLog.objects.create(actor=request.user, event="pos.sale.completed", target_type="order", target_id=order.code, metadata={"total": order.total, "shift_id": shift.pk})
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)
