from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("commerce", "0009_product_image"),
    ]

    operations = [
        # TiDB rejects adding a column together with a UNIQUE constraint.
        # Create the nullable column first, then create the unique index
        # as a separate DDL statement.
        migrations.AddField(
            model_name="order",
            name="idempotency_key",
            field=models.CharField(
                blank=True,
                max_length=64,
                null=True,
            ),
        ),
        migrations.RunSQL(
            sql=(
                "CREATE UNIQUE INDEX "
                "`commerce_order_idempotency_key_uniq` "
                "ON `commerce_order` (`idempotency_key`)"
            ),
            reverse_sql=(
                "DROP INDEX `commerce_order_idempotency_key_uniq` "
                "ON `commerce_order`"
            ),
            # Keep Django's migration state identical to Order.idempotency_key
            # (unique=True) without asking the schema editor to combine DDL.
            state_operations=[
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
            ],
        ),
        migrations.AddField(
            model_name="order",
            name="request_fingerprint",
            field=models.CharField(blank=True, max_length=64),
        ),
    ]
