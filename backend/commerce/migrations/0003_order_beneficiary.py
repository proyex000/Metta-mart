from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0004_parent_student_link"),
        ("commerce", "0002_inventory_movement"),
    ]

    operations = [
        # Add the nullable column first, without creating the foreign key
        # in the same ALTER TABLE statement. This avoids a TiDB DDL issue.
        migrations.AddField(
            model_name="order",
            name="beneficiary",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="beneficiary_orders",
                to=settings.AUTH_USER_MODEL,
                db_constraint=False,
            ),
        ),
        # Create the foreign key in a separate schema operation.
        migrations.AlterField(
            model_name="order",
            name="beneficiary",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="beneficiary_orders",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
