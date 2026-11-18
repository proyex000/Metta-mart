import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def seed_categories(apps, schema_editor):
    Category = apps.get_model("commerce", "Category")
    for order, (slug, name) in enumerate([
        ("alat-tulis", "Alat Tulis"), ("buku", "Buku"), ("minuman", "Minuman"),
        ("seragam-sekolah", "Seragam Sekolah"), ("lainnya", "Lainnya"),
    ]):
        Category.objects.get_or_create(slug=slug, defaults={"name": name, "sort_order": order})


class Migration(migrations.Migration):
    initial = True
    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(name="Category", fields=[
            ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
            ("name", models.CharField(max_length=80)), ("slug", models.SlugField(max_length=80, unique=True)),
            ("is_active", models.BooleanField(default=True)), ("sort_order", models.PositiveSmallIntegerField(default=0)),
            ("created_at", models.DateTimeField(auto_now_add=True)),
        ], options={"ordering": ("sort_order", "name")}),
        migrations.CreateModel(name="Product", fields=[
            ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
            ("name", models.CharField(max_length=180)), ("sku", models.CharField(blank=True, max_length=64, null=True, unique=True)),
            ("barcode", models.CharField(blank=True, max_length=64, null=True, unique=True)), ("description", models.TextField(blank=True)),
            ("unit", models.CharField(default="pcs", max_length=24)), ("price", models.PositiveBigIntegerField()),
            ("cost_price", models.PositiveBigIntegerField(default=0)), ("stock", models.PositiveIntegerField(default=0)),
            ("min_stock", models.PositiveIntegerField(default=0)), ("image_url", models.URLField(blank=True)),
            ("is_active", models.BooleanField(default=True)), ("created_at", models.DateTimeField(auto_now_add=True)),
            ("updated_at", models.DateTimeField(auto_now=True)),
            ("category", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="products", to="commerce.category")),
        ], options={"ordering": ("name",)}),
        migrations.CreateModel(name="Order", fields=[
            ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
            ("code", models.CharField(editable=False, max_length=32, unique=True)),
            ("status", models.CharField(choices=[("awaiting_payment", "Menunggu pembayaran"), ("pending_review", "Menunggu konfirmasi"), ("accepted", "Diterima"), ("processing", "Diproses"), ("ready", "Siap diambil"), ("out_for_delivery", "Dalam pengiriman"), ("completed", "Selesai"), ("rejected", "Ditolak"), ("cancelled", "Dibatalkan"), ("expired", "Kedaluwarsa")], default="pending_review", max_length=24)),
            ("fulfillment", models.CharField(choices=[("pickup", "Ambil di toko"), ("delivery", "Pengiriman")], max_length=12)),
            ("delivery_address", models.TextField(blank=True)), ("customer_note", models.CharField(blank=True, max_length=500)), ("admin_note", models.CharField(blank=True, max_length=500)),
            ("subtotal", models.PositiveBigIntegerField(default=0)), ("delivery_fee", models.PositiveBigIntegerField(default=0)), ("total", models.PositiveBigIntegerField(default=0)),
            ("expires_at", models.DateTimeField(blank=True, null=True)), ("created_at", models.DateTimeField(auto_now_add=True)), ("updated_at", models.DateTimeField(auto_now=True)),
            ("customer", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="commerce_orders", to=settings.AUTH_USER_MODEL)),
        ], options={"ordering": ("-created_at",)}),
        migrations.CreateModel(name="StockMovement", fields=[
            ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
            ("kind", models.CharField(choices=[("initial", "Stok awal"), ("restock", "Barang masuk"), ("adjustment", "Penyesuaian"), ("reserved", "Reservasi pesanan"), ("released", "Reservasi dilepas"), ("sold", "Penjualan")], max_length=16)),
            ("quantity_delta", models.IntegerField()), ("stock_after", models.PositiveIntegerField()), ("reference", models.CharField(blank=True, max_length=80)),
            ("note", models.CharField(blank=True, max_length=240)), ("created_at", models.DateTimeField(auto_now_add=True)),
            ("actor", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ("product", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="stock_movements", to="commerce.product")),
        ], options={"ordering": ("-created_at",)}),
        migrations.CreateModel(name="OrderItem", fields=[
            ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
            ("product_name", models.CharField(max_length=180)), ("sku", models.CharField(blank=True, max_length=64)), ("unit", models.CharField(default="pcs", max_length=24)),
            ("unit_price", models.PositiveBigIntegerField()), ("quantity", models.PositiveIntegerField()), ("line_total", models.PositiveBigIntegerField()),
            ("order", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="items", to="commerce.order")),
            ("product", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="order_items", to="commerce.product")),
        ]),
        migrations.CreateModel(name="Payment", fields=[
            ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
            ("method", models.CharField(choices=[("cash", "Tunai"), ("qris", "QRIS toko")], max_length=12)),
            ("status", models.CharField(choices=[("unpaid", "Belum dibayar"), ("pending_verification", "Menunggu verifikasi"), ("paid", "Lunas"), ("failed", "Gagal"), ("expired", "Kedaluwarsa"), ("refund_pending", "Menunggu pengembalian dana"), ("refunded", "Dikembalikan")], max_length=24)),
            ("amount", models.PositiveBigIntegerField()), ("reference", models.CharField(max_length=80, unique=True)), ("paid_at", models.DateTimeField(blank=True, null=True)),
            ("verification_note", models.CharField(blank=True, max_length=240)), ("created_at", models.DateTimeField(auto_now_add=True)), ("updated_at", models.DateTimeField(auto_now=True)),
            ("order", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="payment", to="commerce.order")),
            ("verified_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
        ]),
        migrations.CreateModel(name="OrderStatusHistory", fields=[
            ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")), ("from_status", models.CharField(blank=True, max_length=24)),
            ("to_status", models.CharField(max_length=24)), ("note", models.CharField(blank=True, max_length=500)), ("created_at", models.DateTimeField(auto_now_add=True)),
            ("actor", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ("order", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="status_history", to="commerce.order")),
        ], options={"ordering": ("created_at",)}),
        migrations.AddIndex(model_name="product", index=models.Index(fields=["is_active", "category"], name="commerce_pr_active_cat_idx")),
        migrations.AddIndex(model_name="product", index=models.Index(fields=["name"], name="commerce_pr_name_idx")),
        migrations.AddIndex(model_name="stockmovement", index=models.Index(fields=["product", "created_at"], name="commerce_sm_product_date_idx")),
        migrations.AddIndex(model_name="order", index=models.Index(fields=["status", "created_at"], name="commerce_or_status_date_idx")),
        migrations.AddIndex(model_name="order", index=models.Index(fields=["customer", "created_at"], name="commerce_or_customer_date_idx")),
        migrations.AddConstraint(model_name="product", constraint=models.CheckConstraint(condition=models.Q(("price__gte", 0)), name="product_price_nonnegative")),
        migrations.RunPython(seed_categories, migrations.RunPython.noop),
    ]
