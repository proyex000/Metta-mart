import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("commerce", "0001_initial")]
    operations = [
        migrations.AlterField(
            model_name="order",
            name="customer",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="commerce_orders", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="order",
            name="created_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="created_commerce_orders", to=settings.AUTH_USER_MODEL),
        ),
        migrations.CreateModel(
            name="CashierShift",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("status", models.CharField(choices=[("open", "Terbuka"), ("closed", "Ditutup")], default="open", max_length=12)),
                ("opening_cash", models.PositiveBigIntegerField(default=0)),
                ("expected_cash", models.PositiveBigIntegerField(default=0)),
                ("closing_cash", models.PositiveBigIntegerField(blank=True, null=True)),
                ("opening_note", models.CharField(blank=True, max_length=240)),
                ("closing_note", models.CharField(blank=True, max_length=240)),
                ("opened_at", models.DateTimeField(auto_now_add=True)),
                ("closed_at", models.DateTimeField(blank=True, null=True)),
                ("cashier", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="cashier_shifts", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ("-opened_at",)},
        ),
        migrations.CreateModel(
            name="CashMovement",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("kind", models.CharField(choices=[("cash_in", "Kas masuk"), ("cash_out", "Kas keluar")], max_length=12)),
                ("amount", models.PositiveBigIntegerField()),
                ("note", models.CharField(max_length=240)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("actor", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
                ("shift", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="cash_movements", to="commerce.cashiershift")),
            ],
            options={"ordering": ("created_at",)},
        ),
        migrations.AddField(
            model_name="payment",
            name="shift",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="payments", to="commerce.cashiershift"),
        ),
        migrations.AddIndex(
            model_name="cashiershift",
            index=models.Index(fields=["cashier", "status"], name="commerce_shift_user_status_idx"),
        ),
    ]
