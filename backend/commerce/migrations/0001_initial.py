import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(name="Product", fields=[
            ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
            ("name", models.CharField(max_length=180)), ("sku", models.CharField(blank=True, max_length=64, null=True, unique=True)),
            ("category", models.CharField(choices=[("alat-tulis", "Alat Tulis"), ("buku", "Buku"), ("minuman", "Minuman"), ("seragam-sekolah", "Seragam Sekolah"), ("lainnya", "Lainnya")], default="lainnya", max_length=32)),
            ("price", models.PositiveIntegerField()), ("stock", models.PositiveIntegerField(default=0)), ("is_active", models.BooleanField(default=True)),
            ("created_at", models.DateTimeField(auto_now_add=True)), ("updated_at", models.DateTimeField(auto_now=True)),
        ], options={"ordering": ("name",)}),
        migrations.CreateModel(name="Order", fields=[
            ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
            ("code", models.CharField(editable=False, max_length=24, unique=True)),
            ("status", models.CharField(choices=[("pending", "Menunggu konfirmasi"), ("accepted", "Diproses"), ("ready_for_pickup", "Siap diambil"), ("completed", "Selesai"), ("cancelled", "Dibatalkan")], default="pending", max_length=24)),
            ("payment_method", models.CharField(choices=[("cash", "Tunai"), ("bank_transfer", "Transfer bank"), ("qris", "QRIS")], max_length=20)),
            ("payment_status", models.CharField(choices=[("unpaid", "Belum dibayar"), ("pending_verification", "Menunggu verifikasi"), ("paid", "Lunas"), ("failed", "Ditolak"), ("refunded", "Dikembalikan")], default="unpaid", max_length=24)),
            ("note", models.CharField(blank=True, max_length=500)), ("subtotal", models.PositiveIntegerField(default=0)), ("total", models.PositiveIntegerField(default=0)),
            ("created_at", models.DateTimeField(auto_now_add=True)), ("updated_at", models.DateTimeField(auto_now=True)),
            ("accepted_at", models.DateTimeField(blank=True, null=True)), ("ready_at", models.DateTimeField(blank=True, null=True)), ("completed_at", models.DateTimeField(blank=True, null=True)), ("cancelled_at", models.DateTimeField(blank=True, null=True)),
            ("customer", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="orders", to=settings.AUTH_USER_MODEL)),
        ], options={"ordering": ("-created_at",)}),
        migrations.CreateModel(name="OrderItem", fields=[
            ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
            ("product_name", models.CharField(max_length=180)), ("unit_price", models.PositiveIntegerField()), ("quantity", models.PositiveIntegerField()), ("line_total", models.PositiveIntegerField()),
            ("order", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="items", to="commerce.order")),
            ("product", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="order_items", to="commerce.product")),
        ]),
        migrations.CreateModel(name="PaymentEvent", fields=[
            ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
            ("event", models.CharField(max_length=32)), ("note", models.CharField(blank=True, max_length=500)), ("created_at", models.DateTimeField(auto_now_add=True)),
            ("actor", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ("order", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="payment_events", to="commerce.order")),
        ], options={"ordering": ("-created_at",)}),
        migrations.AddIndex(model_name="product", index=models.Index(fields=["is_active", "category"], name="commerce_p_is_acti_9c4c8f_idx")),
        migrations.AddIndex(model_name="order", index=models.Index(fields=["customer", "created_at"], name="commerce_o_customer_3e0a12_idx")),
        migrations.AddIndex(model_name="order", index=models.Index(fields=["status", "created_at"], name="commerce_o_status_83f6a9_idx")),
    ]
