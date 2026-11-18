from django.urls import path
from .config_views import CheckoutConfigAdminView, CheckoutConfigView
from .pos_views import CashMovementView, CloseShiftView, CurrentShiftView, OpenShiftView, POSCheckoutView
from .report_views import SalesReportView
from .notification_views import NotificationListView, NotificationReadAllView, NotificationReadView, NotificationUnreadCountView
from .views import CategoryDetailView, CategoryListCreateView, CheckoutView, OrderActionView, OrderDetailView, OrderListView, ProductDetailView, ProductListCreateView, StockAdjustmentView, StockMovementListView

urlpatterns = [
    path("notifications/", NotificationListView.as_view(), name="notification-list"),
    path("notifications/unread-count/", NotificationUnreadCountView.as_view(), name="notification-unread-count"),
    path("notifications/read-all/", NotificationReadAllView.as_view(), name="notification-read-all"),
    path("notifications/<int:pk>/read/", NotificationReadView.as_view(), name="notification-read"),
    path("admin/reports/sales/", SalesReportView.as_view(), name="admin-sales-report"),
    path("pos/shifts/current/", CurrentShiftView.as_view(), name="pos-current-shift"),
    path("pos/shifts/open/", OpenShiftView.as_view(), name="pos-open-shift"),
    path("pos/shifts/close/", CloseShiftView.as_view(), name="pos-close-shift"),
    path("pos/shifts/movements/", CashMovementView.as_view(), name="pos-cash-movement"),
    path("pos/checkout/", POSCheckoutView.as_view(), name="pos-checkout"),
    path("store/checkout-config/", CheckoutConfigView.as_view(), name="checkout-config"),
    path("admin/checkout-config/", CheckoutConfigAdminView.as_view(), name="admin-checkout-config"),
    path("categories/", CategoryListCreateView.as_view(), name="category-list"),
    path("categories/<int:pk>/", CategoryDetailView.as_view(), name="category-detail"),
    path("products/", ProductListCreateView.as_view(), name="product-list"),
    path("products/<int:pk>/", ProductDetailView.as_view(), name="product-detail"),
    path("products/<int:pk>/stock-adjustments/", StockAdjustmentView.as_view(), name="stock-adjustment"),
    path("admin/stock-movements/", StockMovementListView.as_view(), name="stock-movements"),
    path("orders/checkout/", CheckoutView.as_view(), name="order-checkout"),
    path("orders/", OrderListView.as_view(), name="order-list"),
    path("orders/<str:code>/", OrderDetailView.as_view(), name="order-detail"),
    path("orders/<str:code>/actions/", OrderActionView.as_view(), name="order-action"),
]
