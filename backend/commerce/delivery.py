"""Pengiriman GoSend: jam operasional, geocoding alamat, dan estimasi ongkir.

Ongkir adalah ESTIMASI berbasis jarak (garis lurus x faktor jalan) dengan tarif yang diatur admin.
Ini bukan harga resmi GoSend; admin tetap memesan kurir secara manual.
"""
import hashlib
import json
import math
import urllib.error
import urllib.parse
import urllib.request
import time
from datetime import datetime
from decimal import Decimal

from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from core.models import StoreSetting

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "MettaMart/1.0 (koperasi sekolah)"
ROAD_FACTOR = 1.3
# Koordinat tetap koperasi sekolah yang telah dikonfirmasi; fallback saat geocoding alamat asal gagal.
SCHOOL_ORIGIN_COORDINATES = (0.4985725, 101.4245111)
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


def _reserve_nominatim_slot():
    """Reserve one globally shared Nominatim request slot using the database row lock."""
    while True:
        with transaction.atomic():
            slot, _ = StoreSetting.objects.select_for_update().get_or_create(
                key="nominatim_request_slot",
                defaults={"value": {"next_request_at": 0}},
            )
            value = slot.value if isinstance(slot.value, dict) else {}
            try:
                next_request_at = float(value.get("next_request_at", 0))
            except (TypeError, ValueError):
                next_request_at = 0
            now = timezone.now().timestamp()
            delay = max(0.0, next_request_at - now)
            if delay <= 0:
                slot.value = {"next_request_at": now + 1.1}
                slot.save(update_fields=["value", "updated_at"])
                return
        time.sleep(min(delay, 1.1))


def _lookup(query):
    # The database row lock coordinates workers sharing this application's database.
    _reserve_nominatim_slot()

    params = urllib.parse.urlencode({"q": query, "format": "jsonv2", "limit": 1, "countrycodes": "id"})
    request = urllib.request.Request(
        f"{NOMINATIM_URL}?{params}",
        headers={"User-Agent": USER_AGENT, "Accept-Language": "id"},
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        rows = json.loads(response.read().decode("utf-8"))
    if not rows:
        return None
    return float(rows[0]["lat"]), float(rows[0]["lon"])


def geocode(address):
    """Cari koordinat alamat; cache juga hasil alamat yang tidak ditemukan."""
    normalized = " ".join((address or "").strip().lower().split())
    if not normalized:
        return None

    key = "geocode:" + hashlib.sha256(normalized.encode("utf-8")).hexdigest()
    cached = cache.get(key)
    if cached is not None:
        return None if cached == "__NOT_FOUND__" else tuple(cached)

    parts = [part.strip() for part in address.replace("\\n", ",").split(",") if part.strip()]
    attempts = list(dict.fromkeys(
        ", ".join(parts[start:])
        for start in range(min(len(parts), 3))
        if ", ".join(parts[start:])
    )) or [address.strip()]

    for query in attempts:
        try:
            point = _lookup(query)
        except urllib.error.HTTPError as exc:
            if exc.code == 429:
                raise ValidationError({
                    "delivery_address": "Layanan peta sedang membatasi pencarian sementara. Tunggu sebentar lalu coba lagi."
                })
            raise ValidationError({
                "delivery_address": f"Layanan peta merespons HTTP {exc.code}. Coba lagi beberapa saat."
            })
        except (urllib.error.URLError, TimeoutError, OSError, ValueError, KeyError):
            raise ValidationError({
                "delivery_address": "Koneksi ke layanan peta gagal atau terlalu lama. Coba lagi beberapa saat."
            })

        if point:
            cache.set(key, list(point), 60 * 60 * 24)
            return point

    # Avoid repeating the same unsuccessful public geocoding requests on every checkout.
    cache.set(key, "__NOT_FOUND__", 60 * 60 * 6)
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

    # Gunakan pin tetap koperasi yang telah dikonfirmasi bila alamat asal
    # tidak dapat ditemukan oleh Nominatim.
    origin = None
    if origin_address:
        try:
            origin = geocode(origin_address)
        except ValidationError:
            # Estimasi tetap dapat berjalan dengan pin sekolah yang tersimpan.
            origin = None
    if not origin:
        origin = SCHOOL_ORIGIN_COORDINATES
    try:
        destination = geocode(address)
    except ValidationError:
        return {
            "distance_km": None,
            "fee": 0,
            "manual_review": True,
            "message": "Layanan peta tidak tersedia saat ini. Admin akan menetapkan ongkir dan mengirimkan total akhir sebelum pembayaran.",
        }
    if not destination:
        return {
            "distance_km": None,
            "fee": 0,
            "manual_review": True,
            "message": "Alamat belum dapat ditemukan di peta. Pesanan tetap dapat dikirim; admin akan menetapkan ongkir dan mengirimkan total akhir sebelum pembayaran.",
        }
    distance = Decimal(str(round(haversine_km(origin, destination) * ROAD_FACTOR, 1)))
    if distance > Decimal(str(config["max_distance_km"])):
        raise ValidationError({"delivery_address": f"Alamat di luar jangkauan pengantaran (maksimal {config['max_distance_km']} km dari koperasi)."})
    return {"distance_km": distance, "fee": calculate_fee(distance, config), "manual_review": False, "message": ""}
