from django.urls import path
from .views import CategoryDetailView, CategoryListCreateView, CheckoutView, OrderActionView, OrderDetailView, OrderListView, ProductDetailView, ProductListCreateView, StockAdjustmentView, StockMovementListView

urlpatterns = [
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
