from fastapi import APIRouter

from .. import config as cfg

router = APIRouter()


@router.get("")
async def get_client_config():
    mapbox_available = bool(cfg.MAPBOX_ACCESS_TOKEN)
    default_provider = cfg.DEFAULT_ROUTER if cfg.DEFAULT_ROUTER in {"osrm", "mapbox"} else "osrm"
    if default_provider == "mapbox" and not mapbox_available:
        default_provider = "osrm"

    return {
        "mapbox": {
            "accessToken": cfg.MAPBOX_ACCESS_TOKEN or None,
            "styles": {
                "streets": "mapbox://styles/mapbox/standard",
                "satellite": "mapbox://styles/mapbox/standard-satellite",
            },
        },
        "routing": {
            "defaultProvider": default_provider,
            "providers": [
                {"id": "osrm", "label": "OSRM", "available": True},
                {"id": "mapbox", "label": "Mapbox", "available": mapbox_available},
            ],
        },
    }
