from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0004_parent_student_link"),
        ("commerce", "0002_inventory_movement"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="beneficiary",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="beneficiary_orders", to=settings.AUTH_USER_MODEL),
        ),
    ]
