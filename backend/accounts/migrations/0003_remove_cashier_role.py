from django.db import migrations, models


def deactivate_legacy_cashier_accounts(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    User.objects.filter(role="cashier").update(is_active=False)


class Migration(migrations.Migration):
    dependencies = [("accounts", "0002_alter_user_options")]
    operations = [
        migrations.RunPython(deactivate_legacy_cashier_accounts, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="user",
            name="role",
            field=models.CharField(choices=[("admin", "Admin"), ("student", "Siswa"), ("parent", "Orang tua")], max_length=20),
        ),
    ]
