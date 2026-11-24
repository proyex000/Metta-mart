from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("commerce", "0010_order_idempotency"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="delivery_fee_confirmed",
            field=models.BooleanField(default=True),
        ),
    ]
