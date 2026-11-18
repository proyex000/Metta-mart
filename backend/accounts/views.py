from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import generics, permissions, status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from .models import User
from .permissions import IsAdminRole
from .serializers import AdminCreateUserSerializer, RegistrationSerializer, UserSerializer
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
    serializer_class = AdminCreateUserSerializer

    def get_serializer_class(self):
        if self.request.method == "GET":
            return UserSerializer
        return AdminCreateUserSerializer

    def perform_create(self, serializer):
        user = serializer.save()
        AuditLog.objects.create(
            actor=self.request.user,
            event="user.created",
            target_type="user",
            target_id=str(user.pk),
            metadata={"role": user.role},
        )
