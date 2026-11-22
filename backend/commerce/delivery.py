"""Pengiriman GoSend: jam operasional, geocoding alamat, dan estimasi ongkir.

Ongkir adalah ESTIMASI berbasis jarak (garis lurus x faktor jalan) dengan tarif yang diatur admin.
Ini bukan harga resmi GoSend; admin tetap memesan kurir secara manual.
"""
import hashlib
import json
import math
import urllib.parse
import urllib.request
from datetime import datetime
from decimal import Decimal

from django.core.cache import cache
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from core.models import StoreSetting

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "MettaMart/1.0 (koperasi sekolah)"
ROAD_FACTOR = 1.3
EARTH_RADIUS_KM = 6371.0088
DAY_CODES = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
DAY_LABELS = {"mon": "Senin", "tue": "Selasa", "wed": "Rabu", "thu": "Kamis", "fri": "Jumat", "sat": "Sabtu", "sun": "Minggu"}

DEFAULT_DELIVERY_SETTINGS = {
    "enabled": True,
    "origin_address": "",
    "base_fee": 10000,
    "base_distance_km": 3,
    "per_km_fee": 2500,
    "max_distance_km": 15,
}


def get_delivery_settings():
    setting = StoreSetting.objects.filter(key="delivery_settings").first()
    saved = setting.value if setting and isinstance(setting.value, dict) else {}
    return {**DEFAULT_DELIVERY_SETTINGS, **saved}


def get_operating_hours():
    setting = StoreSetting.objects.filter(key="operating_hours").first()
    return setting.value if setting and isinstance(setting.value, dict) else {}


def store_is_open(now=None):
    hours = get_operating_hours()
    days = hours.get("days", [])
    open_time, close_time = hours.get("open_time", ""), hours.get("close_time", "")
    if not open_time or not close_time:
        return False
    local_now = timezone.localtime(now or timezone.now())
    if DAY_CODES[local_now.weekday()] not in days:
        return False
    opening = datetime.strptime(open_time, "%H:%M").time()
    closing = datetime.strptime(close_time, "%H:%M").time()
    return opening <= local_now.time().replace(tzinfo=None) <= closing


def operating_hours_text():
    hours = get_operating_hours()
    days = [DAY_LABELS[day] for day in DAY_CODES if day in hours.get("days", [])]
    if not days or not hours.get("open_time") or not hours.get("close_time"):
        return "jam operasional belum diatur admin"
    return f"{', '.join(days)} pukul {hours['open_time']}–{hours['close_time']}"


def _lookup(query):
    params = urllib.parse.urlencode({"q": query, "format": "jsonv2", "limit": 1, "countrycodes": "id"})
    request = urllib.request.Request(f"{NOMINATIM_URL}?{params}", headers={"User-Agent": USER_AGENT, "Accept-Language": "id"})
    with urllib.request.urlopen(request, timeout=6) as response:
        rows = json.loads(response.read().decode("utf-8"))
    if not rows:
        return None
    return float(rows[0]["lat"]), float(rows[0]["lon"])


def geocode(address):
    """Cari koordinat alamat. Bila alamat lengkap tak ditemukan, coba tanpa bagian depan (nama jalan/nomor)."""
    key = "geocode:" + hashlib.sha256(address.strip().lower().encode("utf-8")).hexdigest()
    cached = cache.get(key)
    if cached:
        return tuple(cached)
    parts = [part.strip() for part in address.replace("\n", ",").split(",") if part.strip()]
    attempts = [", ".join(parts[start:]) for start in range(0, max(1, min(len(parts) - 1, 3)))] or [address]
    for query in attempts:
        try:
            point = _lookup(query)
        except (OSError, ValueError, KeyError):
            raise ValidationError({"delivery_address": "Layanan peta sedang tidak dapat dihubungi. Coba lagi beberapa saat."})
        if point:
            cache.set(key, list(point), 60 * 60 * 24)
            return point
    return None


def haversine_km(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))


def calculate_fee(distance_km, config):
    extra_km = max(0, math.ceil(float(distance_km) - float(config["base_distance_km"])))
    return int(config["base_fee"]) + extra_km * int(config["per_km_fee"])


def quote_delivery(address):
    config = get_delivery_settings()
    if not config["enabled"]:
        raise ValidationError({"delivery_method": "Pengiriman GoSend sedang tidak tersedia."})
    address = (address or "").strip()
    if len(address) < 10:
        raise ValidationError({"delivery_address": "Isi alamat lengkap (jalan, nomor, kelurahan/kecamatan, kota)."})
    profile = StoreSetting.objects.filter(key="store_profile").first()
    origin_address = (
        (config.get("origin_address") or "").strip()
        or ((profile.value or {}).get("address", "").strip() if profile else "")
    )

    # Koordinat tetap sekolah/koperasi sebagai fallback karena alamat profil
    # yang panjang kadang tidak ditemukan oleh Nominatim.
    school_origin = (0.4985725, 101.4245111)
    origin = None
    if origin_address:
        try:
            origin = geocode(origin_address)
        except ValidationError:
            # Estimasi tetap dapat berjalan dengan pin sekolah yang tersimpan.
            origin = None
    if not origin:
        origin = school_origin
    destination = geocode(address)
    if not destination:
        raise ValidationError({"delivery_address": "Alamat tidak ditemukan di peta. Lengkapi dengan kelurahan/kecamatan dan kota."})
    distance = Decimal(str(round(haversine_km(origin, destination) * ROAD_FACTOR, 1)))
    if distance > Decimal(str(config["max_distance_km"])):
        raise ValidationError({"delivery_address": f"Alamat di luar jangkauan pengantaran (maksimal {config['max_distance_km']} km dari koperasi)."})
    return {"distance_km": distance, "fee": calculate_fee(distance, config)}
