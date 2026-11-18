import secrets
from django.conf import settings
from django.db import models
from django.utils import timezone


class Product(models.Model):
    CATEGORIES = [
        ("alat-tulis", "Alat Tulis"),
        ("buku", "Buku"),
        ("minuman", "Minuman"),
        ("seragam-sekolah", "Seragam Sekolah"),
        ("lainnya", "Lainnya"),
    ]
    name = models.CharField(max_length=180)
    sku = models.CharField(max_length=64, unique=True, null=True, blank=True)
    category = models.CharField(max_length=32, choices=CATEGORIES, default="lainnya")
    price = models.PositiveIntegerField()
    stock = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name",)
        indexes = [models.Index(fields=("is_active", "category"))]

    def __str__(self):
        return self.name


class Order(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Menunggu konfirmasi"
        ACCEPTED = "accepted", "Diproses"
        READY = "ready_for_pickup", "Siap diambil"
        COMPLETED = "completed", "Selesai"
        CANCELLED = "cancelled", "Dibatalkan"

    class PaymentMethod(models.TextChoices):
        CASH = "cash", "Tunai"
        BANK_TRANSFER = "bank_transfer", "Transfer bank"
        QRIS = "qris", "QRIS"

    class PaymentStatus(models.TextChoices):
        UNPAID = "unpaid", "Belum dibayar"
        PENDING = "pending_verification", "Menunggu verifikasi"
        PAID = "paid", "Lunas"
        FAILED = "failed", "Ditolak"
        REFUNDED = "refunded", "Dikembalikan"

    code = models.CharField(max_length=24, unique=True, editable=False)
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="orders")
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.PENDING)
    payment_method = models.CharField(max_length=20, choices=PaymentMethod.choices)
    payment_status = models.CharField(max_length=24, choices=PaymentStatus.choices, default=PaymentStatus.UNPAID)
    note = models.CharField(max_length=500, blank=True)
    subtotal = models.PositiveIntegerField(default=0)
    total = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    ready_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=("customer", "created_at")), models.Index(fields=("status", "created_at"))]

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = f"MTM-{timezone.now():%y%m%d}-{secrets.token_hex(3).upper()}"
        super().save(*args, **kwargs)

    def __str__(self):
        return self.code


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="order_items")
    product_name = models.CharField(max_length=180)
    unit_price = models.PositiveIntegerField()
    quantity = models.PositiveIntegerField()
    line_total = models.PositiveIntegerField()


class PaymentEvent(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="payment_events")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    event = models.CharField(max_length=32)
    note = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
