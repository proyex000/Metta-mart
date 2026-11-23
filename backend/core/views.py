import re
from datetime import datetime
from django.db import transaction
from django.utils import timezone
from rest_framework import generics, permissions, status
from accounts.permissions import IsAdminRole
from commerce.delivery import DEFAULT_DELIVERY_SETTINGS
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


from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import Notification


QRIS_IMAGE_PATTERN = re.compile(r"^data:image/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$")
QRIS_IMAGE_MAX_CHARS = 950_000  # ~700 KB gambar setelah di-encode base64

DEFAULT_STORE_SETTINGS = {
    "operating_hours": {"days": ["mon", "tue", "wed", "thu", "fri"], "open_time": "", "close_time": ""},
    "payment_methods": {"cash": True, "bank_transfer": True, "qris": True},
    "payment_instructions": {"bank_name": "", "account_name": "", "account_number": "", "qris_image": ""},
    "pickup_instructions": {"message": "Pengambilan dilakukan di koperasi sekolah saat jam operasional setelah pesanan berstatus Siap Diambil."},
    "store_profile": {"name": "MettaMart", "description": "Koperasi sekolah", "address": "", "email": "", "phone": ""},
    "notification_preferences": {"order_alerts": True, "low_stock_alerts": True, "announcements_enabled": True},
    "delivery_settings": DEFAULT_DELIVERY_SETTINGS,
}


class StorefrontSettingsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        saved = {item.key: item.value for item in StoreSetting.objects.filter(key__in=DEFAULT_STORE_SETTINGS)}
        # Gabungkan dengan nilai bawaan dan buang kolom usang (mis. qris_note) dari data lama.
        data = {key: {**value, **{k: v for k, v in (saved.get(key) or {}).items() if k in value}} for key, value in DEFAULT_STORE_SETTINGS.items()}
        if request.user.role != "admin":
            data.pop("payment_instructions", None)  # rekening/QRIS hanya tampil di detail pesanan setelah dikonfirmasi
        return Response(data)

    @transaction.atomic
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
                if any(not isinstance(merged[field], str) for field in ("bank_name", "account_name", "account_number", "qris_image")):
                    raise ValidationError({key: "Instruksi pembayaran harus berupa teks."})
                image = merged["qris_image"]
                if image and (not QRIS_IMAGE_PATTERN.match(image) or len(image) > QRIS_IMAGE_MAX_CHARS):
                    raise ValidationError({key: "Gambar QRIS harus berformat PNG, JPG, atau WebP dengan ukuran maksimal sekitar 700 KB."})
            if key == "pickup_instructions" and not isinstance(merged["message"], str):
                raise ValidationError({key: "Instruksi pengambilan harus berupa teks."})
            if key == "store_profile":
                if any(not isinstance(merged[field], str) for field in ("name", "description", "address", "email", "phone")):
                    raise ValidationError({key: "Informasi koperasi harus berupa teks."})
                if not merged["name"].strip() or len(merged["name"]) > 120:
                    raise ValidationError({key: "Nama koperasi wajib diisi dan maksimal 120 karakter."})
            if key == "delivery_settings":
                if not isinstance(merged["enabled"], bool):
                    raise ValidationError({key: "Status pengiriman harus berupa boolean."})
                if not isinstance(merged["origin_address"], str) or len(merged["origin_address"]) > 300:
                    raise ValidationError({key: "Alamat asal pengiriman harus berupa teks maksimal 300 karakter."})
                for field in ("base_fee", "per_km_fee"):
                    if isinstance(merged[field], bool) or not isinstance(merged[field], int) or not 0 <= merged[field] <= 1_000_000:
                        raise ValidationError({key: "Tarif pengiriman harus berupa bilangan bulat Rp0–1.000.000."})
                for field in ("base_distance_km", "max_distance_km"):
                    if isinstance(merged[field], bool) or not isinstance(merged[field], (int, float)) or not 0 < merged[field] <= 100:
                        raise ValidationError({key: "Jarak pengiriman harus berupa angka lebih dari 0 dan maksimal 100 km."})
                if merged["base_distance_km"] > merged["max_distance_km"]:
                    raise ValidationError({key: "Jarak tarif dasar tidak boleh melebihi jangkauan maksimal."})
            if key == "notification_preferences" and any(not isinstance(merged[field], bool) for field in ("order_alerts", "low_stock_alerts", "announcements_enabled")):
                raise ValidationError({key: "Preferensi notifikasi harus berupa boolean."})
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
        preferences = StoreSetting.objects.filter(key="notification_preferences").first()
        if preferences and isinstance(preferences.value, dict) and not preferences.value.get("announcements_enabled", True):
            return Response({"detail": "Pengiriman pengumuman sedang dinonaktifkan."}, status=status.HTTP_400_BAD_REQUEST)
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
