import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional in editable installs
    load_dotenv = None

if load_dotenv:
    load_dotenv(BASE_DIR / ".env")

ROUTES_DIR = BASE_DIR / "routes"
STATIC_DIR = BASE_DIR / "static"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 7777
TICK_RATE = 4
TICK_INTERVAL = 1.0 / TICK_RATE

DEFAULT_ROUTER = os.getenv("DRIFTWOOD_DEFAULT_ROUTER", "mapbox").strip().lower()
ROUTER_CACHE_TTL_S = float(os.getenv("DRIFTWOOD_ROUTER_CACHE_TTL_S", os.getenv("DRIFTWOOD_OSRM_CACHE_TTL_S", "86400")))
ROUTER_BACKOFF_S = float(os.getenv("DRIFTWOOD_ROUTER_BACKOFF_S", os.getenv("DRIFTWOOD_OSRM_BACKOFF_S", "60")))

OSRM_BASE = os.getenv("DRIFTWOOD_OSRM_BASE", "https://router.project-osrm.org").rstrip("/")
OSRM_USER_AGENT = os.getenv("DRIFTWOOD_OSRM_USER_AGENT", "MR-Driftwood/0.1 (local route simulator)")
OSRM_TIMEOUT_S = float(os.getenv("DRIFTWOOD_OSRM_TIMEOUT_S", "8"))
OSRM_CACHE_TTL_S = ROUTER_CACHE_TTL_S
OSRM_BACKOFF_S = ROUTER_BACKOFF_S

MAPBOX_ACCESS_TOKEN = os.getenv("MAPBOX_ACCESS_TOKEN", "").strip()
MAPBOX_BASE = os.getenv("DRIFTWOOD_MAPBOX_BASE", "https://api.mapbox.com").rstrip("/")
MAPBOX_WALKING_PROFILE = os.getenv("DRIFTWOOD_MAPBOX_WALKING_PROFILE", os.getenv("DRIFTWOOD_MAPBOX_PROFILE", "mapbox/walking")).strip("/")
MAPBOX_DRIVING_PROFILE = os.getenv("DRIFTWOOD_MAPBOX_DRIVING_PROFILE", "mapbox/driving").strip("/")
MAPBOX_PROFILE = MAPBOX_WALKING_PROFILE
MAPBOX_TIMEOUT_S = float(os.getenv("DRIFTWOOD_MAPBOX_TIMEOUT_S", "8"))
