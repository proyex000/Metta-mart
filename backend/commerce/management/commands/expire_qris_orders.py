from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from commerce.models import Order, OrderStatusHistory, Payment, Product, StockMovement
from core.models import AuditLog


class Command(BaseCommand):
    help = "Expire unpaid static-QRIS orders and release their reserved stock. Run periodically from a scheduler."

    def handle(self, *args, **options):
        now = timezone.now()
        expired_count = 0
        candidates = Order.objects.filter(status=Order.Status.AWAITING_PAYMENT, expires_at__lte=now).values_list("pk", flat=True)
        for order_id in candidates:
            with transaction.atomic():
                try:
                    order = Order.objects.select_for_update().select_related("payment").get(pk=order_id, status=Order.Status.AWAITING_PAYMENT, expires_at__lte=now)
                except Order.DoesNotExist:
                    continue
                for item in order.items.select_related("product"):
                    if item.product_id:
                        Product.objects.filter(pk=item.product_id).update(stock=F("stock") + item.quantity)
                        product = Product.objects.get(pk=item.product_id)
                        StockMovement.objects.create(product=product, kind=StockMovement.Kind.RELEASED, quantity_delta=item.quantity, stock_after=product.stock, reference=order.code, note="QRIS kedaluwarsa; stok dikembalikan")
                order.payment.status = Payment.Status.EXPIRED
                order.payment.save(update_fields=("status", "updated_at"))
                previous = order.status
                order.status = Order.Status.EXPIRED
                order.save(update_fields=("status", "updated_at"))
                OrderStatusHistory.objects.create(order=order, from_status=previous, to_status=order.status, note="Batas pembayaran QRIS berakhir")
                AuditLog.objects.create(event="order.expired", target_type="order", target_id=order.code)
                expired_count += 1
        self.stdout.write(self.style.SUCCESS(f"Expired {expired_count} QRIS order(s)."))
