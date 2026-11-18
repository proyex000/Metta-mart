from rest_framework import generics
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
            current = DEFAULT_STORE_SETTINGS[key]
            if set(value.keys()) - set(current.keys()):
                raise ValidationError({key: "Terdapat kolom pengaturan yang tidak dikenal."})
            merged = {**current, **value}
            if key == "operating_hours":
                if not isinstance(merged["days"], list) or any(day not in {"mon", "tue", "wed", "thu", "fri", "sat", "sun"} for day in merged["days"]):
                    raise ValidationError({key: "Hari operasional tidak valid."})
                for field in ("open_time", "close_time"):
                    if not isinstance(merged[field], str):
                        raise ValidationError({key: "Jam operasional harus berupa teks HH:MM."})
                    if merged[field] and (len(merged[field]) != 5 or merged[field][2] != ":"):
                        raise ValidationError({key: "Gunakan format jam HH:MM."})
            if key == "payment_methods" and any(not isinstance(merged[field], bool) for field in ("cash", "bank_transfer", "qris")):
                raise ValidationError({key: "Status metode pembayaran harus berupa boolean."})
            StoreSetting.objects.update_or_create(key=key, defaults={"value": merged, "updated_by": request.user})
        AuditLog.objects.create(actor=request.user, event="store.settings_updated", target_type="store", metadata={"keys": list(request.data.keys())})
        saved = {item.key: item.value for item in StoreSetting.objects.filter(key__in=DEFAULT_STORE_SETTINGS)}
        return Response({key: saved.get(key, value) for key, value in DEFAULT_STORE_SETTINGS.items()})
