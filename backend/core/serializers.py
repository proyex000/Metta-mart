from rest_framework import serializers
from .models import AuditLog, StoreSetting

class AuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.full_name", read_only=True, default=None)

    class Meta:
        model = AuditLog
        fields = ("id", "actor", "actor_name", "event", "target_type", "target_id", "metadata", "created_at")
        read_only_fields = fields

class StoreSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = StoreSetting
        fields = ("key", "value", "updated_at")
        read_only_fields = ("updated_at",)
