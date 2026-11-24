from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path
from core.health import HealthView

urlpatterns = [
    path("api/health/", HealthView.as_view(), name="health"),
    path("api/", include("accounts.urls")),
    path("api/", include("core.urls")),
    path("api/", include("commerce.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
