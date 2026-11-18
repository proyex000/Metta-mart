from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("commerce", "0003_order_beneficiary"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="sales_channel",
            field=models.CharField(choices=[("online", "Online"), ("pos", "POS")], default="online", max_length=12),
        ),
    ]
