import asyncio
from enum import Enum
from ..models.playback import PlaybackConfig, PlaybackStatus
from .simulation import SimulationEngine
from .. import config as cfg


class PlaybackState(str, Enum):
    IDLE = "idle"
    PLAYING = "playing"
    PAUSED = "paused"


class PlaybackController:
    def __init__(self, device_manager=None):
        self.device_manager = device_manager
        self.state = PlaybackState.IDLE
        self.simulation = None
        self.route_name = None
        self._task = None
        self._ws_clients = set()
        self._config = PlaybackConfig()

    @property
    def status(self):
        s = PlaybackStatus(
            state=self.state.value,
            route_name=self.route_name,
            config=self._config,
        )
        if self.simulation:
            s.progress = self.simulation.progress
            s.elapsed_s = self.simulation.elapsed
            s.distance_m = self.simulation.distance_covered
            s.total_distance_m = self.simulation.total_distance
            s.speed_mps = self._config.speed_mps
        return s

    async def play(self, route, config=None):
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

        self._config = config or PlaybackConfig()
        self.route_name = route.name
        self.simulation = SimulationEngine(route, self._config)
        self.state = PlaybackState.PLAYING
        self._task = asyncio.create_task(self._tick_loop())
        await self._broadcast_state("user")

    async def pause(self):
        if self.state == PlaybackState.PLAYING:
            self.state = PlaybackState.PAUSED
            await self._broadcast_state("user")

    async def resume(self):
        if self.state == PlaybackState.PAUSED:
            self.state = PlaybackState.PLAYING
            if not self._task or self._task.done():
                self._task = asyncio.create_task(self._tick_loop())
            await self._broadcast_state("user")

    async def stop(self):
        self.state = PlaybackState.IDLE
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self.device_manager:
            try:
                await self.device_manager.clear_location()
            except Exception:
                pass
        self.simulation = None
        self.route_name = None
        await self._broadcast_state("user")

    async def scrub(self, progress):
        if self.simulation:
            self.simulation.scrub_to(progress)

    async def update_config(self, config):
        self._config = config
        if self.simulation:
            self.simulation.update_config(config)

    def add_ws(self, ws):
        self._ws_clients.add(ws)

    def remove_ws(self, ws):
        self._ws_clients.discard(ws)

    async def _tick_loop(self):
        try:
            while self.state == PlaybackState.PLAYING:
                if not self.simulation:
                    break

                point = self.simulation.tick(cfg.TICK_INTERVAL)

                if point is None:
                    if self._config.loop_mode == "loop":
                        self.simulation.reset()
                        continue
                    elif self._config.loop_mode == "bounce":
                        self.simulation.reverse()
                        continue
                    else:
                        self.state = PlaybackState.IDLE
                        await self._broadcast_state("route_complete")
                        break

                if self.device_manager:
                    try:
                        await self.device_manager.set_location(point.lat, point.lon)
                    except Exception:
                        self.state = PlaybackState.PAUSED
                        await self._broadcast({"type": "error", "message": "Device disconnected", "code": "DEVICE_LOST"})
                        await self._broadcast_state("device_lost")
                        break

                await self._broadcast({
                    "type": "position",
                    "lat": point.lat,
                    "lon": point.lon,
                    "speed_mps": point.speed,
                    "heading": point.heading,
                    "elapsed_s": self.simulation.elapsed,
                    "progress": self.simulation.progress,
                    "distance_m": self.simulation.distance_covered,
                    "total_distance_m": self.simulation.total_distance,
                    "segment_index": self.simulation.current_segment,
                })

                await asyncio.sleep(cfg.TICK_INTERVAL)
        except asyncio.CancelledError:
            pass

    async def _broadcast_state(self, reason):
        await self._broadcast({
            "type": "state",
            "state": self.state.value,
            "reason": reason,
            "route_name": self.route_name,
        })

    async def _broadcast(self, msg):
        dead = set()
        for ws in self._ws_clients:
            try:
                await ws.send_json(msg)
            except Exception:
                dead.add(ws)
        self._ws_clients -= dead
