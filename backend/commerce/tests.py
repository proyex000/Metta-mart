import base64
import io
from unittest import mock
from PIL import Image
from django.test import TestCase
from rest_framework.test import APIClient
from accounts.models import User
from core.models import AuditLog, Notification, StoreSetting
from .models import InventoryMovement, Order, PaymentEvent, Product
from .serializers import OrderReadSerializer


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
        }, format="json", HTTP_IDEMPOTENCY_KEY=f"test-order-{Order.objects.count() + 1:08d}")

    def test_qris_image_is_excluded_from_order_lists_and_included_in_order_detail(self):
        qris_image = "data:image/png;base64,QUJDRA=="
        StoreSetting.objects.create(key="payment_instructions", value={
            "bank_name": "BCA",
            "account_name": "MettaMart",
            "account_number": "123",
            "qris_image": qris_image,
        })
        self.client.force_authenticate(user=self.student)
        created = self.create_order("qris")
        code = created.data["code"]
        self.client.force_authenticate(user=self.admin)
        self.client.post(f"/api/admin/orders/{code}/accept/", {}, format="json")

        self.client.force_authenticate(user=self.student)
        listed = self.client.get("/api/orders/")
        self.assertIsNone(next(row for row in listed.data if row["code"] == code)["payment_info"])

        detail = self.client.get(f"/api/orders/{code}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["payment_info"]["qris_image"], qris_image)

        self.client.force_authenticate(user=self.admin)
        admin_list = self.client.get("/api/admin/orders/")
        self.assertIsNone(next(row for row in admin_list.data if row["code"] == code)["payment_info"])

    def test_order_lists_do_not_query_or_repeat_payment_instructions(self):
        StoreSetting.objects.create(
            key="payment_instructions",
            value={"bank_name": "BCA", "account_name": "MettaMart", "account_number": "123", "qris_image": ""},
        )
        for _ in range(3):
            Order.objects.create(
                customer=self.student,
                payment_method=Order.PaymentMethod.BANK_TRANSFER,
                payment_status=Order.PaymentStatus.UNPAID,
                status=Order.Status.ACCEPTED,
                subtotal=10000,
                total=10000,
            )
        orders = list(Order.objects.select_related("customer", "beneficiary").prefetch_related("items").all())
        with self.assertNumQueries(0):
            data = OrderReadSerializer(orders, many=True, context={}).data
        self.assertEqual(len(data), 3)
        self.assertTrue(all(row["payment_info"] is None for row in data))

    def make_product_image_data(self, color=(40, 120, 80)):
        image_buffer = io.BytesIO()
        Image.new("RGB", (24, 24), color).save(image_buffer, format="JPEG", quality=85)
        encoded = base64.b64encode(image_buffer.getvalue()).decode("ascii")
        return f"data:image/jpeg;base64,{encoded}"

    def test_product_image_is_saved_as_base64_text_and_returned_by_api(self):
        self.client.force_authenticate(user=self.admin)
        image_data = self.make_product_image_data()
        response = self.client.post("/api/products/", {
            "name": "Foto Produk",
            "category": "buku",
            "price": 5000,
            "stock": 2,
            "image": image_data,
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["image_url"], image_data)
        product = Product.objects.get(pk=response.data["id"])
        self.assertEqual(product.image, image_data)
        self.assertIsInstance(product.image, str)

    def test_product_image_can_be_replaced_and_removed_without_filesystem_storage(self):
        self.client.force_authenticate(user=self.admin)
        first_image = self.make_product_image_data((40, 120, 80))
        second_image = self.make_product_image_data((120, 60, 40))
        product = Product.objects.create(name="Foto", category="buku", price=1000, stock=0, image=first_image)

        replaced = self.client.patch(f"/api/products/{product.id}/", {"image": second_image}, format="json")
        self.assertEqual(replaced.status_code, 200, replaced.data)
        product.refresh_from_db()
        self.assertEqual(product.image, second_image)
        self.assertEqual(replaced.data["image_url"], second_image)

        removed = self.client.patch(f"/api/products/{product.id}/", {"remove_image": True}, format="json")
        self.assertEqual(removed.status_code, 200, removed.data)
        product.refresh_from_db()
        self.assertIsNone(product.image)
        self.assertIsNone(removed.data["image_url"])

    def test_product_image_rejects_invalid_or_unsupported_data_urls(self):
        self.client.force_authenticate(user=self.admin)
        for invalid_image in (
            "data:image/svg+xml;base64,PHN2Zz4=",
            "data:image/jpeg;base64,not-valid-base64!",
            "https://example.invalid/product.jpg",
        ):
            response = self.client.post("/api/products/", {
                "name": "Gambar Tidak Valid",
                "category": "buku",
                "price": 1000,
                "stock": 0,
                "image": invalid_image,
            }, format="json")
            self.assertEqual(response.status_code, 400, invalid_image[:40])

    def test_legacy_product_image_paths_keep_their_media_url(self):
        product = Product.objects.create(
            name="Foto Lama", category="buku", price=1000, stock=0,
            image="product_images/legacy.jpg",
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(f"/api/products/{product.id}/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["image_url"], f"http://testserver/media/product_images/legacy.jpg")

    def test_product_creation_rolls_back_if_initial_stock_movement_fails(self):
        self.client.force_authenticate(user=self.admin)
        self.client.raise_request_exception = False
        with mock.patch("commerce.views.InventoryMovement.objects.create", side_effect=RuntimeError("ledger unavailable")):
            response = self.client.post("/api/products/", {
                "name": "Produk gagal",
                "category": "buku",
                "price": 1000,
                "stock": 3,
            }, format="json")
        self.assertEqual(response.status_code, 500)
        self.assertFalse(Product.objects.filter(name="Produk gagal").exists())
        self.assertFalse(InventoryMovement.objects.filter(reason="initial_stock").exists())

    def test_online_checkout_rolls_back_if_order_notification_fails(self):
        self.client.force_authenticate(user=self.student)
        self.client.raise_request_exception = False
        with mock.patch("commerce.views.notify_admins", side_effect=RuntimeError("notification unavailable")):
            response = self.client.post("/api/orders/", {
                "payment_method": "cash",
                "items": [{"product_id": self.product.id, "quantity": 2}],
            }, format="json", HTTP_IDEMPOTENCY_KEY="rollback-order-0001")
        self.assertEqual(response.status_code, 500)
        self.assertFalse(Order.objects.filter(customer=self.student).exists())
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 10)
        self.assertFalse(InventoryMovement.objects.filter(reason="order_reserved").exists())

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

    def test_payment_rejection_requires_reason_and_notifies_customer_with_it(self):
        self.client.force_authenticate(user=self.student)
        created = self.create_order("bank_transfer")
        code = created.data["code"]

        self.client.force_authenticate(user=self.admin)
        self.client.post(f"/api/admin/orders/{code}/accept/", {}, format="json")
        self.client.force_authenticate(user=self.student)
        self.client.post(
            f"/api/orders/{code}/payment-submission/",
            {"sender_name": "Nama Pengirim", "payment_source": "BCA"},
            format="json",
        )

        self.client.force_authenticate(user=self.admin)
        missing_reason = self.client.post(f"/api/admin/orders/{code}/payment/reject/", {}, format="json")
        self.assertEqual(missing_reason.status_code, 400)
        self.assertIn("note", missing_reason.data)

        rejected = self.client.post(
            f"/api/admin/orders/{code}/payment/reject/",
            {"note": "Nama pengirim tidak sesuai mutasi rekening."},
            format="json",
        )
        self.assertEqual(rejected.status_code, 200, rejected.data)
        self.assertEqual(rejected.data["payment_status"], Order.PaymentStatus.FAILED)
        event = PaymentEvent.objects.get(order__code=code, event="reject")
        self.assertIn("tidak sesuai", event.note)
        notice = Notification.objects.filter(recipient=self.student, target_code=code, kind="payment").latest("created_at")
        self.assertIn("Nama pengirim tidak sesuai", notice.message)

    def test_bank_transfer_requires_manual_verification_before_pickup(self):
        from django.utils import timezone
        day_codes = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
        today = day_codes[timezone.localtime().weekday()]
        StoreSetting.objects.create(key="operating_hours", value={"days": [today], "open_time": "00:00", "close_time": "23:59"})
        response = self.create_order("bank_transfer")
        self.assertEqual(response.status_code, 201)
        code = response.data["code"]
        self.client.force_authenticate(user=self.student)
        early = self.client.post(f"/api/orders/{code}/payment-submission/", {"sender_name": "Nama Pengirim", "payment_source": "BCA"}, format="json")
        self.assertEqual(early.status_code, 400)  # belum dikonfirmasi admin
        self.client.force_authenticate(user=self.admin)
        self.client.post(f"/api/admin/orders/{code}/accept/", {}, format="json")
        self.client.force_authenticate(user=self.student)
        submitted = self.client.post(f"/api/orders/{code}/payment-submission/", {"sender_name": "Nama Pengirim", "payment_source": "BCA", "account_last4": "1234", "note": "Transfer pukul 10.00"}, format="json")
        self.assertEqual(submitted.status_code, 200)
        self.assertEqual(submitted.data["payment_status"], Order.PaymentStatus.PENDING)
        self.assertEqual(submitted.data["payment_sender_name"], "Nama Pengirim")
        self.assertEqual(submitted.data["payment_source"], "BCA")
        self.assertEqual(submitted.data["payment_account_last4"], "1234")
        self.client.force_authenticate(user=self.admin)
        self.client.post(f"/api/admin/orders/{code}/ready/", {}, format="json")
        blocked = self.client.post(f"/api/admin/orders/{code}/complete-pickup/", {}, format="json")
        self.assertEqual(blocked.status_code, 400)
        verified = self.client.post(f"/api/admin/orders/{code}/payment/verify/", {"note": "Cocok dengan mutasi rekening"}, format="json")
        self.assertEqual(verified.status_code, 200)
        self.assertEqual(verified.data["payment_status"], Order.PaymentStatus.PAID)
        completed = self.client.post(f"/api/admin/orders/{code}/complete-pickup/", {}, format="json")
        self.assertEqual(completed.status_code, 200, completed.data)

    def test_transfer_identity_validates_required_fields_and_last_four(self):
        created = self.create_order("bank_transfer")
        code = created.data["code"]
        self.client.force_authenticate(user=self.admin)
        self.client.post(f"/api/admin/orders/{code}/accept/", {}, format="json")
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
        response = self.client.post("/api/orders/", {"payment_method": "cash", "items": [{"product_id": self.product.id, "quantity": 1}]}, format="json", HTTP_IDEMPOTENCY_KEY="parent-order-0001")
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
        }, format="json", HTTP_IDEMPOTENCY_KEY="pos-sale-test-0001")
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

    def test_pos_checkout_rejects_missing_idempotency_key(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post("/api/admin/pos/checkout/", {
            "payment_method": "cash", "cash_received": 20000,
            "items": [{"product_id": self.product.id, "quantity": 1}],
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("idempotency_key", response.data)
        self.assertEqual(Order.objects.count(), 0)

    def test_pos_checkout_retry_with_same_idempotency_key_does_not_duplicate_sale(self):
        self.client.force_authenticate(user=self.admin)
        payload = {"payment_method": "cash", "cash_received": 20000, "items": [{"product_id": self.product.id, "quantity": 3}]}
        first = self.client.post("/api/admin/pos/checkout/", payload, format="json", HTTP_IDEMPOTENCY_KEY="pos-checkout-retry-0001")
        replay = self.client.post("/api/admin/pos/checkout/", payload, format="json", HTTP_IDEMPOTENCY_KEY="pos-checkout-retry-0001")
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(replay.status_code, 200, replay.data)
        self.assertEqual(first.data["code"], replay.data["code"])
        self.assertEqual(Order.objects.filter(sales_channel="pos").count(), 1)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 7)
        self.assertEqual(InventoryMovement.objects.filter(reason="pos_sale", reference=first.data["code"]).count(), 1)

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
            return self.client.post("/api/orders/", self.payload(**overrides), format="json", HTTP_IDEMPOTENCY_KEY=f"delivery-order-{Order.objects.count() + 1:08d}")

    def test_quote_uses_confirmed_school_pin_when_origin_geocoding_fails(self):
        from unittest import mock
        self.client.force_authenticate(user=self.student)
        with mock.patch("commerce.delivery.geocode", side_effect=[None, (0.5085725, 101.4245111)]):
            response = self.client.post(
                "/api/delivery/quote/",
                {"address": "Jl. Tujuan No. 1, Pekanbaru"},
                format="json",
            )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["distance_km"], "1.4")
        self.assertEqual(response.data["fee"], 10000)

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
        response = self.client.post("/api/orders/", {"payment_method": "cash", "items": [{"product_id": self.product.id, "quantity": 1}]}, format="json", HTTP_IDEMPOTENCY_KEY="pickup-outside-hours-0001")
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

    def test_unknown_address_uses_manual_fee_fallback(self):
        from unittest import mock
        self.client.force_authenticate(user=self.student)
        with mock.patch("commerce.delivery.geocode", side_effect=lambda address: (-6.20, 106.80) if "Sudirman" in address else None):
            response = self.client.post("/api/orders/", self.payload(), format="json", HTTP_IDEMPOTENCY_KEY="unknown-address-0001")
        self.assertEqual(response.status_code, 201, response.data)
        order = Order.objects.get(code=response.data["code"])
        self.assertFalse(order.delivery_fee_confirmed)
        self.assertIsNone(order.delivery_distance_km)
        self.assertEqual(order.delivery_fee, 0)
        self.assertEqual(order.total, order.subtotal)

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


class CustomerCancelAndPaymentInfoTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(identifier="admin-cancel", password="TestPassword!2026", full_name="Admin", role=User.Role.ADMIN, is_staff=True)
        self.student = User.objects.create_user(identifier="1234567811", password="TestPassword!2026", full_name="Student", role=User.Role.STUDENT)
        self.other = User.objects.create_user(identifier="1234567822", password="TestPassword!2026", full_name="Other", role=User.Role.STUDENT)
        self.product = Product.objects.create(name="Pensil", category="alat", price=3000, stock=10)
        StoreSetting.objects.create(key="payment_instructions", value={"bank_name": "BCA", "account_name": "Koperasi Metta", "account_number": "1234567890", "qris_image": "data:image/png;base64,iVBORw0KGgo="})

    def order(self, method="bank_transfer"):
        self.client.force_authenticate(user=self.student)
        response = self.client.post("/api/orders/", {"payment_method": method, "items": [{"product_id": self.product.id, "quantity": 2}]}, format="json", HTTP_IDEMPOTENCY_KEY=f"cancel-order-{Order.objects.count() + 1:08d}")
        self.assertEqual(response.status_code, 201, response.data)
        return response.data["code"]

    def admin_do(self, code, path):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(f"/api/admin/orders/{code}/{path}/", {}, format="json")
        self.client.force_authenticate(user=self.student)
        return response

    def test_checkout_rejects_missing_idempotency_key(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.post("/api/orders/", {"payment_method": "cash", "items": [{"product_id": self.product.id, "quantity": 1}]}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("idempotency_key", response.data)
        self.assertEqual(Order.objects.count(), 0)

    def test_checkout_idempotency_replays_the_same_order_without_reserving_stock_twice(self):
        self.client.force_authenticate(user=self.student)
        payload = {"payment_method": "cash", "items": [{"product_id": self.product.id, "quantity": 2}]}
        first = self.client.post("/api/orders/", payload, format="json", HTTP_IDEMPOTENCY_KEY="online-order-retry-0001")
        replay = self.client.post("/api/orders/", payload, format="json", HTTP_IDEMPOTENCY_KEY="online-order-retry-0001")
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(replay.status_code, 200, replay.data)
        self.assertEqual(first.data["code"], replay.data["code"])
        self.assertEqual(Order.objects.filter(customer=self.student).count(), 1)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 8)
        self.assertEqual(InventoryMovement.objects.filter(reason="order_reserved", reference=first.data["code"]).count(), 1)

    def test_idempotency_key_cannot_be_reused_for_a_different_cart(self):
        self.client.force_authenticate(user=self.student)
        key = "online-order-retry-0002"
        first = self.client.post("/api/orders/", {"payment_method": "cash", "items": [{"product_id": self.product.id, "quantity": 1}]}, format="json", HTTP_IDEMPOTENCY_KEY=key)
        changed = self.client.post("/api/orders/", {"payment_method": "cash", "items": [{"product_id": self.product.id, "quantity": 3}]}, format="json", HTTP_IDEMPOTENCY_KEY=key)
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(changed.status_code, 400)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 9)

    def test_payment_info_hidden_until_admin_confirms_and_hidden_again_when_paid(self):
        code = self.order("bank_transfer")
        pending = self.client.get(f"/api/orders/{code}/")
        self.assertIsNone(pending.data["payment_info"])
        self.assertEqual(self.admin_do(code, "accept").status_code, 200)
        confirmed = self.client.get(f"/api/orders/{code}/")
        self.assertEqual(confirmed.data["payment_info"]["account_number"], "1234567890")
        self.assertEqual(confirmed.data["payment_info"]["bank_name"], "BCA")
        Order.objects.filter(code=code).update(payment_status="paid")
        self.assertIsNone(self.client.get(f"/api/orders/{code}/").data["payment_info"])

    def test_qris_shows_image_and_cash_never_shows_payment_info(self):
        qris = self.order("qris")
        self.admin_do(qris, "accept")
        info = self.client.get(f"/api/orders/{qris}/").data["payment_info"]
        self.assertEqual(info["qris_image"], "data:image/png;base64,iVBORw0KGgo=")
        self.assertEqual(info["account_number"], "")
        cash = self.order("cash")
        self.admin_do(cash, "accept")
        self.assertIsNone(self.client.get(f"/api/orders/{cash}/").data["payment_info"])

    def test_storefront_settings_do_not_leak_payment_instructions_to_customers(self):
        self.client.force_authenticate(user=self.student)
        self.assertNotIn("payment_instructions", self.client.get("/api/storefront/settings/").data)
        self.client.force_authenticate(user=self.admin)
        self.assertEqual(self.client.get("/api/storefront/settings/").data["payment_instructions"]["bank_name"], "BCA")

    def test_customer_can_cancel_before_paying_and_stock_is_restored(self):
        code = self.order("bank_transfer")
        self.assertTrue(self.client.get(f"/api/orders/{code}/").data["can_cancel"])
        response = self.client.post(f"/api/orders/{code}/cancel/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["status"], "cancelled")
        self.assertFalse(response.data["can_cancel"])
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 10)
        self.assertEqual(InventoryMovement.objects.filter(reason="order_cancelled", reference=code).count(), 1)
        self.assertEqual(self.client.post(f"/api/orders/{code}/cancel/").status_code, 400)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 10)

    def test_customer_can_cancel_after_confirmation_if_not_paid(self):
        code = self.order("qris")
        self.admin_do(code, "accept")
        self.assertEqual(self.client.post(f"/api/orders/{code}/cancel/").status_code, 200)

    def test_customer_cannot_cancel_once_payment_submitted_or_paid(self):
        code = self.order("bank_transfer")
        self.admin_do(code, "accept")
        self.client.post(f"/api/orders/{code}/payment-submission/", {"sender_name": "A", "payment_source": "BCA"}, format="json")
        blocked = self.client.post(f"/api/orders/{code}/cancel/")
        self.assertEqual(blocked.status_code, 400)
        self.assertFalse(self.client.get(f"/api/orders/{code}/").data["can_cancel"])
        Order.objects.filter(code=code).update(payment_status="paid")
        self.assertEqual(self.client.post(f"/api/orders/{code}/cancel/").status_code, 400)
        self.assertEqual(Order.objects.get(code=code).status, "accepted")
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 8)

    def test_admin_cannot_cancel_order_while_payment_is_pending_verification(self):
        code = self.order("bank_transfer")
        self.admin_do(code, "accept")
        self.client.post(f"/api/orders/{code}/payment-submission/", {"sender_name": "A", "payment_source": "BCA"}, format="json")
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(f"/api/admin/orders/{code}/cancel/", {}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Order.objects.get(code=code).status, "accepted")
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 8)
        self.assertFalse(InventoryMovement.objects.filter(reason="order_cancelled", reference=code).exists())

    def test_admin_cannot_cancel_paid_order(self):
        code = self.order("bank_transfer")
        Order.objects.filter(code=code).update(payment_status="paid")
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(f"/api/admin/orders/{code}/cancel/", {}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Order.objects.get(code=code).status, "pending")
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 8)

    def test_admin_can_cancel_ready_order_when_payment_is_not_submitted(self):
        code = self.order("bank_transfer")
        self.admin_do(code, "accept")
        self.admin_do(code, "ready")
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(f"/api/admin/orders/{code}/cancel/", {}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["status"], "cancelled")
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 10)

    def test_customer_cannot_cancel_completed_or_someone_elses_order(self):
        code = self.order("cash")
        self.client.force_authenticate(user=self.other)
        self.assertEqual(self.client.post(f"/api/orders/{code}/cancel/").status_code, 404)
        Order.objects.filter(code=code).update(status="completed")
        self.client.force_authenticate(user=self.student)
        self.assertEqual(self.client.post(f"/api/orders/{code}/cancel/").status_code, 400)

    def test_cancel_notifies_admin(self):
        code = self.order("cash")
        self.client.post(f"/api/orders/{code}/cancel/")
        self.assertTrue(self.admin.notifications.filter(title="Pesanan dibatalkan pelanggan", target_code=code).exists())

    def test_qris_image_setting_is_validated_and_hidden_from_customers_until_order_confirmed(self):
        self.client.force_authenticate(user=self.admin)
        ok = self.client.patch("/api/storefront/settings/", {"payment_instructions": {"qris_image": "data:image/png;base64,AAAA"}}, format="json")
        self.assertEqual(ok.status_code, 200, ok.data)
        self.assertEqual(ok.data["payment_instructions"]["qris_image"], "data:image/png;base64,AAAA")
        for bad in ("http://evil.example/qr.png", "data:image/svg+xml;base64,AAAA", "data:text/html;base64,AAAA", "javascript:alert(1)", "data:image/png;base64," + "A" * 1_000_000):
            response = self.client.patch("/api/storefront/settings/", {"payment_instructions": {"qris_image": bad}}, format="json")
            self.assertEqual(response.status_code, 400, bad[:30])
        cleared = self.client.patch("/api/storefront/settings/", {"payment_instructions": {"qris_image": ""}}, format="json")
        self.assertEqual(cleared.status_code, 200)
        self.client.force_authenticate(user=self.student)
        self.assertNotIn("payment_instructions", self.client.get("/api/storefront/settings/").data)

    def test_legacy_qris_note_is_dropped_from_settings_response(self):
        StoreSetting.objects.filter(key="payment_instructions").update(value={"bank_name": "BCA", "account_name": "K", "account_number": "1", "qris_note": "lama"})
        self.client.force_authenticate(user=self.admin)
        data = self.client.get("/api/storefront/settings/").data["payment_instructions"]
        self.assertNotIn("qris_note", data)
        self.assertEqual(data["qris_image"], "")
