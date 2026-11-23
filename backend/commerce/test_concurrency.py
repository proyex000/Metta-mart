import threading
from concurrent.futures import ThreadPoolExecutor

from django.db import close_old_connections
from django.test import TransactionTestCase, skipUnlessDBFeature
from rest_framework.test import APIClient

from accounts.models import User
from .models import InventoryMovement, Order, Product


@skipUnlessDBFeature("has_select_for_update")
class ConcurrentCheckoutTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.customers = [
            User.objects.create_user(
                identifier=f"student-concurrency-{index}",
                password="TestPassword!2026",
                full_name=f"Student {index}",
                role=User.Role.STUDENT,
            )
            for index in range(2)
        ]
        self.product = Product.objects.create(
            name="Stok Terbatas",
            category="buku",
            price=5000,
            stock=1,
        )

    def test_two_customers_cannot_buy_the_last_unit_concurrently(self):
        barrier = threading.Barrier(2)

        def checkout(customer):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(user=customer)
                barrier.wait(timeout=10)
                response = client.post(
                    "/api/orders/",
                    {
                        "payment_method": "cash",
                        "items": [{"product_id": self.product.pk, "quantity": 1}],
                    },
                    format="json",
                )
                return response.status_code, response.data
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(checkout, customer) for customer in self.customers]
            results = [future.result(timeout=30) for future in futures]

        statuses = sorted(status for status, _ in results)
        self.assertEqual(statuses, [201, 400], results)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 0)
        self.assertEqual(Order.objects.filter(sales_channel="online").count(), 1)
        self.assertEqual(InventoryMovement.objects.filter(reason="order_reserved").count(), 1)
