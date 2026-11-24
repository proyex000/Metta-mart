from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("commerce", "0010_order_idempotency"),
    ]

    operations = [
        migrations.AlterField(
            model_name="order",
            name="status",
            field=models.CharField(
                choices=[
                    ("pending", "Menunggu konfirmasi"),
                    ("accepted", "Diproses"),
                    ("ready_for_pickup", "Siap diambil"),
                    ("delivering", "Sedang diantar"),
                    ("completed", "Selesai"),
                    ("cancelled", "Dibatalkan"),
                ],
                default="pending",
                max_length=24,
            ),
        ),
        migrations.AddField(
            model_name="order",
            name="delivering_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
