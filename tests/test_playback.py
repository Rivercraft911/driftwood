import asyncio

from fastapi.testclient import TestClient

from driftwood.models.playback import PlaybackConfig, RealismConfig
from driftwood.models.route import Route, Waypoint
from driftwood.services.playback import PlaybackController, PlaybackState
from driftwood.services.simulation import SimulationEngine

NO_REALISM = RealismConfig(jitter_enabled=False, easing_enabled=False, drift_enabled=False)


class FakeDevice:
    def __init__(self):
        self.pushes = []
        self.cleared = 0

    async def set_location(self, lat, lon):
        self.pushes.append((lat, lon))

    async def clear_location(self):
        self.cleared += 1


def make_route(name="test"):
    return Route(name=name, waypoints=[Waypoint(lat=37.0, lon=-122.0), Waypoint(lat=37.001, lon=-122.0)])


def test_simulation_reaches_end():
    sim = SimulationEngine(make_route(), PlaybackConfig(speed_mps=10, realism=NO_REALISM))
    assert 100 < sim.total_distance < 120
    ticks = 0
    while sim.tick(0.25) is not None:
        ticks += 1
        assert ticks < 1000
    assert sim.progress == 1.0


def test_hold_pushes_fixed_location_and_stop_releases():
    async def run():
        dev = FakeDevice()
        pc = PlaybackController(dev)
        await pc.hold(40.0, -74.0, PlaybackConfig(realism=NO_REALISM))
        await asyncio.sleep(0.6)
        assert pc.state == PlaybackState.HOLDING
        assert pc.status.hold_lat == 40.0
        assert dev.pushes and all(p == (40.0, -74.0) for p in dev.pushes)

        await pc.update_route(make_route())
        assert pc.simulation is None

        await pc.stop()
        assert pc.state == PlaybackState.IDLE
        assert pc.hold_point is None
        assert dev.cleared == 1

    asyncio.run(run())


def test_play_replaces_hold():
    async def run():
        pc = PlaybackController(FakeDevice())
        await pc.hold(40.0, -74.0)
        await pc.play(make_route(), PlaybackConfig(realism=NO_REALISM))
        assert pc.state == PlaybackState.PLAYING
        assert pc.hold_point is None
        assert pc.simulation is not None
        await pc.stop()

    asyncio.run(run())


def test_ws_play_inline_route_does_not_touch_store(tmp_path, monkeypatch):
    from driftwood import config as cfg
    from driftwood.app import create_app

    monkeypatch.setattr(cfg, "ROUTES_DIR", tmp_path)
    app = create_app()
    with TestClient(app) as client:
        app.state.playback.device_manager = FakeDevice()
        with client.websocket_connect("/api/playback/ws") as ws:
            assert ws.receive_json()["state"] == "idle"
            ws.send_json({"type": "play", "route": make_route("inline").model_dump(mode="json"), "speed_mps": 5})
            assert ws.receive_json() == {
                "type": "state", "state": "playing", "reason": "user",
                "route_name": "inline", "hold_lat": None, "hold_lon": None,
            }
            ws.send_json({"type": "hold", "lat": 10.0, "lon": 20.0})
            msg = ws.receive_json()
            while msg["type"] != "state":
                msg = ws.receive_json()
            assert msg["state"] == "holding" and msg["hold_lat"] == 10.0
            ws.send_json({"type": "stop"})
    assert list(tmp_path.iterdir()) == []
