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
            state_operations=[
                migrations.AddConstraint(
                    model_name="order",
                    constraint=models.UniqueConstraint(
                        fields=("idempotency_key",),
                        name="commerce_order_idempotency_key_uniq",
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
