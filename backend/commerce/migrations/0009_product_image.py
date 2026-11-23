# Generated for optional product catalogue images.
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("commerce", "0008_order_delivery"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="image",
            field=models.ImageField(blank=True, null=True, upload_to="product_images/"),
        ),
    ]
