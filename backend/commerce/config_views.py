from datetime import datetime
from django.db import transaction
from rest_framework import permissions
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from accounts.permissions import IsAdminRole
from core.models import StoreSetting


DEFAULT_CONFIG = {
    "cash_enabled": True,
    "bank_transfer_enabled": True,
    "bank_name": "",
    "bank_account_name": "",
    "bank_account_number": "",
    "qris_enabled": False,
    "qris_image_url": "",
    "pickup_enabled": True,
    "operating_days": ["mon", "tue", "wed", "thu", "fri"],
    "opening_time": "",
    "closing_time": "",
    "pickup_instructions": "Ambil pesanan di koperasi saat jam operasional setelah status pesanan Siap diambil.",
}


def current_config():
    setting = StoreSetting.objects.filter(key="checkout").first()
    value = setting.value if setting and isinstance(setting.value, dict) else {}
    config = {**DEFAULT_CONFIG, **{key: value[key] for key in DEFAULT_CONFIG if key in value}}
    for key in ("qris_image_url", "bank_name", "bank_account_name", "bank_account_number", "pickup_instructions"):
        config[key] = str(config[key] or "")
    config["qris_enabled"] = bool(config["qris_enabled"] and config["qris_image_url"])
    config["bank_transfer_enabled"] = bool(config["bank_transfer_enabled"] and config["bank_account_number"])
    return config


class CheckoutConfigView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(current_config())


class CheckoutConfigAdminView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        return Response(current_config())

    def patch(self, request):
        config = current_config()
        for key in ("cash_enabled", "bank_transfer_enabled", "qris_enabled", "pickup_enabled"):
            if key in request.data:
                if not isinstance(request.data[key], bool):
                    raise ValidationError({key: "Nilai harus berupa true atau false."})
                config[key] = request.data[key]
        for key in ("bank_name", "bank_account_name", "bank_account_number", "qris_image_url", "pickup_instructions"):
            if key in request.data:
                value = str(request.data[key]).strip()
                if len(value) > (500 if key == "pickup_instructions" else 120):
                    raise ValidationError({key: "Teks terlalu panjang."})
                config[key] = value
        if "operating_days" in request.data:
            days = request.data["operating_days"]
            allowed = {"mon", "tue", "wed", "thu", "fri", "sat", "sun"}
            if not isinstance(days, list) or any(day not in allowed for day in days) or len(days) != len(set(days)):
                raise ValidationError({"operating_days": "Daftar hari operasional tidak valid."})
            config["operating_days"] = days
        for key in ("opening_time", "closing_time"):
            if key in request.data:
                value = str(request.data[key]).strip()
                if value:
                    try:
                        datetime.strptime(value, "%H:%M")
                    except ValueError:
                        raise ValidationError({key: "Gunakan format jam HH:MM yang valid."})
                config[key] = value
        if bool(config["opening_time"]) != bool(config["closing_time"]):
            raise ValidationError({"opening_time": "Jam buka dan jam tutup harus diisi bersamaan."})
        if config["opening_time"] and config["opening_time"] >= config["closing_time"]:
            raise ValidationError({"closing_time": "Jam tutup harus setelah jam buka."})
        if config["qris_enabled"] and not config["qris_image_url"]:
            raise ValidationError({"qris_image_url": "Masukkan URL QRIS resmi sebelum mengaktifkan QRIS."})
        if config["bank_transfer_enabled"] and not config["bank_account_number"]:
            raise ValidationError({"bank_account_number": "Masukkan nomor rekening resmi sebelum mengaktifkan transfer bank."})
        with transaction.atomic():
            StoreSetting.objects.update_or_create(key="checkout", defaults={"value": config, "updated_by": request.user})
        return Response(config)
