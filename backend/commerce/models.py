import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone


class Category(models.Model):
    name = models.CharField(max_length=80)
    slug = models.SlugField(max_length=80, unique=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("sort_order", "name")

    def __str__(self):
        return self.name


class Product(models.Model):
    name = models.CharField(max_length=180)
    sku = models.CharField(max_length=64, unique=True, null=True, blank=True)
    barcode = models.CharField(max_length=64, unique=True, null=True, blank=True)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="products")
    description = models.TextField(blank=True)
    unit = models.CharField(max_length=24, default="pcs")
    price = models.PositiveBigIntegerField()
    cost_price = models.PositiveBigIntegerField(default=0)
    stock = models.PositiveIntegerField(default=0)
    min_stock = models.PositiveIntegerField(default=0)
    image_url = models.URLField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name",)
        indexes = [models.Index(fields=("is_active", "category"), name="commerce_pr_active_cat_idx"), models.Index(fields=("name",), name="commerce_pr_name_idx")]
        constraints = [models.CheckConstraint(condition=models.Q(price__gte=0), name="product_price_nonnegative")]

    def __str__(self):
        return self.name


class StockMovement(models.Model):
    class Kind(models.TextChoices):
        INITIAL = "initial", "Stok awal"
        RESTOCK = "restock", "Barang masuk"
        ADJUSTMENT = "adjustment", "Penyesuaian"
        RESERVED = "reserved", "Reservasi pesanan"
        RELEASED = "released", "Reservasi dilepas"
        SOLD = "sold", "Penjualan"

    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="stock_movements")
    kind = models.CharField(max_length=16, choices=Kind.choices)
    quantity_delta = models.IntegerField()
    stock_after = models.PositiveIntegerField()
    reference = models.CharField(max_length=80, blank=True)
    note = models.CharField(max_length=240, blank=True)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=("product", "created_at"), name="commerce_sm_product_date_idx")]


class Order(models.Model):
    class Status(models.TextChoices):
        AWAITING_PAYMENT = "awaiting_payment", "Menunggu pembayaran"
        PENDING_REVIEW = "pending_review", "Menunggu konfirmasi"
        ACCEPTED = "accepted", "Diterima"
        PROCESSING = "processing", "Diproses"
        READY = "ready", "Siap diambil"
        OUT_FOR_DELIVERY = "out_for_delivery", "Dalam pengiriman"
        COMPLETED = "completed", "Selesai"
        REJECTED = "rejected", "Ditolak"
        CANCELLED = "cancelled", "Dibatalkan"
        EXPIRED = "expired", "Kedaluwarsa"

    class Fulfillment(models.TextChoices):
        PICKUP = "pickup", "Ambil di toko"
        DELIVERY = "delivery", "Pengiriman"

    code = models.CharField(max_length=32, unique=True, editable=False)
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="commerce_orders")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="created_commerce_orders")
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.PENDING_REVIEW)
    fulfillment = models.CharField(max_length=12, choices=Fulfillment.choices)
    delivery_address = models.TextField(blank=True)
    customer_note = models.CharField(max_length=500, blank=True)
    admin_note = models.CharField(max_length=500, blank=True)
    subtotal = models.PositiveBigIntegerField(default=0)
    delivery_fee = models.PositiveBigIntegerField(default=0)
    total = models.PositiveBigIntegerField(default=0)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=("status", "created_at"), name="commerce_or_status_date_idx"), models.Index(fields=("customer", "created_at"), name="commerce_or_customer_date_idx")]

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = f"MTM-{timezone.now():%y%m%d}-{uuid.uuid4().hex[:6].upper()}"
        super().save(*args, **kwargs)


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, null=True, blank=True, on_delete=models.SET_NULL, related_name="order_items")
    product_name = models.CharField(max_length=180)
    sku = models.CharField(max_length=64, blank=True)
    unit = models.CharField(max_length=24, default="pcs")
    unit_price = models.PositiveBigIntegerField()
    quantity = models.PositiveIntegerField()
    line_total = models.PositiveBigIntegerField()



class CashierShift(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "Terbuka"
        CLOSED = "closed", "Ditutup"

    cashier = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="cashier_shifts")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.OPEN)
    opening_cash = models.PositiveBigIntegerField(default=0)
    expected_cash = models.PositiveBigIntegerField(default=0)
    closing_cash = models.PositiveBigIntegerField(null=True, blank=True)
    opening_note = models.CharField(max_length=240, blank=True)
    closing_note = models.CharField(max_length=240, blank=True)
    opened_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-opened_at",)
        indexes = [models.Index(fields=("cashier", "status"), name="commerce_shift_user_status_idx")]


class CashMovement(models.Model):
    class Kind(models.TextChoices):
        CASH_IN = "cash_in", "Kas masuk"
        CASH_OUT = "cash_out", "Kas keluar"

    shift = models.ForeignKey(CashierShift, on_delete=models.PROTECT, related_name="cash_movements")
    kind = models.CharField(max_length=12, choices=Kind.choices)
    amount = models.PositiveBigIntegerField()
    note = models.CharField(max_length=240)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at",)


class Payment(models.Model):
    class Method(models.TextChoices):
        CASH = "cash", "Tunai"
        QRIS = "qris", "QRIS toko"

    class Status(models.TextChoices):
        UNPAID = "unpaid", "Belum dibayar"
        PENDING_VERIFICATION = "pending_verification", "Menunggu verifikasi"
        PAID = "paid", "Lunas"
        FAILED = "failed", "Gagal"
        EXPIRED = "expired", "Kedaluwarsa"
        REFUND_PENDING = "refund_pending", "Menunggu pengembalian dana"
        REFUNDED = "refunded", "Dikembalikan"

    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name="payment")
    shift = models.ForeignKey(CashierShift, null=True, blank=True, on_delete=models.SET_NULL, related_name="payments")
    method = models.CharField(max_length=12, choices=Method.choices)
    status = models.CharField(max_length=24, choices=Status.choices)
    amount = models.PositiveBigIntegerField()
    cash_received = models.PositiveBigIntegerField(null=True, blank=True)
    change_due = models.PositiveBigIntegerField(default=0)
    reference = models.CharField(max_length=80, unique=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    verification_note = models.CharField(max_length=240, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class OrderStatusHistory(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="status_history")
    from_status = models.CharField(max_length=24, blank=True)
    to_status = models.CharField(max_length=24)
    note = models.CharField(max_length=500, blank=True)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at",)

class Notification(models.Model):
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="commerce_notifications")
    kind = models.CharField(max_length=40)
    title = models.CharField(max_length=140)
    body = models.CharField(max_length=500)
    target_url = models.CharField(max_length=300, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=("recipient", "read_at", "created_at"), name="commerce_notice_user_read_idx")]
