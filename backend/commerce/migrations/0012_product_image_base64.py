from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("commerce", "0011_order_delivery_fee_confirmed"),
    ]

    operations = [
        migrations.AlterField(
            model_name="product",
            name="image",
            field=models.TextField(blank=True, null=True),
        ),
    ]
