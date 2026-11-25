from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("commerce", "0009_product_image"),
    ]

    operations = [
        # TiDB does not support adding a column and its UNIQUE constraint
        # in the same ALTER TABLE statement. Add the nullable column first.
        migrations.AddField(
            model_name="order",
            name="idempotency_key",
            field=models.CharField(
                blank=True,
                max_length=64,
                null=True,
            ),
        ),
        # Add the unique index in a separate schema operation.
        migrations.AlterField(
            model_name="order",
            name="idempotency_key",
            field=models.CharField(
                blank=True,
                max_length=64,
                null=True,
                unique=True,
            ),
        ),
        migrations.AddField(
            model_name="order",
            name="request_fingerprint",
            field=models.CharField(blank=True, max_length=64),
        ),
    ]
