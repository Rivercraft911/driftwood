from fastapi import APIRouter, HTTPException
import httpx
from ..config import OSRM_BASE

router = APIRouter()


@router.get("/osrm/route")
async def osrm_route(coords: str):
    url = f"{OSRM_BASE}/route/v1/foot/{coords}"
    params = {"overview": "full", "geometries": "geojson", "steps": "false"}
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(url, params=params)
            return resp.json()
        except httpx.RequestError as e:
            raise HTTPException(502, f"OSRM request failed: {e}")
