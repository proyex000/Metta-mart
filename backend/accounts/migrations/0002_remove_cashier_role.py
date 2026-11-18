from django.db import migrations, models


def deactivate_legacy_cashiers(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    User.objects.filter(role="cashier").update(is_active=False)


class Migration(migrations.Migration):
    dependencies = [("accounts", "0001_initial")]
    operations = [
        migrations.RunPython(deactivate_legacy_cashiers, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="user",
            name="role",
            field=models.CharField(choices=[("admin", "Admin"), ("student", "Siswa"), ("parent", "Orang tua")], max_length=20),
        ),
    ]
