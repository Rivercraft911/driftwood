from fastapi import APIRouter, Request, HTTPException, Response
from ..models.route import Route
from ..services.gpx import parse_gpx, export_gpx

router = APIRouter()


@router.get("")
async def list_routes(request: Request):
    return request.app.state.route_store.list_routes()


@router.get("/{name}")
async def get_route(name: str, request: Request):
    route = request.app.state.route_store.get_route(name)
    if not route:
        raise HTTPException(404, "Route not found")
    return route


@router.post("")
async def save_route(route: Route, request: Request):
    request.app.state.route_store.save_route(route)
    return {"status": "saved", "name": route.name}


@router.delete("/{name}")
async def delete_route(name: str, request: Request):
    if request.app.state.route_store.delete_route(name):
        return {"status": "deleted"}
    raise HTTPException(404, "Route not found")


@router.post("/import-gpx")
async def import_gpx(request: Request):
    body = await request.body()
    try:
        waypoints = parse_gpx(body.decode("utf-8"))
    except Exception as e:
        raise HTTPException(400, f"Invalid GPX: {e}")
    if not waypoints:
        raise HTTPException(400, "No waypoints found in GPX")
    return {"waypoints": [w.model_dump() for w in waypoints]}


@router.post("/export-gpx")
async def export_gpx_endpoint(route: Route):
    xml = export_gpx(route)
    return Response(content=xml, media_type="application/gpx+xml", headers={
        "Content-Disposition": f'attachment; filename="{route.name}.gpx"'
    })
