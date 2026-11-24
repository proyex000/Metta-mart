from datetime import timedelta
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from accounts.models import User
from commerce.delivery import _reserve_nominatim_slot, quote_delivery
from commerce.models import InventoryMovement, Order, OrderItem, Product
from core.models import AuditLog, Notification, StoreSetting


class OrderPolicyTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.student = User.objects.create_user(
            identifier="policy-student",
            password="TestPassword!2026",
            full_name="Policy Student",
            role=User.Role.STUDENT,
        )
        self.admin = User.objects.create_user(
            identifier="policy-admin",
            password="TestPassword!2026",
            full_name="Policy Admin",
            role=User.Role.ADMIN,
            is_staff=True,
        )
        self.product = Product.objects.create(
            name="Buku Kebijakan",
            category="buku",
            price=5000,
            stock=100,
        )
        self.client.force_authenticate(user=self.student)

    def create_checkout(self, key="policy-order-0001"):
        return self.client.post(
            "/api/orders/",
            {
                "payment_method": "cash",
                "items": [{"product_id": self.product.pk, "quantity": 1}],
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=key,
        )

    def create_order_record(self, *, payment_status=Order.PaymentStatus.UNPAID, created_at=None, status=Order.Status.PENDING):
        order = Order.objects.create(
            customer=self.student,
            payment_method=Order.PaymentMethod.CASH,
            payment_status=payment_status,
            status=status,
            subtotal=10000,
            total=10000,
        )
        if created_at:
            Order.objects.filter(pk=order.pk).update(created_at=created_at)
            order.refresh_from_db()
        return order

    def test_session_authenticated_checkout_supports_lazy_request_user(self):
        # SessionAuthentication leaves request.user as Django's SimpleLazyObject.
        session_client = APIClient()
        self.assertTrue(
            session_client.login(
                identifier="policy-student",
                password="TestPassword!2026",
            )
        )
        response = session_client.post(
            "/api/orders/",
            {
                "payment_method": "cash",
                "items": [{"product_id": self.product.pk, "quantity": 1}],
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY="simple-lazy-user-order",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["customer_name"], "Policy Student")

    def test_default_policy_limits_five_active_orders(self):
        for _ in range(5):
            self.create_order_record()
        response = self.create_checkout()
        self.assertEqual(response.status_code, 400)
        self.assertIn("pesanan aktif", str(response.data).lower())

    def test_zero_active_limit_means_unlimited(self):
        StoreSetting.objects.create(
            key="order_policy",
            value={"max_active_orders_per_account": 0, "auto_cancel_unpaid_after_hours": 0},
        )
        for _ in range(6):
            self.create_order_record()
        response = self.create_checkout()
        self.assertEqual(response.status_code, 201, response.data)

    def test_hard_limit_rejects_more_than_twenty_orders_per_hour(self):
        recent = timezone.now() - timedelta(minutes=30)
        for _ in range(20):
            self.create_order_record(created_at=recent, status=Order.Status.CANCELLED)
        response = self.create_checkout()
        self.assertEqual(response.status_code, 400)
        self.assertIn("20 pesanan", str(response.data))

    def test_checkout_cleans_up_this_customers_stale_order(self):
        StoreSetting.objects.create(
            key="order_policy",
            value={"max_active_orders_per_account": 5, "auto_cancel_unpaid_after_hours": 1},
        )
        self.product.stock = 98
        self.product.save(update_fields=["stock"])
        stale = self.create_order_record(created_at=timezone.now() - timedelta(hours=2))
        OrderItem.objects.create(
            order=stale,
            product=self.product,
            product_name=self.product.name,
            unit_price=5000,
            quantity=2,
            line_total=10000,
        )

        response = self.create_checkout("policy-order-0002")
        self.assertEqual(response.status_code, 201, response.data)
        stale.refresh_from_db()
        self.assertEqual(stale.status, Order.Status.CANCELLED)
        self.assertTrue(Notification.objects.filter(recipient=self.student, target_code=stale.code).exists())
        self.assertEqual(InventoryMovement.objects.filter(reason="order_cancelled", reference=stale.code).count(), 1)

    def test_management_command_restores_stock_and_is_idempotent(self):
        StoreSetting.objects.create(
            key="order_policy",
            value={"max_active_orders_per_account": 5, "auto_cancel_unpaid_after_hours": 2},
        )
        self.product.stock = 3
        self.product.save(update_fields=["stock"])
        stale = self.create_order_record(created_at=timezone.now() - timedelta(hours=3))
        OrderItem.objects.create(
            order=stale,
            product=self.product,
            product_name=self.product.name,
            unit_price=5000,
            quantity=2,
            line_total=10000,
        )

        output = StringIO()
        call_command("cancel_stale_orders", stdout=output)
        stale.refresh_from_db()
        self.product.refresh_from_db()
        self.assertEqual(stale.status, Order.Status.CANCELLED)
        self.assertEqual(self.product.stock, 5)
        self.assertEqual(InventoryMovement.objects.filter(reason="order_cancelled", reference=stale.code).count(), 1)
        self.assertTrue(AuditLog.objects.filter(event="order.auto_cancel_stale", target_id=str(stale.pk)).exists())
        self.assertTrue(Notification.objects.filter(recipient=self.student, target_code=stale.code).exists())

        call_command("cancel_stale_orders", stdout=StringIO())
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 5)
        self.assertEqual(InventoryMovement.objects.filter(reason="order_cancelled", reference=stale.code).count(), 1)

    def test_paid_and_pending_verification_orders_are_never_auto_cancelled(self):
        StoreSetting.objects.create(
            key="order_policy",
            value={"max_active_orders_per_account": 5, "auto_cancel_unpaid_after_hours": 1},
        )
        stale_time = timezone.now() - timedelta(hours=3)
        paid = self.create_order_record(payment_status=Order.PaymentStatus.PAID, created_at=stale_time)
        verifying = self.create_order_record(payment_status=Order.PaymentStatus.PENDING, created_at=stale_time)
        call_command("cancel_stale_orders", stdout=StringIO())
        paid.refresh_from_db()
        verifying.refresh_from_db()
        self.assertEqual(paid.status, Order.Status.PENDING)
        self.assertEqual(verifying.status, Order.Status.PENDING)

    def test_auto_cancel_is_disabled_by_default(self):
        stale = self.create_order_record(created_at=timezone.now() - timedelta(days=5))
        call_command("cancel_stale_orders", stdout=StringIO())
        stale.refresh_from_db()
        self.assertEqual(stale.status, Order.Status.PENDING)

    def test_manual_delivery_fee_must_be_set_before_acceptance_and_payment(self):
        now = timezone.localtime()
        day_codes = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
        StoreSetting.objects.create(
            key="operating_hours",
            value={"days": list(day_codes), "open_time": "00:00", "close_time": "23:59"},
        )
        with mock.patch(
            "commerce.serializers.quote_delivery",
            return_value={
                "distance_km": None,
                "fee": 0,
                "manual_review": True,
                "message": "Alamat perlu diperiksa admin.",
            },
        ):
            created = self.client.post(
                "/api/orders/",
                {
                    "payment_method": "bank_transfer",
                    "delivery_method": "gosend",
                    "delivery_address": "Jalan Merdeka, Pekanbaru, Riau",
                    "delivery_recipient": "Penerima",
                    "delivery_phone": "081234567890",
                    "items": [{"product_id": self.product.pk, "quantity": 2}],
                },
                format="json",
                HTTP_IDEMPOTENCY_KEY="policy-manual-fee-01",
            )
        self.assertEqual(created.status_code, 201, created.data)
        code = created.data["code"]
        self.assertFalse(created.data["delivery_fee_confirmed"])
        self.assertEqual(created.data["total"], 10000)

        self.client.force_authenticate(user=self.admin)
        blocked = self.client.post(f"/api/admin/orders/{code}/accept/", {}, format="json")
        self.assertEqual(blocked.status_code, 400)

        fee = self.client.post(
            f"/api/admin/orders/{code}/delivery-fee/",
            {"delivery_fee": 7000},
            format="json",
        )
        self.assertEqual(fee.status_code, 200, fee.data)
        self.assertTrue(fee.data["delivery_fee_confirmed"])
        self.assertEqual(fee.data["total"], 17000)
        self.assertTrue(Notification.objects.filter(recipient=self.student, target_code=code).exists())

        accepted = self.client.post(f"/api/admin/orders/{code}/accept/", {}, format="json")
        self.assertEqual(accepted.status_code, 200, accepted.data)

    def test_nominatim_request_slot_uses_a_database_shared_lock_record(self):
        before = timezone.now().timestamp()
        _reserve_nominatim_slot()
        slot = StoreSetting.objects.get(key="nominatim_request_slot")
        self.assertGreater(float(slot.value["next_request_at"]), before)

    def test_delivery_quote_falls_back_to_manual_review_when_map_fails(self):
        with mock.patch(
            "commerce.delivery.geocode",
            side_effect=ValidationError({"delivery_address": "Map service unavailable"}),
        ):
            quote = quote_delivery("Jalan Merdeka, Pekanbaru, Riau")
        self.assertTrue(quote["manual_review"])
        self.assertIsNone(quote["distance_km"])
        self.assertEqual(quote["fee"], 0)


class OptionalPaginationAndHealthTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            identifier="pagination-admin",
            password="TestPassword!2026",
            full_name="Pagination Admin",
            role=User.Role.ADMIN,
            is_staff=True,
        )
        self.student = User.objects.create_user(
            identifier="pagination-student",
            password="TestPassword!2026",
            full_name="Pagination Student",
            role=User.Role.STUDENT,
        )
        self.product = Product.objects.create(name="Produk", category="buku", price=1000, stock=10)

    def test_health_endpoint_is_public_and_checks_database(self):
        response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"status": "ok", "database": "ok"})

    def test_products_keep_array_shape_without_opt_in_and_paginate_when_requested(self):
        self.client.force_authenticate(user=self.student)
        legacy = self.client.get("/api/products/")
        self.assertEqual(legacy.status_code, 200)
        self.assertIsInstance(legacy.data, list)

        paged = self.client.get("/api/products/?page=1&page_size=1")
        self.assertEqual(paged.status_code, 200)
        self.assertEqual(paged.data["count"], 1)
        self.assertEqual(len(paged.data["results"]), 1)

    def test_audit_history_is_capped_without_opt_in(self):
        self.client.force_authenticate(user=self.admin)
        AuditLog.objects.bulk_create([
            AuditLog(
                actor=self.admin,
                event="test.event",
                target_type="test",
                target_id=str(index),
                metadata={},
            )
            for index in range(205)
        ])
        legacy = self.client.get("/api/admin/audit-logs/")
        self.assertEqual(legacy.status_code, 200)
        self.assertIsInstance(legacy.data, list)
        self.assertEqual(len(legacy.data), 200)

        paged = self.client.get("/api/admin/audit-logs/?page=1&page_size=30")
        self.assertEqual(paged.status_code, 200)
        self.assertEqual(paged.data["count"], 205)
        self.assertEqual(len(paged.data["results"]), 30)

    def test_inventory_history_is_capped_without_opt_in(self):
        self.client.force_authenticate(user=self.admin)
        InventoryMovement.objects.bulk_create([
            InventoryMovement(
                product=self.product,
                quantity_delta=1,
                reason="manual_adjustment",
                reference=f"test-{index}",
            )
            for index in range(205)
        ])
        legacy = self.client.get("/api/admin/inventory-movements/")
        self.assertEqual(legacy.status_code, 200)
        self.assertIsInstance(legacy.data, list)
        self.assertEqual(len(legacy.data), 200)

        paged = self.client.get("/api/admin/inventory-movements/?page=1&page_size=50")
        self.assertEqual(paged.status_code, 200)
        self.assertEqual(paged.data["count"], 205)
        self.assertEqual(len(paged.data["results"]), 50)

