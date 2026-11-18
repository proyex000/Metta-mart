from django.urls import path
from .views import AdminOrderActionView, AdminOrderListView, AdminPaymentActionView, OrderDetailView, OrderListCreateView, ProductDetailView, ProductListCreateView

urlpatterns = [
    path("products/", ProductListCreateView.as_view(), name="products"),
    path("products/<int:pk>/", ProductDetailView.as_view(), name="product-detail"),
    path("orders/", OrderListCreateView.as_view(), name="orders"),
    path("orders/<str:code>/", OrderDetailView.as_view(), name="order-detail"),
    path("admin/orders/", AdminOrderListView.as_view(), name="admin-orders"),
    path("admin/orders/<str:code>/<str:action>/", AdminOrderActionView.as_view(), name="admin-order-action"),
    path("admin/orders/<str:code>/payment/<str:action>/", AdminPaymentActionView.as_view(), name="admin-payment-action"),
]
