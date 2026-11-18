from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("commerce", "0004_order_sales_channel"),
    ]

    operations = [
        migrations.AlterField(
            model_name="inventorymovement",
            name="reason",
            field=models.CharField(choices=[("initial_stock", "Stok awal"), ("manual_adjustment", "Penyesuaian manual"), ("order_reserved", "Dipesan pelanggan"), ("order_cancelled", "Pesanan dibatalkan"), ("pos_sale", "Penjualan langsung POS")], max_length=32),
        ),
    ]
