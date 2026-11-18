from rest_framework.permissions import BasePermission

class IsAdminRole(BasePermission):
    message = "Akses hanya untuk admin."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == "admin")
