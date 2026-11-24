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
