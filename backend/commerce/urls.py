from django.urls import path
from .views import OrderCancelView, DeliveryQuoteView, AdminPOSCheckoutView, AdminInventoryMovementListView, AdminOrderActionView, AdminDashboardView, AdminOrderListView, AdminPaymentActionView, AdminSalesReportView, OrderDetailView, OrderListCreateView, PaymentSubmissionView, ProductDetailView, ProductListCreateView

urlpatterns = [
    path("products/", ProductListCreateView.as_view(), name="products"),
    path("products/<int:pk>/", ProductDetailView.as_view(), name="product-detail"),
    path("delivery/quote/", DeliveryQuoteView.as_view(), name="delivery-quote"),
    path("orders/", OrderListCreateView.as_view(), name="orders"),
    path("orders/<str:code>/", OrderDetailView.as_view(), name="order-detail"),
    path("orders/<str:code>/cancel/", OrderCancelView.as_view(), name="order-cancel"),
    path("orders/<str:code>/payment-submission/", PaymentSubmissionView.as_view(), name="payment-submission"),
    path("admin/dashboard/", AdminDashboardView.as_view(), name="admin-dashboard"),
    path("admin/pos/checkout/", AdminPOSCheckoutView.as_view(), name="admin-pos-checkout"),
    path("admin/orders/", AdminOrderListView.as_view(), name="admin-orders"),
    path("admin/reports/summary/", AdminSalesReportView.as_view(), name="admin-sales-report"),
    path("admin/inventory-movements/", AdminInventoryMovementListView.as_view(), name="admin-inventory-movements"),
    path("admin/orders/<str:code>/<str:action>/", AdminOrderActionView.as_view(), name="admin-order-action"),
    path("admin/orders/<str:code>/payment/<str:action>/", AdminPaymentActionView.as_view(), name="admin-payment-action"),
]
