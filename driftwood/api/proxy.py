import asyncio
import time
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
import httpx
from .. import config as cfg

router = APIRouter()

_cache: dict[tuple[str, str], dict] = {}
_cache_lock = asyncio.Lock()
_provider_state = {
    "osrm": {"failure_count": 0, "backoff_until": 0.0},
    "mapbox": {"failure_count": 0, "backoff_until": 0.0},
}


def _provider_available(provider: str) -> bool:
    return provider == "osrm" or bool(cfg.MAPBOX_ACCESS_TOKEN)


def _provider_label(provider: str) -> str:
    return "Mapbox" if provider == "mapbox" else "OSRM"


def _routing_request(provider: str, coords: str):
    if provider == "osrm":
        return (
            f"{cfg.OSRM_BASE}/route/v1/foot/{coords}",
            {"overview": "full", "geometries": "geojson", "steps": "false"},
            {
                "Accept": "application/json",
                "User-Agent": cfg.OSRM_USER_AGENT,
            },
            cfg.OSRM_TIMEOUT_S,
        )

    return (
        f"{cfg.MAPBOX_BASE}/directions/v5/{cfg.MAPBOX_PROFILE}/{coords}",
        {
            "overview": "full",
            "geometries": "geojson",
            "steps": "false",
            "access_token": cfg.MAPBOX_ACCESS_TOKEN,
        },
        {"Accept": "application/json"},
        cfg.MAPBOX_TIMEOUT_S,
    )


def _normalize_response(data: dict) -> dict:
    if not isinstance(data, dict):
        return data
    routes = data.get("routes")
    if not isinstance(routes, list) or not routes:
        return data
    route = routes[0]
    if not isinstance(route, dict):
        return data
    geometry = route.get("geometry")
    if not isinstance(geometry, dict) or not isinstance(geometry.get("coordinates"), list):
        return data
    return data


def _redact_token(value):
    token = cfg.MAPBOX_ACCESS_TOKEN
    if not token:
        return value
    if isinstance(value, str):
        return value.replace(token, "<redacted>")
    if isinstance(value, list):
        return [_redact_token(item) for item in value]
    if isinstance(value, dict):
        return {key: _redact_token(item) for key, item in value.items()}
    return value


def _record_failure(provider: str):
    state = _provider_state[provider]
    state["failure_count"] += 1
    if state["failure_count"] >= 3:
        state["backoff_until"] = time.monotonic() + cfg.ROUTER_BACKOFF_S


def _record_success(provider: str):
    state = _provider_state[provider]
    state["failure_count"] = 0
    state["backoff_until"] = 0.0


@router.get("/providers")
async def routing_providers():
    return {
        "providers": [
            {"id": "osrm", "label": "OSRM", "available": True},
            {"id": "mapbox", "label": "Mapbox", "available": bool(cfg.MAPBOX_ACCESS_TOKEN)},
        ]
    }


@router.get("/route")
async def route(
    coords: str,
    provider: str = Query("osrm", pattern="^(osrm|mapbox)$"),
):
    provider = provider.lower()
    label = _provider_label(provider)

    if not _provider_available(provider):
        raise HTTPException(503, f"{label} routing is not configured")

    cache_key = (provider, coords)
    now = time.monotonic()
    async with _cache_lock:
        cached = _cache.get(cache_key)
        if cached and cached["expires_at"] > now:
            return cached["data"]
        if cached:
            del _cache[cache_key]

    state = _provider_state[provider]
    if now < state["backoff_until"]:
        raise HTTPException(503, f"{label} temporarily unavailable; using straight segment fallback")

    url, params, headers, timeout_s = _routing_request(provider, coords)

    try:
        async with httpx.AsyncClient(timeout=timeout_s, headers=headers) as client:
            resp = await client.get(url, params=params)
            data = resp.json()
    except (httpx.RequestError, ValueError):
        _record_failure(provider)
        raise HTTPException(502, f"{label} request failed")

    if resp.status_code >= 500:
        _record_failure(provider)
        raise HTTPException(502, f"{label} request failed")

    _record_success(provider)
    normalized = _normalize_response(_redact_token(data))
    if resp.status_code >= 400:
        if provider == "mapbox" and resp.status_code in {401, 403}:
            raise HTTPException(503, "Mapbox routing rejected the configured token")
        return JSONResponse(status_code=resp.status_code, content=normalized)

    async with _cache_lock:
        _cache[cache_key] = {
            "expires_at": time.monotonic() + cfg.ROUTER_CACHE_TTL_S,
            "data": normalized,
        }
    return normalized


@router.get("/osrm/route")
async def osrm_route(coords: str):
    return await route(coords=coords, provider="osrm")
