from django.urls import path
from .views import AuditLogListView, StoreSettingDetailView, StoreSettingListCreateView

urlpatterns = [
    path("admin/audit-logs/", AuditLogListView.as_view(), name="admin-audit-logs"),
    path("admin/settings/", StoreSettingListCreateView.as_view(), name="admin-settings"),
    path("admin/settings/<str:key>/", StoreSettingDetailView.as_view(), name="admin-setting-detail"),
]
