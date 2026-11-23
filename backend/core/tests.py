from django.test import TestCase
from rest_framework.test import APIClient
from accounts.models import User
from .models import AuditLog, StoreSetting


class StorefrontSettingsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            identifier="admin-settings",
            password="TestPassword!2026",
            full_name="Admin Settings",
            role=User.Role.ADMIN,
            is_staff=True,
        )
        self.student = User.objects.create_user(
            identifier="1234567890",
            password="TestPassword!2026",
            full_name="Student Settings",
            role=User.Role.STUDENT,
        )

    def test_authenticated_users_can_read_storefront_settings(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.get("/api/storefront/settings/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("operating_hours", response.data)
        self.assertIn("payment_methods", response.data)
        self.assertIn("store_profile", response.data)
        self.assertIn("notification_preferences", response.data)

    def test_only_admin_can_update_store_profile_and_notification_preferences(self):
        payload = {
            "store_profile": {
                "name": "Koperasi Sekolah",
                "description": "Kebutuhan siswa",
                "address": "Area sekolah",
                "email": "koperasi@example.test",
                "phone": "081234567890",
            },
            "notification_preferences": {
                "order_alerts": False,
                "low_stock_alerts": True,
                "announcements_enabled": False,
            },
        }
        self.client.force_authenticate(user=self.student)
        denied = self.client.patch("/api/storefront/settings/", payload, format="json")
        self.assertEqual(denied.status_code, 403)

        self.client.force_authenticate(user=self.admin)
        saved = self.client.patch("/api/storefront/settings/", payload, format="json")
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(saved.data["store_profile"]["name"], "Koperasi Sekolah")
        self.assertFalse(saved.data["notification_preferences"]["order_alerts"])
        self.assertFalse(saved.data["notification_preferences"]["announcements_enabled"])
        self.assertEqual(StoreSetting.objects.get(key="store_profile").updated_by, self.admin)

    def test_invalid_operating_hours_are_rejected(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch("/api/storefront/settings/", {
            "operating_hours": {"days": ["monday"], "open_time": "08:00", "close_time": "17:00"},
        }, format="json")
        self.assertEqual(response.status_code, 400)

    def test_multi_section_patch_is_atomic_when_later_section_is_invalid(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch("/api/storefront/settings/", {
            "store_profile": {
                "name": "Perubahan Tidak Boleh Tersimpan",
                "description": "Uji transaksi",
                "address": "",
                "email": "",
                "phone": "",
            },
            "payment_methods": {
                "cash": "false",
            },
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(StoreSetting.objects.filter(key="store_profile").exists())
        self.assertFalse(StoreSetting.objects.filter(key="payment_methods").exists())
        self.assertFalse(AuditLog.objects.filter(event="store.settings_updated").exists())

    def test_admin_announcement_respects_notification_preference(self):
        StoreSetting.objects.create(key="notification_preferences", value={
            "order_alerts": True,
            "low_stock_alerts": True,
            "announcements_enabled": False,
        })
        self.client.force_authenticate(user=self.admin)
        response = self.client.post("/api/notifications/", {
            "title": "Pengumuman",
            "message": "Informasi koperasi",
        }, format="json")
        self.assertEqual(response.status_code, 400)
