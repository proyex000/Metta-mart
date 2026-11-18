from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.utils import timezone

class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, identifier, password=None, **extra_fields):
        if not identifier:
            raise ValueError("Identifier wajib diisi.")
        user = self.model(identifier=self.normalize_email(identifier) if "@" in identifier else identifier, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, identifier, password=None, **extra_fields):
        extra_fields.setdefault("role", User.Role.ADMIN)
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)
        if extra_fields.get("is_staff") is not True or extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser harus memiliki is_staff dan is_superuser.")
        return self.create_user(identifier, password, **extra_fields)

class User(AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        CASHIER = "cashier", "Kasir"
        STUDENT = "student", "Siswa"
        PARENT = "parent", "Orang tua"

    identifier = models.CharField(max_length=100, unique=True)
    full_name = models.CharField(max_length=150)
    email = models.EmailField(blank=True)
    role = models.CharField(max_length=20, choices=Role.choices)
    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "identifier"
    REQUIRED_FIELDS = ["full_name"]

    def __str__(self):
        return f"{self.full_name} ({self.identifier})"
