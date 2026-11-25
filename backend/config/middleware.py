from django.http import JsonResponse


class RequirePasswordChangeMiddleware:
    """Restrict authenticated accounts with a temporary password to password rotation."""

    allowed_paths = {
        "/api/auth/csrf/",
        "/api/auth/login/",
        "/api/auth/logout/",
        "/api/auth/change-password/",
        "/api/health/",
    }

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path.startswith("/api/") and request.method not in {"OPTIONS", "HEAD"}:
            allowed = request.path in self.allowed_paths or (
                request.path == "/api/auth/me/" and request.method == "GET"
            )
            user = getattr(request, "user", None)
            if (
                not allowed
                and getattr(user, "is_authenticated", False)
                and getattr(user, "must_change_password", False)
            ):
                return JsonResponse(
                    {
                        "detail": "Ganti password sementara Anda terlebih dahulu.",
                        "code": "password_change_required",
                    },
                    status=403,
                )
        return self.get_response(request)
