from django.test import TestCase
from rest_framework.test import APIClient
from accounts.models import User
from core.models import StoreSetting
from .models import Order, Product


class CommerceApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(identifier="admin-commerce", password="TestPassword!2026", full_name="Admin", role=User.Role.ADMIN, is_staff=True)
        self.student = User.objects.create_user(identifier="1234567890", password="TestPassword!2026", full_name="Student", role=User.Role.STUDENT)
        self.other_student = User.objects.create_user(identifier="1234567891", password="TestPassword!2026", full_name="Other Student", role=User.Role.STUDENT)
        self.product = Product.objects.create(name="Buku Tulis", category="buku", price=5000, stock=10)

    def create_order(self, payment_method="cash"):
        self.client.force_authenticate(user=self.student)
        return self.client.post("/api/orders/", {
            "payment_method": payment_method,
            "items": [{"product_id": self.product.id, "quantity": 2}],
        }, format="json")

    def test_order_uses_server_price_and_reduces_stock(self):
        response = self.create_order()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["total"], 10000)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 8)

    def test_customer_cannot_read_another_customers_order(self):
        response = self.create_order()
        code = response.data["code"]
        self.client.force_authenticate(user=self.other_student)
        detail = self.client.get(f"/api/orders/{code}/")
        self.assertEqual(detail.status_code, 404)

    def test_student_cannot_access_admin_order_queue(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.get("/api/admin/orders/")
        self.assertEqual(response.status_code, 403)

    def test_cancel_restores_stock_once(self):
        response = self.create_order()
        code = response.data["code"]
        self.client.force_authenticate(user=self.admin)
        cancelled = self.client.post(f"/api/admin/orders/{code}/cancel/", {}, format="json")
        self.assertEqual(cancelled.status_code, 200)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 10)
        second = self.client.post(f"/api/admin/orders/{code}/cancel/", {}, format="json")
        self.assertEqual(second.status_code, 400)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 10)

    def test_pickup_requires_ready_status(self):
        from django.utils import timezone
        day_codes = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
        today = day_codes[timezone.localtime().weekday()]
        StoreSetting.objects.create(key="operating_hours", value={"days": [today], "open_time": "00:00", "close_time": "23:59"})
        response = self.create_order()
        code = response.data["code"]
        self.client.force_authenticate(user=self.admin)
        early = self.client.post(f"/api/admin/orders/{code}/complete-pickup/", {}, format="json")
        self.assertEqual(early.status_code, 400)
        self.client.post(f"/api/admin/orders/{code}/accept/", {}, format="json")
        ready = self.client.post(f"/api/admin/orders/{code}/ready/", {}, format="json")
        self.assertEqual(ready.status_code, 200)
        completed = self.client.post(f"/api/admin/orders/{code}/complete-pickup/", {}, format="json")
        self.assertEqual(completed.status_code, 200)
        self.assertEqual(completed.data["status"], Order.Status.COMPLETED)

    def test_bank_transfer_requires_manual_verification_before_pickup(self):
        from django.utils import timezone
        day_codes = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
        today = day_codes[timezone.localtime().weekday()]
        StoreSetting.objects.create(key="operating_hours", value={"days": [today], "open_time": "00:00", "close_time": "23:59"})
        response = self.create_order("bank_transfer")
        self.assertEqual(response.status_code, 201)
        code = response.data["code"]
        self.client.force_authenticate(user=self.student)
        submitted = self.client.post(f"/api/orders/{code}/payment-submission/", {"note": "Referensi transfer TEST-001"}, format="json")
        self.assertEqual(submitted.status_code, 200)
        self.assertEqual(submitted.data["payment_status"], Order.PaymentStatus.PENDING)
        self.client.force_authenticate(user=self.admin)
        self.client.post(f"/api/admin/orders/{code}/accept/", {}, format="json")
        self.client.post(f"/api/admin/orders/{code}/ready/", {}, format="json")
        blocked = self.client.post(f"/api/admin/orders/{code}/complete-pickup/", {}, format="json")
        self.assertEqual(blocked.status_code, 400)
        verified = self.client.post(f"/api/admin/orders/{code}/payment/verify/", {"note": "Cocok dengan mutasi rekening"}, format="json")
        self.assertEqual(verified.status_code, 200)
        self.assertEqual(verified.data["payment_status"], Order.PaymentStatus.PAID)
        completed = self.client.post(f"/api/admin/orders/{code}/complete-pickup/", {}, format="json")
        self.assertEqual(completed.status_code, 200)

    def test_disabled_payment_method_is_rejected_by_backend(self):
        StoreSetting.objects.create(key="payment_methods", value={"cash": True, "bank_transfer": False, "qris": True})
        response = self.create_order("bank_transfer")
        self.assertEqual(response.status_code, 400)

    def test_ordering_is_not_blocked_by_empty_operating_hours(self):
        StoreSetting.objects.create(key="operating_hours", value={"days": [], "open_time": "", "close_time": ""})
        response = self.create_order("cash")
        self.assertEqual(response.status_code, 201)
