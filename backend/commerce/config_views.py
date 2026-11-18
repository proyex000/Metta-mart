from django.db import transaction
from rest_framework import permissions
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from accounts.permissions import IsAdminRole
from core.models import StoreSetting


DEFAULT_CONFIG = {
    "cash_enabled": True,
    "qris_enabled": False,
    "qris_image_url": "",
    "pickup_enabled": True,
    "delivery_enabled": False,
    "delivery_fee": 0,
}


def current_config():
    setting = StoreSetting.objects.filter(key="checkout").first()
    value = setting.value if setting and isinstance(setting.value, dict) else {}
    config = {**DEFAULT_CONFIG, **{key: value[key] for key in DEFAULT_CONFIG if key in value}}
    try:
        config["delivery_fee"] = max(0, int(config["delivery_fee"]))
    except (TypeError, ValueError):
        config["delivery_fee"] = 0
    config["qris_image_url"] = str(config["qris_image_url"] or "")
    config["qris_enabled"] = bool(config["qris_enabled"] and config["qris_image_url"])
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
        for key in ("cash_enabled", "qris_enabled", "pickup_enabled", "delivery_enabled"):
            if key in request.data:
                if not isinstance(request.data[key], bool):
                    raise ValidationError({key: "Nilai harus berupa true atau false."})
                config[key] = request.data[key]
        if "qris_image_url" in request.data:
            config["qris_image_url"] = str(request.data["qris_image_url"]).strip()
            if config["qris_image_url"] and not config["qris_image_url"].startswith(("https://", "http://")):
                raise ValidationError({"qris_image_url": "URL gambar QRIS harus menggunakan HTTP atau HTTPS."})
        if "delivery_fee" in request.data:
            try:
                fee = int(request.data["delivery_fee"])
            except (TypeError, ValueError):
                raise ValidationError({"delivery_fee": "Biaya pengiriman harus berupa bilangan bulat Rupiah."})
            if fee < 0 or fee > 100000000:
                raise ValidationError({"delivery_fee": "Biaya pengiriman di luar batas yang diizinkan."})
            config["delivery_fee"] = fee
        if config["qris_enabled"] and not config["qris_image_url"]:
            raise ValidationError({"qris_image_url": "Masukkan URL gambar QRIS sebelum mengaktifkan QRIS."})
        with transaction.atomic():
            StoreSetting.objects.update_or_create(key="checkout", defaults={"value": config, "updated_by": request.user})
        return Response(config)
