from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("commerce", "0007_order_payment_sender_details"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="delivery_method",
            field=models.CharField(choices=[("pickup", "Ambil di koperasi"), ("gosend", "GoSend")], default="pickup", max_length=12),
        ),
        migrations.AddField(
            model_name="order",
            name="delivery_fee",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="order",
            name="delivery_distance_km",
            field=models.DecimalField(blank=True, decimal_places=1, max_digits=5, null=True),
        ),
        migrations.AddField(
            model_name="order",
            name="delivery_address",
            field=models.CharField(blank=True, max_length=300),
        ),
        migrations.AddField(
            model_name="order",
            name="delivery_recipient",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="order",
            name="delivery_phone",
            field=models.CharField(blank=True, max_length=20),
        ),
    ]
