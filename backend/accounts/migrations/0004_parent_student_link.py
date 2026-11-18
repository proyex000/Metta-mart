from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0003_alter_user_options"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ParentStudentLink",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("parent", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="linked_students", to=settings.AUTH_USER_MODEL)),
                ("student", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="linked_parents", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ("student__full_name",)},
        ),
        migrations.AddConstraint(
            model_name="parentstudentlink",
            constraint=models.UniqueConstraint(fields=("parent", "student"), name="accounts_parent_student_unique"),
        ),
    ]
