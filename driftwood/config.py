from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
ROUTES_DIR = BASE_DIR / "routes"
STATIC_DIR = BASE_DIR / "static"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 7777
TICK_RATE = 4
TICK_INTERVAL = 1.0 / TICK_RATE
OSRM_BASE = "https://router.project-osrm.org"
