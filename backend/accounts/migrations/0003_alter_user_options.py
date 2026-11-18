from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0002_remove_cashier_role"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="user",
            options={},
        ),
    ]
