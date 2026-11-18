from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User

@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ("identifier",)
    list_display = ("identifier", "full_name", "role", "is_active", "is_staff")
    list_filter = ("role", "is_active", "is_staff")
    search_fields = ("identifier", "full_name", "email")
    fieldsets = (
        (None, {"fields": ("identifier", "password")}),
        ("Informasi pengguna", {"fields": ("full_name", "email", "role")}),
        ("Akses", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Tanggal", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("identifier", "full_name", "email", "role", "password1", "password2")}),
    )
    filter_horizontal = ("groups", "user_permissions")
    readonly_fields = ("last_login", "date_joined")
