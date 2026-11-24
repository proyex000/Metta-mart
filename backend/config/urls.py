from django.conf import settings
from django.http import Http404
from django.urls import include, path, re_path
from django.views.static import serve as serve_media
from core.health import HealthView

urlpatterns = [
    path("api/health/", HealthView.as_view(), name="health"),
    path("api/", include("accounts.urls")),
    path("api/", include("core.urls")),
    path("api/", include("commerce.urls")),
]

def media_view(request, path):
    # Product images are public catalog assets. Keep this route limited to that folder,
    # disable directory listings, and store files on a persistent mounted volume.
    if not settings.DEBUG and not settings.MEDIA_SERVE_ENABLED:
        raise Http404
    if not path.startswith("product_images/"):
        raise Http404
    return serve_media(request, path, document_root=settings.MEDIA_ROOT, show_indexes=False)


urlpatterns += [re_path(r"^media/(?P<path>.*)$", media_view)]
