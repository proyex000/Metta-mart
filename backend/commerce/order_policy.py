from datetime import timedelta

from django.db import transaction
from django.db.models import Count
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from core.models import AuditLog, StoreSetting
from .models import Order


DEFAULT_ORDER_POLICY = {
    "max_active_orders_per_account": 5,
    "auto_cancel_unpaid_after_hours": 0,
}
HARD_ORDER_RATE_LIMIT = 20
ACTIVE_STATUSES = (
    Order.Status.PENDING,
    Order.Status.ACCEPTED,
    Order.Status.READY,
)
EXPIRABLE_PAYMENT_STATUSES = (
    Order.PaymentStatus.UNPAID,
    Order.PaymentStatus.FAILED,
)


def get_order_policy():
    setting = StoreSetting.objects.filter(key="order_policy").first()
    saved = setting.value if setting and isinstance(setting.value, dict) else {}
    return {**DEFAULT_ORDER_POLICY, **saved}


def enforce_order_limits(customer, now=None):
    now = now or timezone.now()
    policy = get_order_policy()
    hourly_count = Order.objects.filter(
        customer=customer,
        sales_channel="online",
        created_at__gte=now - timedelta(hours=1),
    ).count()
    if hourly_count >= HARD_ORDER_RATE_LIMIT:
        raise ValidationError({
            "orders": "Batas keamanan tercapai: maksimal 20 pesanan dalam satu jam. Coba lagi nanti."
        })

    maximum = policy["max_active_orders_per_account"]
    if maximum > 0:
        active_count = Order.objects.filter(
            customer=customer,
            sales_channel="online",
            status__in=ACTIVE_STATUSES,
        ).count()
        if active_count >= maximum:
            raise ValidationError({
                "orders": (
                    f"Akun Anda sudah memiliki {active_count} pesanan aktif. "
                    "Selesaikan atau batalkan pesanan sebelumnya terlebih dahulu."
                )
            })


def cancel_stale_orders(*, now=None, customer=None, batch_size=500):
    """Cancel eligible stale orders and restore inventory exactly once."""
    now = now or timezone.now()
    hours = get_order_policy()["auto_cancel_unpaid_after_hours"]
    if hours <= 0:
        return 0

    cutoff = now - timedelta(hours=hours)
    candidates = Order.objects.filter(
        status__in=ACTIVE_STATUSES,
        payment_status__in=EXPIRABLE_PAYMENT_STATUSES,
        created_at__lte=cutoff,
    )
    if customer is not None:
        candidates = candidates.filter(customer=customer)

    order_ids = list(candidates.order_by("created_at").values_list("pk", flat=True)[:batch_size])
    cancelled = 0

    # Lock and process each order independently so one bad record cannot hold
    # a large batch transaction open.
    for order_id in order_ids:
        with transaction.atomic():
            order = (
                Order.objects.select_for_update()
                .select_related("customer")
                .filter(pk=order_id)
                .first()
            )
            if (
                order is None
                or order.status not in ACTIVE_STATUSES
                or order.payment_status not in EXPIRABLE_PAYMENT_STATUSES
                or order.created_at > cutoff
            ):
                continue

            # Imported here to avoid a module cycle: views use this policy module.
            from .views import cancel_order, notify_user

            cancel_order(order, actor=None, now=now)
            order.save(update_fields=["status", "cancelled_at", "updated_at"])
            AuditLog.objects.create(
                actor=None,
                event="order.auto_cancel_stale",
                target_type="order",
                target_id=str(order.pk),
                metadata={"code": order.code, "policy_hours": hours},
            )
            notify_user(
                order.customer,
                "Pesanan dibatalkan otomatis",
                f"Pesanan {order.code} melewati batas waktu kebijakan koperasi. Stok telah dikembalikan.",
                kind="order",
                target_code=order.code,
            )
            cancelled += 1

    return cancelled
