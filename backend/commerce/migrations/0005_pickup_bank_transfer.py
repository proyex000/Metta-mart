from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("commerce", "0004_notification"),
        ("accounts", "0003_remove_cashier_role"),
    ]
    operations = [
        migrations.AlterField(
            model_name="order",
            name="fulfillment",
            field=models.CharField(choices=[("pickup", "Ambil di koperasi")], max_length=12),
        ),
        migrations.AlterField(
            model_name="payment",
            name="method",
            field=models.CharField(choices=[("cash", "Tunai"), ("bank_transfer", "Transfer bank"), ("qris", "QRIS toko")], max_length=20),
        ),
        migrations.AddField(
            model_name="payment",
            name="payment_reference",
            field=models.CharField(blank=True, max_length=120),
        ),
    ]
