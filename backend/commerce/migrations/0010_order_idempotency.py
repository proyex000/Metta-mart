from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [("commerce", "0009_product_image")]
    operations = [
        migrations.AddField(model_name="order", name="idempotency_key", field=models.CharField(blank=True, max_length=64, null=True, unique=True)),
        migrations.AddField(model_name="order", name="request_fingerprint", field=models.CharField(blank=True, max_length=64)),
    ]
