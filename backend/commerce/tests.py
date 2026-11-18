from django.test import TestCase
from rest_framework.test import APIClient
from accounts.models import User
from core.models import StoreSetting
from .models import Category, Order, Payment, Product, StockMovement


class CommerceApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user("admin@test.local", "TestPassword!2026", full_name="Admin", role=User.Role.ADMIN, is_staff=True)
        self.student = User.objects.create_user("1234567890", "TestPassword!2026", full_name="Student", role=User.Role.STUDENT)
        self.category = Category.objects.create(name="Kategori Uji", slug="kategori-uji")
        self.product = Product.objects.create(name="Buku", category=self.category, price=5000, stock=10)

    def test_public_catalog_requires_login_and_student_can_read(self):
        self.assertIn(self.client.get("/api/products/").status_code, (401, 403))
        self.client.force_authenticate(self.student)
        response = self.client.get("/api/products/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"][0]["stock"], 10)

    def test_student_cannot_change_product(self):
        self.client.force_authenticate(self.student)
        response = self.client.patch(f"/api/products/{self.product.pk}/", {"price": 1}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_checkout_reserves_stock_and_snapshots_price(self):
        self.client.force_authenticate(self.student)
        response = self.client.post("/api/orders/checkout/", {"items": [{"product_id": self.product.pk, "quantity": 2}], "fulfillment": "pickup", "payment_method": "cash"}, format="json")
        self.assertEqual(response.status_code, 201)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 8)
        self.assertEqual(response.data["total"], 10000)
        self.assertEqual(response.data["status"], Order.Status.PENDING_REVIEW)
        self.assertEqual(StockMovement.objects.filter(kind=StockMovement.Kind.RESERVED).count(), 1)

    def test_checkout_rejects_overselling(self):
        self.client.force_authenticate(self.student)
        response = self.client.post("/api/orders/checkout/", {"items": [{"product_id": self.product.pk, "quantity": 11}], "fulfillment": "pickup", "payment_method": "cash"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 10)

    def test_qris_order_requires_admin_verification_before_acceptance(self):
        StoreSetting.objects.create(key="checkout", value={"cash_enabled": True, "qris_enabled": True, "qris_image_url": "https://example.test/qris.png", "pickup_enabled": True, "delivery_enabled": False, "delivery_fee": 0})
        self.client.force_authenticate(self.student)
        created = self.client.post("/api/orders/checkout/", {"items": [{"product_id": self.product.pk, "quantity": 1}], "fulfillment": "pickup", "payment_method": "qris"}, format="json")
        code = created.data["code"]
        self.client.force_authenticate(self.admin)
        rejected = self.client.post(f"/api/orders/{code}/actions/", {"action": "accept"}, format="json")
        self.assertEqual(rejected.status_code, 400)
        verified = self.client.post(f"/api/orders/{code}/actions/", {"action": "verify_payment", "note": "Cocok dengan mutasi QRIS"}, format="json")
        self.assertEqual(verified.status_code, 200)
        accepted = self.client.post(f"/api/orders/{code}/actions/", {"action": "accept"}, format="json")
        self.assertEqual(accepted.data["status"], Order.Status.ACCEPTED)

    def test_customer_cannot_read_another_customers_order(self):
        other = User.objects.create_user("0987654321", "TestPassword!2026", full_name="Other", role=User.Role.STUDENT)
        order = Order.objects.create(customer=other, fulfillment=Order.Fulfillment.PICKUP)
        Payment.objects.create(order=order, method=Payment.Method.CASH, status=Payment.Status.UNPAID, amount=0, reference=order.code)
        self.client.force_authenticate(self.student)
        response = self.client.get(f"/api/orders/{order.code}/")
        self.assertEqual(response.status_code, 404)

    def test_reject_restores_reserved_stock(self):
        self.client.force_authenticate(self.student)
        created = self.client.post("/api/orders/checkout/", {"items": [{"product_id": self.product.pk, "quantity": 3}], "fulfillment": "pickup", "payment_method": "cash"}, format="json")
        self.client.force_authenticate(self.admin)
        response = self.client.post(f"/api/orders/{created.data['code']}/actions/", {"action": "reject", "note": "Stok perlu diperiksa"}, format="json")
        self.assertEqual(response.data["status"], Order.Status.REJECTED)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 10)

    def test_delivery_requires_address(self):
        self.client.force_authenticate(self.student)
        response = self.client.post("/api/orders/checkout/", {"items": [{"product_id": self.product.pk, "quantity": 1}], "fulfillment": "delivery", "payment_method": "cash"}, format="json")
        self.assertEqual(response.status_code, 400)
