from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("commerce", "0002_pos_and_shifts")]
    operations = [
        migrations.AddField(
            model_name="payment",
            name="cash_received",
            field=models.PositiveBigIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="payment",
            name="change_due",
            field=models.PositiveBigIntegerField(default=0),
        ),
    ]
