from datetime import timedelta
from django.db.models import Count, Sum, F, Value
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import permissions
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from accounts.models import User
from .models import Order, OrderItem, Payment


class SalesReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.role != User.Role.ADMIN:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Laporan penjualan hanya tersedia untuk Admin.")
        today = timezone.localdate()
        start = parse_date(request.query_params.get("from", "")) if request.query_params.get("from") else today - timedelta(days=6)
        end = parse_date(request.query_params.get("to", "")) if request.query_params.get("to") else today
        if start is None or end is None:
            raise ValidationError({"date": "Tanggal harus menggunakan format YYYY-MM-DD."})
        if start > end:
            raise ValidationError({"date": "Tanggal awal tidak boleh melewati tanggal akhir."})
        if (end - start).days > 365:
            raise ValidationError({"date": "Rentang laporan maksimal 366 hari."})

        orders = Order.objects.filter(
            status=Order.Status.COMPLETED,
            payment__status=Payment.Status.PAID,
            created_at__date__gte=start,
            created_at__date__lte=end,
        )
        summary = orders.aggregate(total_sales=Sum("total"), orders_count=Count("id"))
        total_sales = summary["total_sales"] or 0
        orders_count = summary["orders_count"] or 0
        daily = orders.annotate(day=TruncDate("created_at")).values("day").annotate(
            sales=Sum("total"), orders=Count("id")
        ).order_by("day")
        category_rows = OrderItem.objects.filter(order__in=orders).values(
            category=Coalesce("product__category__name", Value("Produk diarsipkan"))
        ).annotate(sales=Sum("line_total"), quantity=Sum("quantity")).order_by("-sales")
        top_products = OrderItem.objects.filter(order__in=orders).values("product_name").annotate(
            sales=Sum("line_total"), quantity=Sum("quantity")
        ).order_by("-sales", "product_name")[:10]
        payment_rows = orders.values("payment__method").annotate(
            sales=Sum("total"), orders=Count("id")
        ).order_by("payment__method")
        return Response({
            "from": start.isoformat(),
            "to": end.isoformat(),
            "total_sales": total_sales,
            "orders_count": orders_count,
            "average_order": round(total_sales / orders_count) if orders_count else 0,
            "daily_sales": [{"date": row["day"].isoformat(), "sales": row["sales"] or 0, "orders": row["orders"]} for row in daily],
            "category_sales": [{"category": row["category"], "sales": row["sales"] or 0, "quantity": row["quantity"] or 0} for row in category_rows],
            "top_products": [{"product_name": row["product_name"], "sales": row["sales"] or 0, "quantity": row["quantity"] or 0} for row in top_products],
            "payment_methods": [{"method": row["payment__method"], "sales": row["sales"] or 0, "orders": row["orders"]} for row in payment_rows],
        })
