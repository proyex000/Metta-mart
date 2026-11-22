"""Pengiriman GoSend: jam operasional, geocoding alamat, dan estimasi ongkir.

Ongkir adalah ESTIMASI berbasis jarak (garis lurus x faktor jalan) dengan tarif yang diatur admin.
Ini bukan harga resmi GoSend; admin tetap memesan kurir secara manual.
"""
import hashlib
import json
import logging
import math
import re
import threading
import time
import urllib.parse
import urllib.request
from datetime import datetime
from decimal import Decimal

from django.core.cache import cache
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from core.models import StoreSetting

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
PHOTON_URL = "https://photon.komoot.io/api/"
USER_AGENT = "MettaMart/1.0 (aplikasi koperasi sekolah; https://github.com/proyex000/Metta-mart)"
logger = logging.getLogger(__name__)
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


def _fetch_json(url):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json", "Accept-Language": "id"})
    with urllib.request.urlopen(request, timeout=8) as response:
        return json.loads(response.read().decode("utf-8"))


_throttle_lock = threading.Lock()
_last_nominatim_call = 0.0


def _throttle_nominatim():
    """Nominatim hanya mengizinkan 1 permintaan per detik; beri jeda agar tidak diblokir."""
    global _last_nominatim_call
    with _throttle_lock:
        wait = 1.1 - (time.monotonic() - _last_nominatim_call)
        if wait > 0:
            time.sleep(wait)
        _last_nominatim_call = time.monotonic()


def _lookup_nominatim(query):
    _throttle_nominatim()
    params = urllib.parse.urlencode({"q": query, "format": "jsonv2", "limit": 1, "countrycodes": "id"})
    rows = _fetch_json(f"{NOMINATIM_URL}?{params}")
    return (float(rows[0]["lat"]), float(rows[0]["lon"])) if rows else None


def _lookup_photon(query):
    params = urllib.parse.urlencode({"q": query, "limit": 1})
    data = _fetch_json(f"{PHOTON_URL}?{params}")
    features = data.get("features") or []
    if not features:
        return None
    lon, lat = features[0]["geometry"]["coordinates"][:2]
    return float(lat), float(lon)


PROVIDERS = (("nominatim", _lookup_nominatim), ("photon", _lookup_photon))


CONNECTION_ERROR = "Layanan peta sedang tidak dapat dihubungi. Coba lagi beberapa saat."


def _lookup(query):
    """Coba tiap layanan peta; None bila tidak ada yang menemukan, error bila semua gagal dihubungi."""
    failures = 0
    for name, provider in PROVIDERS:
        try:
            point = provider(query)
        except (OSError, ValueError, KeyError, IndexError, TypeError) as error:
            failures += 1
            logger.warning("Geocoding %s gagal untuk %r: %s: %s", name, query, type(error).__name__, error)
            continue
        if point:
            return point
    if failures == len(PROVIDERS):
        cache.set("geocode:cooldown", True, 20)  # hindari membanjiri layanan peta saat sedang bermasalah
        raise ValidationError({"delivery_address": CONNECTION_ERROR})
    return None


_HOUSE_NUMBER = re.compile(r"\b(?:no|nomor)\.?\s*\d+[a-z]?(?:[/-]\d+[a-z]?)?\b", re.IGNORECASE)
_ADMIN_PREFIX = re.compile(r"^(?:kecamatan|kec|kelurahan|kel|desa)\.?\s+", re.IGNORECASE)
_STREET_PREFIX = re.compile(r"^(?:jalan|jln|jl)\.?\s*", re.IGNORECASE)
_POSTAL_CODE = re.compile(r"\b\d{5}\b")


def address_variants(address):
    """Ubah alamat bebas menjadi beberapa kueri pencarian, dari paling rinci ke tingkat kecamatan.

    Contoh: "Jl. Angkasa No.28E, Air Hitam, Kec. Payung Sekaki, Kota Pekanbaru, Riau 28292" ->
    ["Jalan Angkasa, Air Hitam, Payung Sekaki, Kota Pekanbaru, Riau", "Air Hitam, Payung Sekaki, ...", "Payung Sekaki, ..."].
    """
    parts = []
    for raw in address.replace("\n", ",").split(","):
        part = _POSTAL_CODE.sub("", _HOUSE_NUMBER.sub("", raw))
        part = _ADMIN_PREFIX.sub("", part.strip())
        street = _STREET_PREFIX.match(part)
        if street and street.end() < len(part):
            part = "Jalan " + part[street.end():]
        part = re.sub(r"\s+", " ", part).strip(" .-")
        if part:
            parts.append(part)
    if not parts:
        return []
    return [", ".join(parts[start:]) for start in range(0, max(1, min(len(parts) - 2, 3)))]


def geocode(address):
    """Cari koordinat alamat; None bila tidak ditemukan, ValidationError bila layanan peta tidak terjangkau."""
    key = "geocode:" + hashlib.sha256(address.strip().lower().encode("utf-8")).hexdigest()
    cached = cache.get(key)
    if cached == "missing":
        return None
    if cached:
        return tuple(cached)
    if cache.get("geocode:cooldown"):
        raise ValidationError({"delivery_address": CONNECTION_ERROR})
    for query in address_variants(address) or [address]:
        point = _lookup(query)
        if point:
            cache.set(key, list(point), 60 * 60 * 24)
            return point
    cache.set(key, "missing", 60 * 10)
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
    origin_address = (config.get("origin_address") or "").strip() or ((profile.value or {}).get("address", "").strip() if profile else "")
    if not origin_address:
        raise ValidationError({"delivery_method": "Alamat koperasi belum diatur admin, pengiriman GoSend belum dapat dihitung."})
    origin = geocode(origin_address)
    if not origin:
        raise ValidationError({"delivery_method": "Alamat koperasi tidak ditemukan di peta. Hubungi admin untuk memperbaikinya."})
    destination = geocode(address)
    if not destination:
        raise ValidationError({"delivery_address": "Alamat tidak ditemukan di peta. Tulis dengan format: Jalan, Kelurahan, Kecamatan, Kota (contoh: Jl. Melati, Air Hitam, Payung Sekaki, Pekanbaru)."})
    distance = Decimal(str(round(haversine_km(origin, destination) * ROAD_FACTOR, 1)))
    if distance > Decimal(str(config["max_distance_km"])):
        raise ValidationError({"delivery_address": f"Alamat di luar jangkauan pengantaran (maksimal {config['max_distance_km']} km dari koperasi)."})
    return {"distance_km": distance, "fee": calculate_fee(distance, config)}
