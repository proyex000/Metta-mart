from django.test import TestCase
from rest_framework.test import APIClient
from .models import User

class AuthApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            identifier="admin@mettamart.test",
            password="TestPassword!2026",
            full_name="Admin Test",
            role=User.Role.ADMIN,
            is_staff=True,
        )
        self.student = User.objects.create_user(
            identifier="1234567890",
            password="TestPassword!2026",
            full_name="Siswa Test",
            role=User.Role.STUDENT,
        )

    def test_me_requires_authentication(self):
        response = self.client.get("/api/auth/me/")
        self.assertIn(response.status_code, (401, 403))

    def test_admin_endpoint_rejects_student(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.get("/api/admin/users/")
        self.assertEqual(response.status_code, 403)

    def test_admin_endpoint_allows_admin(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/admin/users/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)

    def test_admin_created_student_and_parent_identifiers_are_validated(self):
        self.client.force_authenticate(user=self.admin)
        invalid_student = self.client.post("/api/admin/users/", {
            "identifier": "12345", "full_name": "Invalid Student",
            "role": "student", "password": "TestPassword!2026",
        }, format="json")
        self.assertEqual(invalid_student.status_code, 400)
        self.assertIn("identifier", invalid_student.data)

        invalid_parent = self.client.post("/api/admin/users/", {
            "identifier": "not-an-email", "full_name": "Invalid Parent",
            "role": "parent", "password": "TestPassword!2026",
        }, format="json")
        self.assertEqual(invalid_parent.status_code, 400)
        self.assertIn("identifier", invalid_parent.data)

        valid_parent = self.client.post("/api/admin/users/", {
            "identifier": "Parent@Example.Test", "full_name": "Valid Parent",
            "role": "parent", "password": "TestPassword!2026",
        }, format="json")
        self.assertEqual(valid_parent.status_code, 201, valid_parent.data)
        parent = User.objects.get(pk=valid_parent.data["id"])
        self.assertEqual(parent.identifier, "parent@example.test")
        self.assertEqual(parent.email, "parent@example.test")

    def test_admin_can_rename_and_deactivate_student(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(f"/api/admin/users/{self.student.pk}/", {
            "full_name": "Nama Siswa Baru",
            "is_active": False,
        }, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.student.refresh_from_db()
        self.assertEqual(self.student.full_name, "Nama Siswa Baru")
        self.assertFalse(self.student.is_active)

    def test_admin_can_change_student_identifier(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(f"/api/admin/users/{self.student.pk}/", {"identifier": "9" * 10}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.student.refresh_from_db()
        self.assertEqual(self.student.identifier, "9" * 10)
        self.assertTrue(self.student.check_password("TestPassword!2026"))

    def test_admin_rejects_invalid_or_duplicate_student_identifier(self):
        other_student = User.objects.create_user(
            identifier="8" * 10, password="TestPassword!2026",
            full_name="Siswa Lain", role=User.Role.STUDENT,
        )
        self.client.force_authenticate(user=self.admin)
        invalid = self.client.patch(f"/api/admin/users/{self.student.pk}/", {"identifier": "12345"}, format="json")
        self.assertEqual(invalid.status_code, 400)
        duplicate = self.client.patch(f"/api/admin/users/{self.student.pk}/", {"identifier": other_student.identifier}, format="json")
        self.assertEqual(duplicate.status_code, 400)
        self.student.refresh_from_db()
        self.assertEqual(self.student.identifier, "1234567890")

    def test_admin_cannot_change_parent_login_identifier(self):
        parent = User.objects.create_user(
            identifier="parent@example.test", password="TestPassword!2026",
            full_name="Parent Test", email="parent@example.test", role=User.Role.PARENT,
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(f"/api/admin/users/{parent.pk}/", {"identifier": "new@example.test"}, format="json")
        self.assertEqual(response.status_code, 400)
        parent.refresh_from_db()
        self.assertEqual(parent.identifier, "parent@example.test")

    def test_student_cannot_update_accounts(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.patch(f"/api/admin/users/{self.student.pk}/", {"is_active": False}, format="json")
        self.assertEqual(response.status_code, 403)
        self.student.refresh_from_db()
        self.assertTrue(self.student.is_active)

    def test_admin_cannot_deactivate_own_account_or_last_admin(self):
        self.client.force_authenticate(user=self.admin)
        self_deactivation = self.client.patch(f"/api/admin/users/{self.admin.pk}/", {"is_active": False}, format="json")
        self.assertEqual(self_deactivation.status_code, 400)
        self.assertTrue(self.admin.is_active)

        last_admin = User.objects.create_user(
            identifier="second-admin@mettamart.test",
            password="TestPassword!2026",
            full_name="Second Admin",
            role=User.Role.ADMIN,
            is_staff=True,
        )
        self.admin.refresh_from_db()
        # First deactivate the second admin, then verify the final active admin is protected.
        self.client.patch(f"/api/admin/users/{last_admin.pk}/", {"is_active": False}, format="json")
        blocked = self.client.patch(f"/api/admin/users/{self.admin.pk}/", {"is_active": False}, format="json")
        self.assertEqual(blocked.status_code, 400)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_active)

    def test_login_requires_csrf_token(self):
        client = APIClient(enforce_csrf_checks=True)
        response = client.post("/api/auth/login/", {
            "identifier": "admin@mettamart.test",
            "password": "TestPassword!2026",
        }, format="json")
        self.assertEqual(response.status_code, 403)

    def test_student_and_parent_are_independent_roles(self):
        self.assertEqual(self.student.role, User.Role.STUDENT)
        parent = User.objects.create_user(
            identifier="parent@example.test",
            password="TestPassword!2026",
            full_name="Parent Test",
            email="parent@example.test",
            role=User.Role.PARENT,
        )
        self.assertEqual(parent.role, User.Role.PARENT)
        self.assertFalse(hasattr(parent, "student_relations"))
        self.assertFalse(hasattr(self.student, "parent_relations"))

    def test_only_admin_can_create_parent_student_link(self):
        parent = User.objects.create_user(identifier="parent-link@example.test", password="TestPassword!2026", full_name="Parent Link", email="parent-link@example.test", role=User.Role.PARENT)
        payload = {"parent_id": parent.id, "student_id": self.student.id}
        self.client.force_authenticate(user=self.student)
        denied = self.client.post("/api/admin/parent-student-links/", payload, format="json")
        self.assertEqual(denied.status_code, 403)
        self.client.force_authenticate(user=self.admin)
        created = self.client.post("/api/admin/parent-student-links/", payload, format="json")
        self.assertEqual(created.status_code, 201)
        listed = self.client.get("/api/admin/parent-student-links/")
        self.assertEqual(len(listed.data), 1)
        duplicate = self.client.post("/api/admin/parent-student-links/", payload, format="json")
        self.assertEqual(duplicate.status_code, 200)
        self.assertEqual(listed.data[0]["student_identifier"], self.student.identifier)


    def test_authenticated_user_can_change_own_password(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.post("/api/auth/change-password/", {
            "current_password": "TestPassword!2026",
            "new_password": "NewSecurePass!2026",
        }, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.student.refresh_from_db()
        self.admin.refresh_from_db()
        self.assertTrue(self.student.check_password("NewSecurePass!2026"))
        self.assertTrue(self.admin.check_password("TestPassword!2026"))

    def test_password_change_rejects_wrong_current_password(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.post("/api/auth/change-password/", {
            "current_password": "wrong-password",
            "new_password": "NewSecurePass!2026",
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.student.refresh_from_db()
        self.assertTrue(self.student.check_password("TestPassword!2026"))

    def test_password_change_rejects_weak_password(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.post("/api/auth/change-password/", {
            "current_password": "TestPassword!2026",
            "new_password": "123",
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.student.refresh_from_db()
        self.assertTrue(self.student.check_password("TestPassword!2026"))


    def test_student_can_read_and_update_only_own_notification_preferences(self):
        parent = User.objects.create_user(
            identifier="parent-preferences@example.test",
            password="TestPassword!2026",
            full_name="Parent Preferences",
            email="parent-preferences@example.test",
            role=User.Role.PARENT,
        )
        self.client.force_authenticate(user=self.student)
        initial = self.client.get("/api/auth/notification-preferences/")
        self.assertEqual(initial.status_code, 200)
        self.assertTrue(initial.data["order_updates"])
        self.assertTrue(initial.data["stock_updates"])
        self.assertTrue(initial.data["promotions"])
        self.assertFalse(initial.data["weekly_summary"])

        updated = self.client.patch("/api/auth/notification-preferences/", {
            "order_updates": False,
            "promotions": False,
        }, format="json")
        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertFalse(updated.data["order_updates"])
        self.assertFalse(updated.data["promotions"])

        self.client.force_authenticate(user=parent)
        parent_preferences = self.client.get("/api/auth/notification-preferences/")
        self.assertEqual(parent_preferences.status_code, 200)
        self.assertTrue(parent_preferences.data["order_updates"])
        self.assertTrue(parent_preferences.data["promotions"])
        self.assertTrue(parent_preferences.data["weekly_summary"])

    def test_student_cannot_update_parent_only_weekly_summary(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.patch("/api/auth/notification-preferences/", {
            "weekly_summary": False,
        }, format="json")
        self.assertEqual(response.status_code, 400)

    def test_admin_cannot_use_customer_notification_preferences(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/auth/notification-preferences/")
        self.assertEqual(response.status_code, 403)
