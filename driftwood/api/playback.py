import json
from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from typing import Optional
from ..models.playback import PlaybackConfig, RealismConfig
from ..models.route import Route

router = APIRouter()


class PlayRequest(BaseModel):
    route_name: str
    speed_mps: float = 1.4
    use_arrival_times: bool = False
    loop_mode: str = "none"
    device_update_interval_s: float = 0.25
    realism: Optional[RealismConfig] = None


class ScrubRequest(BaseModel):
    progress: float


@router.get("/state")
async def get_state(request: Request):
    return request.app.state.playback.status


@router.post("/play")
async def play(req: PlayRequest, request: Request):
    store = request.app.state.route_store
    route = store.get_route(req.route_name)
    if not route:
        from fastapi import HTTPException
        raise HTTPException(404, "Route not found")

    config = PlaybackConfig(
        speed_mps=req.speed_mps,
        use_arrival_times=req.use_arrival_times,
        loop_mode=req.loop_mode,
        device_update_interval_s=req.device_update_interval_s,
        realism=req.realism or RealismConfig(),
    )
    await request.app.state.playback.play(route, config)
    return {"status": "playing"}


@router.post("/pause")
async def pause(request: Request):
    await request.app.state.playback.pause()
    return {"status": "paused"}


@router.post("/resume")
async def resume(request: Request):
    await request.app.state.playback.resume()
    return {"status": "resumed"}


@router.post("/stop")
async def stop(request: Request):
    await request.app.state.playback.stop()
    return {"status": "stopped"}


@router.post("/scrub")
async def scrub(req: ScrubRequest, request: Request):
    await request.app.state.playback.scrub(req.progress)
    return {"status": "scrubbed"}


@router.post("/config")
async def update_config(config: PlaybackConfig, request: Request):
    await request.app.state.playback.update_config(config)
    return {"status": "updated"}


@router.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    await websocket.accept()
    playback = websocket.app.state.playback
    playback.add_ws(websocket)
    status = playback.status
    await websocket.send_json({
        "type": "state",
        "state": status.state,
        "reason": "snapshot",
        "route_name": status.route_name,
    })

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
                msg_type = msg.get("type")

                if msg_type == "play":
                    store = websocket.app.state.route_store
                    route = store.get_route(msg["route_name"])
                    if route:
                        config = PlaybackConfig(
                            speed_mps=msg.get("speed_mps", 1.4),
                            use_arrival_times=msg.get("use_arrival_times", False),
                            loop_mode=msg.get("loop_mode", "none"),
                            device_update_interval_s=msg.get("device_update_interval_s", 0.25),
                            realism=RealismConfig(**(msg.get("realism") or {})),
                        )
                        await playback.play(route, config)
                elif msg_type == "pause":
                    await playback.pause()
                elif msg_type == "resume":
                    await playback.resume()
                elif msg_type == "stop":
                    await playback.stop()
                elif msg_type == "scrub":
                    await playback.scrub(msg["progress"])
                elif msg_type == "config":
                    config = PlaybackConfig(**msg.get("config", {}))
                    await playback.update_config(config)
                elif msg_type == "route_update":
                    route_payload = msg.get("route")
                    if not route_payload:
                        continue
                    route = Route.model_validate(route_payload)
                    if len(route.waypoints) < 2:
                        continue
                    config_payload = msg.get("config")
                    if config_payload is not None:
                        config = PlaybackConfig(**config_payload)
                        await playback.update_config(config)
                    await playback.update_route(route)
            except Exception as e:
                await websocket.send_json({
                    "type": "error",
                    "message": str(e),
                })

    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        playback.remove_ws(websocket)
