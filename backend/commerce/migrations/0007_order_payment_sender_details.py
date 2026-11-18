from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("commerce", "0006_order_cash_received"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="payment_sender_name",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="order",
            name="payment_source",
            field=models.CharField(blank=True, max_length=80),
        ),
        migrations.AddField(
            model_name="order",
            name="payment_account_last4",
            field=models.CharField(blank=True, max_length=4),
        ),
    ]
