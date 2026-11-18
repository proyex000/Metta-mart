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
