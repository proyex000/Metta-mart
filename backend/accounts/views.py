from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import generics, permissions, status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import ValidationError
from rest_framework.throttling import ScopedRateThrottle
from .models import ParentStudentLink, User
from .permissions import IsAdminRole
from .serializers import AdminCreateUserSerializer, AdminUserUpdateSerializer, RegistrationSerializer, UserSerializer
from core.models import AuditLog

@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({"csrfToken": get_token(request)})

@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        identifier = str(request.data.get("identifier", "")).strip()
        if "@" in identifier:
            identifier = identifier.lower()
        password = request.data.get("password", "")
        if not identifier or not isinstance(password, str):
            raise AuthenticationFailed("Identitas atau password tidak valid.")
        user = authenticate(request, identifier=identifier, password=password)
        if user is None or not user.is_active:
            raise AuthenticationFailed("Identitas atau password tidak valid.")
        login(request, user)
        AuditLog.objects.create(actor=user, event="auth.login", target_type="user", target_id=str(user.pk))
        return Response({"user": UserSerializer(user).data})

class LogoutView(APIView):
    def post(self, request):
        user = request.user
        AuditLog.objects.create(actor=user, event="auth.logout", target_type="user", target_id=str(user.pk))
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)

class ChangePasswordView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_change"

    def post(self, request):
        current_password = request.data.get("current_password", "")
        new_password = request.data.get("new_password", "")
        if not isinstance(current_password, str) or not isinstance(new_password, str) or not current_password or not new_password:
            raise ValidationError({"detail": "Password lama dan password baru wajib diisi."})
        user = request.user
        if not user.check_password(current_password):
            raise ValidationError({"current_password": "Password lama tidak sesuai."})
        if current_password == new_password:
            raise ValidationError({"new_password": "Password baru harus berbeda dari password lama."})
        try:
            validate_password(new_password, user=user)
        except DjangoValidationError as exc:
            raise ValidationError({"new_password": list(exc.messages)})
        user.set_password(new_password)
        user.save(update_fields=["password"])
        update_session_auth_hash(request, user)
        AuditLog.objects.create(actor=user, event="user.password_changed", target_type="user", target_id=str(user.pk))
        return Response({"detail": "Password berhasil diperbarui."})


class MeView(APIView):
    def get(self, request):
        return Response({"user": UserSerializer(request.user).data})

    def patch(self, request):
        from .serializers import ProfileUpdateSerializer
        serializer = ProfileUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        AuditLog.objects.create(actor=request.user, event="user.profile_updated", target_type="user", target_id=str(request.user.pk))
        return Response({"user": UserSerializer(request.user).data})

@method_decorator(csrf_protect, name="dispatch")
class RegisterView(generics.GenericAPIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    serializer_class = RegistrationSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "register"

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        login(request, user)
        AuditLog.objects.create(actor=user, event="auth.register", target_type="user", target_id=str(user.pk))
        return Response({"user": UserSerializer(user).data}, status=status.HTTP_201_CREATED)

class AdminUserListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAdminRole]
    queryset = User.objects.all().order_by("full_name")

    def get_serializer_class(self):
        if self.request.method == "GET":
            return UserSerializer
        return AdminCreateUserSerializer

    def perform_create(self, serializer):
        user = serializer.save()
        AuditLog.objects.create(actor=self.request.user, event="user.created", target_type="user", target_id=str(user.pk), metadata={"role": user.role})


class AdminUserDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAdminRole]
    queryset = User.objects.all()
    serializer_class = AdminUserUpdateSerializer
    http_method_names = ["get", "patch", "put", "head", "options"]

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        # Lock the target row and active admin rows so concurrent requests cannot
        # accidentally deactivate the final active administrator.
        self.queryset = User.objects.select_for_update()
        return super().update(request, *args, **kwargs)

    def perform_update(self, serializer):
        target = serializer.instance
        was_active = target.is_active
        will_be_active = serializer.validated_data.get("is_active", was_active)
        if target.pk == self.request.user.pk and was_active and not will_be_active:
            raise ValidationError({"is_active": "Admin tidak dapat menonaktifkan akunnya sendiri."})
        if target.role == User.Role.ADMIN and was_active and not will_be_active:
            active_admins = User.objects.select_for_update().filter(role=User.Role.ADMIN, is_active=True)
            if active_admins.count() <= 1:
                raise ValidationError({"is_active": "Minimal harus ada satu akun admin aktif."})
        user = serializer.save()
        event = "user.deactivated" if was_active and not user.is_active else "user.updated"
        AuditLog.objects.create(
            actor=self.request.user,
            event=event,
            target_type="user",
            target_id=str(user.pk),
            metadata={"role": user.role, "is_active": user.is_active},
        )

class ParentChildrenView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.role != User.Role.PARENT:
            return Response({"detail": "Fitur ini hanya tersedia untuk akun orang tua."}, status=status.HTTP_403_FORBIDDEN)
        links = ParentStudentLink.objects.filter(parent=request.user).select_related("student")
        return Response([{
            "id": link.student_id,
            "identifier": link.student.identifier,
            "full_name": link.student.full_name,
        } for link in links])


class AdminParentStudentLinkView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        links = ParentStudentLink.objects.select_related("parent", "student")
        return Response([{
            "id": link.id,
            "parent_id": link.parent_id,
            "parent_name": link.parent.full_name,
            "parent_identifier": link.parent.identifier,
            "student_id": link.student_id,
            "student_name": link.student.full_name,
            "student_identifier": link.student.identifier,
        } for link in links])

    def post(self, request):
        try:
            parent_id = int(request.data.get("parent_id"))
            student_id = int(request.data.get("student_id"))
        except (TypeError, ValueError):
            raise ValidationError({"detail": "ID akun orang tua dan siswa harus valid."})
        parent = User.objects.filter(pk=parent_id, role=User.Role.PARENT, is_active=True).first()
        student = User.objects.filter(pk=student_id, role=User.Role.STUDENT, is_active=True).first()
        if not parent or not student:
            raise ValidationError({"detail": "Akun orang tua atau siswa tidak ditemukan/ tidak aktif."})
        link, created = ParentStudentLink.objects.get_or_create(parent=parent, student=student)
        AuditLog.objects.create(actor=request.user, event="family.link_created", target_type="parent_student_link", target_id=str(link.pk), metadata={"parent_id": parent.pk, "student_id": student.pk})
        return Response({"id": link.id, "created": created}, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def delete(self, request):
        try:
            link_id = int(request.data.get("link_id"))
        except (TypeError, ValueError):
            raise ValidationError({"detail": "ID relasi harus valid."})
        link = ParentStudentLink.objects.filter(pk=link_id).first()
        if not link:
            return Response({"detail": "Relasi tidak ditemukan."}, status=status.HTTP_404_NOT_FOUND)
        AuditLog.objects.create(actor=request.user, event="family.link_deleted", target_type="parent_student_link", target_id=str(link.pk), metadata={"parent_id": link.parent_id, "student_id": link.student_id})
        link.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
