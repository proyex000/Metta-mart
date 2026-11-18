from datetime import timedelta
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from accounts.models import User
from core.models import StoreSetting
from .models import CashierShift, Category, Order, Payment, Product, StockMovement


class CommerceApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user("admin@test.local", "TestPassword!2026", full_name="Admin", role=User.Role.ADMIN, is_staff=True)
        self.student = User.objects.create_user("1234567890", "TestPassword!2026", full_name="Student", role=User.Role.STUDENT)
        self.cashier = User.objects.create_user("cashier@test.local", "TestPassword!2026", full_name="Cashier", role=User.Role.CASHIER)
        self.category = Category.objects.create(name="Kategori Uji", slug="kategori-uji")
        self.product = Product.objects.create(name="Buku", category=self.category, price=5000, stock=10)

    def test_public_catalog_requires_login_and_student_can_read(self):
        self.assertIn(self.client.get("/api/products/").status_code, (401, 403))
        self.client.force_authenticate(self.student)
        response = self.client.get("/api/products/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"][0]["stock"], 10)
        self.assertNotIn("cost_price", response.data["results"][0])

    def test_admin_can_see_product_cost_price(self):
        self.product.cost_price = 2500
        self.product.save(update_fields=("cost_price",))
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/products/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"][0]["cost_price"], 2500)

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


    def test_pos_sale_requires_open_shift_and_updates_cash_expected(self):
        self.client.force_authenticate(self.cashier)
        blocked = self.client.post("/api/pos/checkout/", {"items": [{"product_id": self.product.pk, "quantity": 1}]}, format="json")
        self.assertEqual(blocked.status_code, 400)
        opened = self.client.post("/api/pos/shifts/open/", {"opening_cash": 50000, "note": "Modal awal"}, format="json")
        self.assertEqual(opened.status_code, 201)
        sale = self.client.post("/api/pos/checkout/", {"items": [{"product_id": self.product.pk, "quantity": 1}], "customer_note": "Penjualan langsung", "cash_received": 5000}, format="json")
        self.assertEqual(sale.status_code, 201)
        self.assertEqual(sale.data["status"], Order.Status.COMPLETED)
        self.assertEqual(sale.data["customer_name"], "Pelanggan toko")
        self.assertEqual(sale.data["created_by_name"], "Cashier")
        self.assertEqual(sale.data["payment"]["cash_received"], 5000)
        self.assertEqual(sale.data["payment"]["change_due"], 0)
        current = self.client.get("/api/pos/shifts/current/")
        self.assertEqual(current.data["shift"]["expected_cash"], 55000)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 9)
        closed = self.client.post("/api/pos/shifts/close/", {"closing_cash": 54000, "note": "Selisih kas"}, format="json")
        self.assertEqual(closed.status_code, 200)
        self.assertEqual(closed.data["variance"], -1000)
        self.assertIsNone(self.client.get("/api/pos/shifts/current/").data["shift"])

    def test_pos_checkout_rejects_underpayment_without_changing_stock(self):
        self.client.force_authenticate(self.cashier)
        self.client.post("/api/pos/shifts/open/", {"opening_cash": 10000}, format="json")
        response = self.client.post("/api/pos/checkout/", {"items": [{"product_id": self.product.pk, "quantity": 1}], "cash_received": 4000}, format="json")
        self.assertEqual(response.status_code, 400)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 10)
        self.assertEqual(Order.objects.count(), 0)

    def test_cash_out_cannot_exceed_expected_drawer_balance(self):
        self.client.force_authenticate(self.cashier)
        self.client.post("/api/pos/shifts/open/", {"opening_cash": 1000}, format="json")
        response = self.client.post("/api/pos/shifts/movements/", {"kind": "cash_out", "amount": 1500, "note": "Pengeluaran"}, format="json")
        self.assertEqual(response.status_code, 400)


    def test_cashier_cannot_open_two_concurrent_shifts(self):
        self.client.force_authenticate(self.cashier)
        first = self.client.post("/api/pos/shifts/open/", {"opening_cash": 0}, format="json")
        second = self.client.post("/api/pos/shifts/open/", {"opening_cash": 0}, format="json")
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 400)

    def test_student_cannot_access_pos(self):
        self.client.force_authenticate(self.student)
        response = self.client.get("/api/pos/shifts/current/")
        self.assertEqual(response.status_code, 403)


    def test_cancel_after_qris_verification_requires_manual_refund(self):
        StoreSetting.objects.create(key="checkout", value={"cash_enabled": True, "qris_enabled": True, "qris_image_url": "https://example.test/qris.png", "pickup_enabled": True, "delivery_enabled": False, "delivery_fee": 0})
        self.client.force_authenticate(self.student)
        created = self.client.post("/api/orders/checkout/", {"items": [{"product_id": self.product.pk, "quantity": 1}], "fulfillment": "pickup", "payment_method": "qris"}, format="json")
        code = created.data["code"]
        self.client.force_authenticate(self.admin)
        self.client.post("/api/orders/" + code + "/actions/", {"action": "verify_payment", "note": "Diperiksa"}, format="json")
        self.client.force_authenticate(self.student)
        cancelled = self.client.post("/api/orders/" + code + "/actions/", {"action": "cancel"}, format="json")
        self.assertEqual(cancelled.data["payment"]["status"], Payment.Status.REFUND_PENDING)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 10)

    def test_admin_can_record_manual_qris_refund(self):
        StoreSetting.objects.create(key="checkout", value={"cash_enabled": True, "qris_enabled": True, "qris_image_url": "https://example.test/qris.png", "pickup_enabled": True, "delivery_enabled": False, "delivery_fee": 0})
        self.client.force_authenticate(self.student)
        created = self.client.post("/api/orders/checkout/", {"items": [{"product_id": self.product.pk, "quantity": 1}], "fulfillment": "pickup", "payment_method": "qris"}, format="json")
        code = created.data["code"]
        self.client.force_authenticate(self.admin)
        self.client.post("/api/orders/" + code + "/actions/", {"action": "verify_payment"}, format="json")
        self.client.force_authenticate(self.student)
        self.client.post("/api/orders/" + code + "/actions/", {"action": "cancel"}, format="json")
        self.client.force_authenticate(self.admin)
        refunded = self.client.post("/api/orders/" + code + "/actions/", {"action": "mark_refunded", "note": "Refund dikirim ke pelanggan"}, format="json")
        self.assertEqual(refunded.data["payment"]["status"], Payment.Status.REFUNDED)

    def test_delivery_fee_is_calculated_from_server_setting(self):
        StoreSetting.objects.create(key="checkout", value={"cash_enabled": True, "qris_enabled": False, "pickup_enabled": True, "delivery_enabled": True, "delivery_fee": 7500})
        self.client.force_authenticate(self.student)
        response = self.client.post("/api/orders/checkout/", {"items": [{"product_id": self.product.pk, "quantity": 1}], "fulfillment": "delivery", "delivery_address": "Jl. Sekolah No. 1", "payment_method": "cash"}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["delivery_fee"], 7500)
        self.assertEqual(response.data["total"], 12500)

    def test_expired_qris_command_releases_reserved_stock(self):
        StoreSetting.objects.create(key="checkout", value={"cash_enabled": True, "qris_enabled": True, "qris_image_url": "https://example.test/qris.png", "pickup_enabled": True, "delivery_enabled": False, "delivery_fee": 0})
        self.client.force_authenticate(self.student)
        created = self.client.post("/api/orders/checkout/", {"items": [{"product_id": self.product.pk, "quantity": 2}], "fulfillment": "pickup", "payment_method": "qris"}, format="json")
        order = Order.objects.get(code=created.data["code"])
        order.expires_at = timezone.now() - timedelta(minutes=1)
        order.save(update_fields=("expires_at",))
        call_command("expire_qris_orders", verbosity=0)
        order.refresh_from_db()
        self.product.refresh_from_db()
        self.assertEqual(order.status, Order.Status.EXPIRED)
        self.assertEqual(order.payment.status, Payment.Status.EXPIRED)
        self.assertEqual(self.product.stock, 10)

    def test_delivery_requires_address(self):
        self.client.force_authenticate(self.student)
        response = self.client.post("/api/orders/checkout/", {"items": [{"product_id": self.product.pk, "quantity": 1}], "fulfillment": "delivery", "payment_method": "cash"}, format="json")
        self.assertEqual(response.status_code, 400)
