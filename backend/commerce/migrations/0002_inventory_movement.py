import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("commerce", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]
    operations = [
        migrations.CreateModel(
            name="InventoryMovement",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("quantity_delta", models.IntegerField()),
                ("reason", models.CharField(choices=[("initial_stock", "Stok awal"), ("manual_adjustment", "Penyesuaian manual"), ("order_reserved", "Dipesan pelanggan"), ("order_cancelled", "Pesanan dibatalkan")], max_length=32)),
                ("reference", models.CharField(blank=True, max_length=80)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("actor", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="stock_movements", to=settings.AUTH_USER_MODEL)),
                ("product", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="stock_movements", to="commerce.product")),
            ],
            options={"ordering": ("-created_at",)},
        ),
        migrations.AddIndex(
            model_name="inventorymovement",
            index=models.Index(fields=["product", "created_at"], name="commerce_i_product_13e4a1_idx"),
        ),
    ]
