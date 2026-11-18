from datetime import datetime
from django.utils import timezone
from rest_framework import generics, permissions, status
from accounts.permissions import IsAdminRole
from .models import AuditLog, StoreSetting
from .serializers import AuditLogSerializer, StoreSettingSerializer

class AuditLogListView(generics.ListAPIView):
    permission_classes = [IsAdminRole]
    queryset = AuditLog.objects.select_related("actor").all()
    serializer_class = AuditLogSerializer

class StoreSettingListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAdminRole]
    queryset = StoreSetting.objects.all()
    serializer_class = StoreSettingSerializer

    def perform_create(self, serializer):
        serializer.save(updated_by=self.request.user)

class StoreSettingDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAdminRole]
    queryset = StoreSetting.objects.all()
    serializer_class = StoreSettingSerializer
    lookup_field = "key"

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)


from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import Notification
from rest_framework.views import APIView


DEFAULT_STORE_SETTINGS = {
    "operating_hours": {"days": ["mon", "tue", "wed", "thu", "fri"], "open_time": "", "close_time": ""},
    "payment_methods": {"cash": True, "bank_transfer": True, "qris": True},
    "payment_instructions": {"bank_name": "", "account_name": "", "account_number": "", "qris_note": ""},
    "pickup_instructions": {"message": "Pengambilan dilakukan di koperasi sekolah saat jam operasional setelah pesanan berstatus Siap Diambil."},
}


class StorefrontSettingsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        saved = {item.key: item.value for item in StoreSetting.objects.filter(key__in=DEFAULT_STORE_SETTINGS)}
        return Response({key: saved.get(key, value) for key, value in DEFAULT_STORE_SETTINGS.items()})

    def patch(self, request):
        if request.user.role != "admin":
            return Response({"detail": "Hanya admin yang dapat mengubah pengaturan koperasi."}, status=status.HTTP_403_FORBIDDEN)
        unknown = set(request.data.keys()) - set(DEFAULT_STORE_SETTINGS.keys())
        if unknown:
            raise ValidationError({"settings": "Terdapat bagian pengaturan yang tidak dikenal."})
        for key, value in request.data.items():
            if not isinstance(value, dict):
                raise ValidationError({key: "Nilai pengaturan harus berupa objek."})
            existing = StoreSetting.objects.filter(key=key).first()
            current = existing.value if existing else DEFAULT_STORE_SETTINGS[key]
            if set(value.keys()) - set(DEFAULT_STORE_SETTINGS[key].keys()):
                raise ValidationError({key: "Terdapat kolom pengaturan yang tidak dikenal."})
            merged = {**current, **value}
            if key == "operating_hours":
                if not isinstance(merged["days"], list) or any(day not in {"mon", "tue", "wed", "thu", "fri", "sat", "sun"} for day in merged["days"]):
                    raise ValidationError({key: "Hari operasional tidak valid."})
                for field in ("open_time", "close_time"):
                    if not isinstance(merged[field], str):
                        raise ValidationError({key: "Jam operasional harus berupa teks HH:MM."})
                    if merged[field]:
                        try:
                            datetime.strptime(merged[field], "%H:%M")
                        except (TypeError, ValueError):
                            raise ValidationError({key: "Gunakan format jam HH:MM yang valid."})
                if merged["open_time"] and merged["close_time"] and merged["open_time"] >= merged["close_time"]:
                    raise ValidationError({key: "Jam tutup harus setelah jam buka."})
            if key == "payment_methods" and any(not isinstance(merged[field], bool) for field in ("cash", "bank_transfer", "qris")):
                raise ValidationError({key: "Status metode pembayaran harus berupa boolean."})
            if key == "payment_instructions":
                if any(not isinstance(merged[field], str) for field in ("bank_name", "account_name", "account_number", "qris_note")):
                    raise ValidationError({key: "Instruksi pembayaran harus berupa teks."})
            if key == "pickup_instructions" and not isinstance(merged["message"], str):
                raise ValidationError({key: "Instruksi pengambilan harus berupa teks."})
            StoreSetting.objects.update_or_create(key=key, defaults={"value": merged, "updated_by": request.user})
        AuditLog.objects.create(actor=request.user, event="store.settings_updated", target_type="store", metadata={"keys": list(request.data.keys())})
        saved = {item.key: item.value for item in StoreSetting.objects.filter(key__in=DEFAULT_STORE_SETTINGS)}
        return Response({key: saved.get(key, value) for key, value in DEFAULT_STORE_SETTINGS.items()})

class NotificationListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        rows = Notification.objects.filter(recipient=request.user)[:100]
        return Response([{
            "id": row.id,
            "title": row.title,
            "message": row.message,
            "kind": row.kind,
            "target_code": row.target_code,
            "is_read": row.read_at is not None,
            "created_at": row.created_at,
        } for row in rows])

    def post(self, request):
        if request.user.role != "admin":
            return Response({"detail": "Hanya admin yang dapat mengirim pengumuman."}, status=status.HTTP_403_FORBIDDEN)
        title = str(request.data.get("title", "")).strip()
        message = str(request.data.get("message", "")).strip()
        kind = str(request.data.get("kind", "announcement")).strip()
        if not title or len(title) > 180 or not message or len(message) > 500:
            return Response({"detail": "Judul (1–180 karakter) dan pesan (1–500 karakter) wajib diisi."}, status=status.HTTP_400_BAD_REQUEST)
        from django.contrib.auth import get_user_model
        User = get_user_model()
        recipients = User.objects.filter(is_active=True, role__in=("student", "parent"))
        Notification.objects.bulk_create([
            Notification(recipient=user, title=title, message=message, kind=kind)
            for user in recipients
        ])
        return Response({"sent_to": recipients.count()}, status=status.HTTP_201_CREATED)

class NotificationReadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, notification_id):
        row = Notification.objects.filter(pk=notification_id, recipient=request.user).first()
        if not row:
            return Response({"detail": "Notifikasi tidak ditemukan."}, status=status.HTTP_404_NOT_FOUND)
        if row.read_at is None:
            row.read_at = timezone.now()
            row.save(update_fields=["read_at"])
        return Response({"id": row.id, "is_read": True})
