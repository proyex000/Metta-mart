from django.urls import path
from .views import AuditLogListView, NotificationListView, NotificationReadView, StorefrontSettingsView, MyNotificationPreferencesView

urlpatterns = [
    path("storefront/settings/", StorefrontSettingsView.as_view(), name="storefront-settings"),
    path("auth/notification-preferences/", MyNotificationPreferencesView.as_view(), name="my-notification-preferences"),
    path("notifications/", NotificationListView.as_view(), name="notifications"),
    path("notifications/<int:notification_id>/read/", NotificationReadView.as_view(), name="notification-read"),
    path("admin/audit-logs/", AuditLogListView.as_view(), name="admin-audit-logs"),
]
