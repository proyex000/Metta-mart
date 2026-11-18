from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("commerce", "0005_inventory_pos_sale_reason"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="cash_received",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
    ]
