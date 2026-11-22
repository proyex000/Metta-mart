from django.test import TestCase
from rest_framework.test import APIClient
from accounts.models import User
from core.models import StoreSetting
from .models import InventoryMovement, Order, Product


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
        movement = InventoryMovement.objects.get(reason="order_reserved")
        self.assertEqual(movement.quantity_delta, -2)

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
        self.assertEqual(InventoryMovement.objects.filter(reason="order_cancelled", reference=code).count(), 1)
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
        submitted = self.client.post(f"/api/orders/{code}/payment-submission/", {"sender_name": "Nama Pengirim", "payment_source": "BCA", "account_last4": "1234", "note": "Transfer pukul 10.00"}, format="json")
        self.assertEqual(submitted.status_code, 200)
        self.assertEqual(submitted.data["payment_status"], Order.PaymentStatus.PENDING)
        self.assertEqual(submitted.data["payment_sender_name"], "Nama Pengirim")
        self.assertEqual(submitted.data["payment_source"], "BCA")
        self.assertEqual(submitted.data["payment_account_last4"], "1234")
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

    def test_transfer_identity_validates_required_fields_and_last_four(self):
        created = self.create_order("bank_transfer")
        code = created.data["code"]
        self.client.force_authenticate(user=self.student)
        missing = self.client.post(f"/api/orders/{code}/payment-submission/", {"sender_name": "A"}, format="json")
        self.assertEqual(missing.status_code, 400)
        invalid = self.client.post(f"/api/orders/{code}/payment-submission/", {
            "sender_name": "A", "payment_source": "BCA", "account_last4": "12X4"
        }, format="json")
        self.assertEqual(invalid.status_code, 400)
    def test_disabled_payment_method_is_rejected_by_backend(self):
        StoreSetting.objects.create(key="payment_methods", value={"cash": True, "bank_transfer": False, "qris": True})
        response = self.create_order("bank_transfer")
        self.assertEqual(response.status_code, 400)

    def test_ordering_is_not_blocked_by_empty_operating_hours(self):
        StoreSetting.objects.create(key="operating_hours", value={"days": [], "open_time": "", "close_time": ""})
        response = self.create_order("cash")
        self.assertEqual(response.status_code, 201)

    def test_sales_report_is_admin_only_and_uses_completed_paid_orders(self):
        from django.utils import timezone
        day_codes = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
        today = day_codes[timezone.localtime().weekday()]
        StoreSetting.objects.create(key="operating_hours", value={"days": [today], "open_time": "00:00", "close_time": "23:59"})
        created = self.create_order("cash")
        code = created.data["code"]
        self.client.force_authenticate(user=self.admin)
        self.client.post(f"/api/admin/orders/{code}/accept/", {}, format="json")
        self.client.post(f"/api/admin/orders/{code}/ready/", {}, format="json")
        completed = self.client.post(f"/api/admin/orders/{code}/complete-pickup/", {}, format="json")
        self.assertEqual(completed.status_code, 200)

        self.client.force_authenticate(user=self.student)
        denied = self.client.get("/api/admin/reports/summary/")
        self.assertEqual(denied.status_code, 403)

        self.client.force_authenticate(user=self.admin)
        report = self.client.get("/api/admin/reports/summary/")
        self.assertEqual(report.status_code, 200)
        self.assertEqual(report.data["today"]["revenue"], 10000)
        self.assertEqual(report.data["month"]["orders"], 1)
        self.assertEqual(report.data["month"]["average_order"], 10000)
        self.assertEqual(len(report.data["daily"]), 7)

    def test_admin_dashboard_is_role_protected_and_returns_live_counts(self):
        self.create_order("cash")
        self.client.force_authenticate(user=self.student)
        denied = self.client.get("/api/admin/dashboard/")
        self.assertEqual(denied.status_code, 403)

        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/admin/dashboard/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["products"], 1)
        self.assertEqual(response.data["orders_pending"], 1)
        self.assertEqual(response.data["customers"], 2)
        self.assertEqual(response.data["low_stock"], [{"id": self.product.id, "name": "Buku Tulis", "stock": 8}])
        self.assertEqual(len(response.data["daily"]), 7)
        self.assertEqual(response.data["recent_orders"][0]["code"], Order.objects.latest("created_at").code)

    def test_order_creation_notifies_admin_and_order_updates_notify_customer(self):
        from core.models import Notification
        created = self.create_order("cash")
        code = created.data["code"]
        admin_notice = Notification.objects.get(recipient=self.admin, target_code=code)
        self.assertIn("Pesanan baru", admin_notice.title)

        self.client.force_authenticate(user=self.admin)
        self.client.post(f"/api/admin/orders/{code}/accept/", {}, format="json")
        customer_notice = Notification.objects.get(recipient=self.student, target_code=code)
        self.assertEqual(customer_notice.title, "Pesanan sedang diproses")

    def test_notification_read_is_limited_to_recipient(self):
        from core.models import Notification
        notice = Notification.objects.create(recipient=self.student, title="Tes", message="Tes")
        self.client.force_authenticate(user=self.other_student)
        denied = self.client.post(f"/api/notifications/{notice.id}/read/", {}, format="json")
        self.assertEqual(denied.status_code, 404)
        self.client.force_authenticate(user=self.student)
        read = self.client.post(f"/api/notifications/{notice.id}/read/", {}, format="json")
        self.assertEqual(read.status_code, 200)
        notice.refresh_from_db()
        self.assertIsNotNone(notice.read_at)

    def test_admin_can_broadcast_announcement_to_students_and_parents_only(self):
        from core.models import Notification
        self.client.force_authenticate(user=self.admin)
        response = self.client.post("/api/notifications/", {"title": "Info koperasi", "message": "Jam buka berubah."}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["sent_to"], 2)
        self.assertEqual(Notification.objects.filter(title="Info koperasi").count(), 2)

    def test_parent_can_order_independently_without_student_link(self):
        parent = User.objects.create_user(identifier="parent@example.com", password="TestPassword!2026", full_name="Parent", role=User.Role.PARENT, email="parent@example.com")
        self.client.force_authenticate(user=parent)
        response = self.client.post("/api/orders/", {"payment_method": "cash", "items": [{"product_id": self.product.id, "quantity": 1}]}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertIsNone(response.data["beneficiary_name"])
    def test_parent_children_endpoint_returns_only_verified_links(self):
        from accounts.models import ParentStudentLink, User
        parent = User.objects.create_user(identifier="parent2@example.com", password="TestPassword!2026", full_name="Parent 2", role=User.Role.PARENT, email="parent2@example.com")
        ParentStudentLink.objects.create(parent=parent, student=self.student)
        self.client.force_authenticate(user=parent)
        response = self.client.get("/api/parent/children/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["id"] for row in response.data], [self.student.id])

    def test_admin_pos_creates_paid_completed_sale_and_reduces_stock_without_pickup_hours(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post("/api/admin/pos/checkout/", {
            "payment_method": "cash",
            "cash_received": 20000,
            "items": [{"product_id": self.product.id, "quantity": 3}],
        }, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["status"], Order.Status.COMPLETED)
        self.assertEqual(response.data["payment_status"], Order.PaymentStatus.PAID)
        self.assertEqual(response.data["sales_channel"], "pos")
        self.assertEqual(response.data["customer_name"], "Penjualan POS")
        self.assertEqual(response.data["cash_received"], 20000)
        self.assertEqual(response.data["change_due"], 5000)
        self.assertEqual(InventoryMovement.objects.get(reason="pos_sale").quantity_delta, -3)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 7)

    def test_delete_product_with_inventory_history_archives_instead_of_raising_500(self):
        self.client.force_authenticate(user=self.admin)
        InventoryMovement.objects.create(product=self.product, actor=self.admin, quantity_delta=10, reason="initial_stock", reference="initial")
        response = self.client.delete(f"/api/products/{self.product.id}/")
        self.assertEqual(response.status_code, 204)
        self.product.refresh_from_db()
        self.assertFalse(self.product.is_active)
        self.assertEqual(InventoryMovement.objects.filter(product=self.product).count(), 1)

    def test_student_cannot_use_admin_pos(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.post("/api/admin/pos/checkout/", {
            "payment_method": "cash",
            "items": [{"product_id": self.product.id, "quantity": 1}],
        }, format="json")
        self.assertEqual(response.status_code, 403)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 10)

    def test_manual_stock_adjustment_requires_and_records_reason(self):
        self.client.force_authenticate(user=self.admin)
        missing_reason = self.client.patch(f"/api/products/{self.product.id}/", {"stock": 12}, format="json")
        self.assertEqual(missing_reason.status_code, 400)
        adjusted = self.client.patch(f"/api/products/{self.product.id}/", {"stock": 12, "stock_note": "Barang masuk dari pemasok"}, format="json")
        self.assertEqual(adjusted.status_code, 200)
        movement = InventoryMovement.objects.get(product=self.product, reason="manual_adjustment")
        self.assertEqual(movement.quantity_delta, 2)
        self.assertEqual(movement.reference, "Barang masuk dari pemasok")

    def test_delete_product_with_stock_history_archives_instead_of_crashing(self):
        self.client.force_authenticate(user=self.admin)
        created = self.client.post("/api/products/", {"name": "Pensil", "category": "alat-tulis", "price": 2000, "stock": 5}, format="json")
        self.assertEqual(created.status_code, 201)
        product_id = created.data["id"]
        self.assertTrue(InventoryMovement.objects.filter(product_id=product_id).exists())
        response = self.client.delete(f"/api/products/{product_id}/")
        self.assertEqual(response.status_code, 204)
        archived = Product.objects.get(pk=product_id)
        self.assertFalse(archived.is_active)
        self.assertTrue(InventoryMovement.objects.filter(product_id=product_id).exists())

    def test_delete_product_without_history_is_removed(self):
        self.client.force_authenticate(user=self.admin)
        clean = Product.objects.create(name="Penghapus", category="alat-tulis", price=1000, stock=0)
        response = self.client.delete(f"/api/products/{clean.id}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Product.objects.filter(pk=clean.id).exists())


class DeliveryTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(identifier="admin-delivery", password="TestPassword!2026", full_name="Admin", role=User.Role.ADMIN, is_staff=True)
        self.student = User.objects.create_user(identifier="1234567800", password="TestPassword!2026", full_name="Student", role=User.Role.STUDENT)
        self.product = Product.objects.create(name="Buku Tulis", category="buku", price=5000, stock=10)
        StoreSetting.objects.create(key="operating_hours", value={"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "open_time": "00:00", "close_time": "23:59"})
        StoreSetting.objects.create(key="store_profile", value={"name": "MettaMart", "description": "", "address": "Jl. Sudirman No. 1, Jakarta", "email": "", "phone": ""})
        from django.core.cache import cache
        cache.clear()

    def payload(self, **overrides):
        data = {
            "payment_method": "qris",
            "delivery_method": "gosend",
            "delivery_address": "Jl. Melati No. 5, Menteng, Jakarta Pusat",
            "delivery_recipient": "Budi",
            "delivery_phone": "0812-3456-7890",
            "items": [{"product_id": self.product.id, "quantity": 2}],
        }
        data.update(overrides)
        return data

    def fake_points(self, destination=(-6.20, 106.90)):
        # koperasi di (-6.20, 106.80); tujuan ~11,1 km garis lurus -> ~14,4 km jalan
        origin = (-6.20, 106.80)
        return lambda address: origin if "Sudirman" in address else destination

    def post_order(self, **overrides):
        from unittest import mock
        self.client.force_authenticate(user=self.student)
        with mock.patch("commerce.delivery.geocode", side_effect=self.fake_points(overrides.pop("destination", (-6.20, 106.82)))):
            return self.client.post("/api/orders/", self.payload(**overrides), format="json")

    def test_gosend_order_stores_address_and_adds_server_calculated_fee(self):
        response = self.post_order()
        self.assertEqual(response.status_code, 201, response.data)
        order = Order.objects.get(code=response.data["code"])
        self.assertEqual(order.delivery_method, "gosend")
        self.assertEqual(order.delivery_address, "Jl. Melati No. 5, Menteng, Jakarta Pusat")
        self.assertEqual(order.delivery_phone, "081234567890")
        # ~2,2 km x 1,3 = 2,9 km -> dalam tarif dasar 3 km
        self.assertEqual(order.delivery_fee, 10000)
        self.assertEqual(order.subtotal, 10000)
        self.assertEqual(order.total, 20000)

    def test_fee_grows_per_extra_km_and_ignores_client_supplied_fee(self):
        response = self.post_order(destination=(-6.20, 106.86), delivery_fee=1)
        self.assertEqual(response.status_code, 201, response.data)
        order = Order.objects.get(code=response.data["code"])
        # 6,6 km x 1,3 = 8,6 km -> 6 km tambahan x 2500 + 10000
        self.assertEqual(float(order.delivery_distance_km), 8.6)
        self.assertEqual(order.delivery_fee, 10000 + 6 * 2500)

    def test_gosend_is_rejected_outside_operating_hours(self):
        StoreSetting.objects.filter(key="operating_hours").update(value={"days": [], "open_time": "08:00", "close_time": "15:00"})
        response = self.post_order()
        self.assertEqual(response.status_code, 400)
        self.assertIn("delivery_method", response.data)
        self.assertEqual(Order.objects.count(), 0)

    def test_pickup_order_is_still_allowed_outside_operating_hours(self):
        StoreSetting.objects.filter(key="operating_hours").update(value={"days": [], "open_time": "", "close_time": ""})
        self.client.force_authenticate(user=self.student)
        response = self.client.post("/api/orders/", {"payment_method": "cash", "items": [{"product_id": self.product.id, "quantity": 1}]}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["delivery_method"], "pickup")
        self.assertEqual(response.data["delivery_fee"], 0)

    def test_gosend_rejects_cash_missing_recipient_and_out_of_range_address(self):
        self.assertEqual(self.post_order(payment_method="cash").status_code, 400)
        self.assertEqual(self.post_order(delivery_recipient="").status_code, 400)
        self.assertEqual(self.post_order(delivery_phone="123").status_code, 400)
        far = self.post_order(destination=(-6.20, 107.30))
        self.assertEqual(far.status_code, 400)
        self.assertIn("delivery_address", far.data)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 10)

    def test_unknown_address_is_rejected(self):
        from unittest import mock
        self.client.force_authenticate(user=self.student)
        with mock.patch("commerce.delivery.geocode", side_effect=lambda address: (-6.20, 106.80) if "Sudirman" in address else None):
            response = self.client.post("/api/orders/", self.payload(), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("delivery_address", response.data)

    def test_quote_endpoint_returns_estimate_for_customers_only(self):
        from unittest import mock
        self.client.force_authenticate(user=self.student)
        with mock.patch("commerce.delivery.geocode", side_effect=self.fake_points((-6.20, 106.86))):
            response = self.client.post("/api/delivery/quote/", {"address": "Jl. Melati No. 5, Menteng, Jakarta"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["fee"], 25000)
        self.assertEqual(response.data["distance_km"], "8.6")
        self.client.force_authenticate(user=self.admin)
        self.assertEqual(self.client.post("/api/delivery/quote/", {"address": "x" * 20}, format="json").status_code, 403)

    def test_disabled_delivery_is_rejected(self):
        StoreSetting.objects.create(key="delivery_settings", value={"enabled": False})
        self.assertEqual(self.post_order().status_code, 400)

    def test_admin_sees_address_and_revenue_excludes_delivery_fee(self):
        response = self.post_order()
        code = response.data["code"]
        self.client.force_authenticate(user=self.admin)
        listing = self.client.get("/api/admin/orders/")
        row = next(item for item in listing.data if item["code"] == code)
        self.assertEqual(row["delivery_address"], "Jl. Melati No. 5, Menteng, Jakarta Pusat")
        self.assertEqual(row["delivery_recipient"], "Budi")
        for action in ("accept", "ready"):
            self.assertEqual(self.client.post(f"/api/admin/orders/{code}/{action}/").status_code, 200)
        self.client.post(f"/api/admin/orders/{code}/payment/verify/")
        order = Order.objects.get(code=code)
        order.payment_status = "paid"
        order.save()
        self.assertEqual(self.client.post(f"/api/admin/orders/{code}/complete-pickup/").status_code, 200)
        report = self.client.get("/api/admin/reports/summary/")
        self.assertEqual(report.data["today"]["revenue"], 10000)
        notice = self.student.notifications.filter(kind="order", title="Pesanan sudah diantar").exists()
        self.assertTrue(notice)

    def test_delivery_settings_validation_and_default_exposed(self):
        self.client.force_authenticate(user=self.admin)
        current = self.client.get("/api/storefront/settings/")
        self.assertEqual(current.data["delivery_settings"]["base_fee"], 10000)
        bad = self.client.patch("/api/storefront/settings/", {"delivery_settings": {"base_fee": -1}}, format="json")
        self.assertEqual(bad.status_code, 400)
        good = self.client.patch("/api/storefront/settings/", {"delivery_settings": {"base_fee": 12000, "origin_address": "Jl. Sudirman No. 1, Jakarta"}}, format="json")
        self.assertEqual(good.status_code, 200)
        self.assertEqual(good.data["delivery_settings"]["base_fee"], 12000)

    def test_geocode_falls_back_to_second_provider_and_reports_when_all_fail(self):
        from unittest import mock
        from rest_framework.exceptions import ValidationError
        from commerce import delivery
        with mock.patch.object(delivery, "PROVIDERS", (("a", mock.Mock(side_effect=OSError("down"))), ("b", mock.Mock(return_value=(-6.2, 106.8))))):
            self.assertEqual(delivery.geocode("Jl. Cadangan No. 1, Jakarta"), (-6.2, 106.8))
        with mock.patch.object(delivery, "PROVIDERS", (("a", mock.Mock(side_effect=OSError("down"))), ("b", mock.Mock(side_effect=ValueError("bad"))))):
            with self.assertRaises(ValidationError):
                delivery.geocode("Jl. Gagal Semua No. 2, Jakarta")
            # selama jeda singkat, layanan peta tidak dihubungi lagi
            probe = mock.Mock(return_value=(1.0, 1.0))
            with mock.patch.object(delivery, "PROVIDERS", (("c", probe),)):
                with self.assertRaises(ValidationError):
                    delivery.geocode("Jl. Lain No. 9, Jakarta")
            probe.assert_not_called()
        from django.core.cache import cache
        cache.clear()
        with mock.patch.object(delivery, "PROVIDERS", (("a", mock.Mock(return_value=None)), ("b", mock.Mock(return_value=None)))):
            self.assertIsNone(delivery.geocode("Jl. Tidak Ada No. 3"))

    def test_address_is_cleaned_into_progressively_broader_queries(self):
        from commerce.delivery import address_variants
        self.assertEqual(
            address_variants("Jl. Angkasa No.28E, Air Hitam, Kec. Payung Sekaki, Kota Pekanbaru, Riau 28292"),
            ["Jalan Angkasa, Air Hitam, Payung Sekaki, Kota Pekanbaru, Riau", "Air Hitam, Payung Sekaki, Kota Pekanbaru, Riau", "Payung Sekaki, Kota Pekanbaru, Riau"],
        )
        self.assertEqual(address_variants("Jl. Melati 5, Menteng, Jakarta"), ["Jalan Melati 5, Menteng, Jakarta"])
        self.assertEqual(address_variants(" , "), [])

    def test_not_found_result_is_cached_so_repeated_clicks_do_not_hit_the_map_service(self):
        from unittest import mock
        from commerce import delivery
        provider = mock.Mock(return_value=None)
        with mock.patch.object(delivery, "PROVIDERS", (("a", provider),)):
            self.assertIsNone(delivery.geocode("Jl. Hantu No. 1, Kota Antah"))
            calls = provider.call_count
            self.assertIsNone(delivery.geocode("Jl. Hantu No. 1, Kota Antah"))
        self.assertEqual(provider.call_count, calls)
