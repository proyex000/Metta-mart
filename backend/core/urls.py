from django.urls import path
from .views import AuditLogListView, StoreSettingDetailView, StoreSettingListCreateView, StorefrontSettingsView

urlpatterns = [
    path("storefront/settings/", StorefrontSettingsView.as_view(), name="storefront-settings"),
    path("admin/audit-logs/", AuditLogListView.as_view(), name="admin-audit-logs"),
    path("admin/settings/", StoreSettingListCreateView.as_view(), name="admin-settings"),
    path("admin/settings/<str:key>/", StoreSettingDetailView.as_view(), name="admin-setting-detail"),
]
