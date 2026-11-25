import os
from pathlib import Path
from django.core.exceptions import ImproperlyConfigured
from corsheaders.defaults import default_headers
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

def env_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}

def env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "unsafe-development-key-change-before-deploy")
DEBUG = env_bool("DJANGO_DEBUG", False)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,testserver")

if not DEBUG:
    if SECRET_KEY == "unsafe-development-key-change-before-deploy" or len(SECRET_KEY) < 50:
        raise ImproperlyConfigured("Set DJANGO_SECRET_KEY to a unique random value of at least 50 characters in production.")
    if "DJANGO_ALLOWED_HOSTS" not in os.environ or not ALLOWED_HOSTS or "*" in ALLOWED_HOSTS:
        raise ImproperlyConfigured("Set DJANGO_ALLOWED_HOSTS to explicit production hostnames.")

INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "accounts",
    "core",
    "commerce",
]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "config.middleware.RequirePasswordChangeMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
ROOT_URLCONF = "config.urls"
TEMPLATES = [{
    "BACKEND": "django.template.backends.django.DjangoTemplates",
    "DIRS": [],
    "APP_DIRS": True,
    "OPTIONS": {"context_processors": [
        "django.template.context_processors.request",
        "django.contrib.auth.context_processors.auth",
        "django.contrib.messages.context_processors.messages",
    ]},
}]
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DB_ENGINE = os.getenv("DB_ENGINE", "sqlite" if DEBUG else "mysql").strip().lower()
if DB_ENGINE not in {"sqlite", "mysql"}:
    raise ImproperlyConfigured("DB_ENGINE must be either 'mysql' or 'sqlite'.")

if not DEBUG and DB_ENGINE != "mysql":
    raise ImproperlyConfigured("Production requires DB_ENGINE=mysql. SQLite is only supported for local development and tests.")

if DB_ENGINE == "mysql":
    if not DEBUG:
        missing_db_settings = [
            name for name in ("DB_NAME", "DB_USER", "DB_PASSWORD", "DB_HOST", "DB_PORT")
            if not os.getenv(name, "").strip()
        ]
        if missing_db_settings:
            raise ImproperlyConfigured(
                "Production MySQL/TiDB configuration is incomplete. Missing: " + ", ".join(missing_db_settings)
            )
        if not env_bool("DB_SSL", True):
            raise ImproperlyConfigured("Production requires DB_SSL=true for encrypted MySQL/TiDB connections.")
    db_options = {"charset": "utf8mb4"}
    # TLS may be disabled for local development and CI's disposable MySQL service.
    # Production is guarded above and must always use TLS with certificate verification.
    db_ssl_enabled = env_bool("DB_SSL", not DEBUG)
    if db_ssl_enabled:
        ca_file = (
            os.getenv("DB_SSL_CA", "").strip()
            or "/etc/ssl/certs/ca-certificates.crt"
        )
        db_options["ssl"] = {"ca": ca_file}
    elif not DEBUG:
        raise ImproperlyConfigured(
            "Production requires DB_SSL=true for encrypted MySQL/TiDB connections."
        )
    DATABASES = {"default": {
        "ENGINE": "django.db.backends.mysql",
        "NAME": os.getenv("DB_NAME", "mettamart"),
        "USER": os.getenv("DB_USER", ""),
        "PASSWORD": os.getenv("DB_PASSWORD", ""),
        "HOST": os.getenv("DB_HOST", "127.0.0.1"),
        "PORT": os.getenv("DB_PORT", "3306"),
        "OPTIONS": db_options,
        "CONN_MAX_AGE": 60,
        "CONN_HEALTH_CHECKS": True,
    }}
else:
    DATABASES = {"default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / os.getenv("DB_NAME", "db.sqlite3"),
    }}

AUTH_USER_MODEL = "accounts.User"
AUTHENTICATION_BACKENDS = ["django.contrib.auth.backends.ModelBackend"]
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
]
LANGUAGE_CODE = "id"
TIME_ZONE = "Asia/Jakarta"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = Path(os.getenv("MEDIA_ROOT") or str(BASE_DIR / "media")).expanduser()
# Legacy file-path compatibility only; new product images are stored in the database.
MEDIA_SERVE_ENABLED = env_bool("MEDIA_SERVE_ENABLED", DEBUG)
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "http://localhost:8443")
CORS_ALLOW_CREDENTIALS = True
# POS and online checkout send this custom header to enforce idempotent submissions.
# Keep django-cors-headers defaults and explicitly allow the application header.
CORS_ALLOW_HEADERS = (*default_headers, "idempotency-key")
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS", "http://localhost:8443")
if not DEBUG:
    if not CORS_ALLOWED_ORIGINS or not CSRF_TRUSTED_ORIGINS:
        raise ImproperlyConfigured("Production requires explicit CORS_ALLOWED_ORIGINS and DJANGO_CSRF_TRUSTED_ORIGINS.")
    if any("*" in origin for origin in (*CORS_ALLOWED_ORIGINS, *CSRF_TRUSTED_ORIGINS)):
        raise ImproperlyConfigured("Production CORS and CSRF origins must be explicit; wildcards are not allowed.")
    if any(not origin.startswith("https://") for origin in (*CORS_ALLOWED_ORIGINS, *CSRF_TRUSTED_ORIGINS)):
        raise ImproperlyConfigured("Production CORS and CSRF origins must use HTTPS.")
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SECURE = env_bool("CSRF_COOKIE_SECURE", not DEBUG)
CSRF_COOKIE_SAMESITE = os.getenv("CSRF_COOKIE_SAMESITE", "Lax" if DEBUG else "None")
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = env_bool("SESSION_COOKIE_SECURE", not DEBUG)
SESSION_COOKIE_SAMESITE = os.getenv("SESSION_COOKIE_SAMESITE", "Lax" if DEBUG else "None")
if not DEBUG and CSRF_COOKIE_SAMESITE.lower() == "none" and not CSRF_COOKIE_SECURE:
    raise ImproperlyConfigured("CSRF_COOKIE_SAMESITE=None requires CSRF_COOKIE_SECURE=true.")
if not DEBUG and (not SESSION_COOKIE_SECURE or not CSRF_COOKIE_SECURE):
    raise ImproperlyConfigured("Production requires SESSION_COOKIE_SECURE=true and CSRF_COOKIE_SECURE=true.")
if not DEBUG and SESSION_COOKIE_SAMESITE.lower() == "none" and not SESSION_COOKIE_SECURE:
    raise ImproperlyConfigured("SESSION_COOKIE_SAMESITE=None requires SESSION_COOKIE_SECURE=true.")
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", False)
SECURE_HSTS_SECONDS = int(os.getenv("SECURE_HSTS_SECONDS", "0"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool("SECURE_HSTS_INCLUDE_SUBDOMAINS", False)
SECURE_HSTS_PRELOAD = env_bool("SECURE_HSTS_PRELOAD", False)
SECURE_REFERRER_POLICY = os.getenv("SECURE_REFERRER_POLICY", "same-origin")
if env_bool("SECURE_PROXY_SSL_HEADER_ENABLED", False):
    # Enable only when a trusted reverse proxy overwrites inbound forwarded-proto headers.
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.ScopedRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {"login": "5/min", "register": "3/hour", "password_change": "5/hour"},
}

# Login/register/password-change throttles and the geocode cache use Django's default cache,
# which is per-process memory. With several Gunicorn workers each worker keeps its own counters,
# so the effective limit is multiplied by the worker count and resets on every restart.
# Set CACHE_DB_TABLE (then run `python manage.py createcachetable`) to share them through the
# database. When unset, the previous per-process behaviour is kept unchanged.
CACHE_DB_TABLE = os.getenv("CACHE_DB_TABLE", "").strip()
if CACHE_DB_TABLE:
    CACHES = {"default": {"BACKEND": "django.core.cache.backends.db.DatabaseCache", "LOCATION": CACHE_DB_TABLE}}

# Console logging is always enabled. Set LOG_DIR to also write rotating log files.
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"standard": {"format": "%(asctime)s %(levelname)s %(name)s %(message)s"}},
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "standard"},
    },
    "root": {"handlers": ["console"], "level": LOG_LEVEL},
    "loggers": {"django": {"handlers": ["console"], "level": LOG_LEVEL, "propagate": False}},
}
LOG_DIR = os.getenv("LOG_DIR", "").strip()
if LOG_DIR:
    log_path = Path(LOG_DIR).expanduser()
    log_path.mkdir(parents=True, exist_ok=True)
    LOGGING["handlers"]["rotating_file"] = {
        "class": "logging.handlers.RotatingFileHandler",
        "filename": str(log_path / "mettamart.log"),
        "maxBytes": 5 * 1024 * 1024,
        "backupCount": 5,
        "encoding": "utf-8",
        "formatter": "standard",
    }
    LOGGING["root"]["handlers"].append("rotating_file")
    LOGGING["loggers"]["django"]["handlers"].append("rotating_file")
