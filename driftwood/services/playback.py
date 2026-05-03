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
        self._speed_ema = None
        self._last_device_push_at = None
        self._device_push_task = None
        self._device_error_active = False

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
            speed_for_eta = self._speed_ema if self._speed_ema and self._speed_ema > 0 else self._config.speed_mps
            s.remaining_s = self.simulation.estimate_remaining_seconds(speed_for_eta)
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
        self._speed_ema = None
        self._last_device_push_at = None
        self._device_error_active = False
        self._cancel_device_push()
        self._task = asyncio.create_task(self._tick_loop())
        await self._broadcast_state("user")

    async def pause(self):
        if self.state == PlaybackState.PLAYING:
            self.state = PlaybackState.PAUSED
            await self._broadcast_state("user")

    async def resume(self):
        if self.state == PlaybackState.PAUSED:
            self.state = PlaybackState.PLAYING
            self._last_device_push_at = None
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
        self._cancel_device_push()
        if self.device_manager:
            try:
                await self.device_manager.clear_location()
            except Exception:
                pass
        self.simulation = None
        self.route_name = None
        self._speed_ema = None
        self._last_device_push_at = None
        self._device_error_active = False
        await self._broadcast_state("user")

    async def scrub(self, progress):
        if self.simulation:
            self.simulation.scrub_to(progress)

    async def update_config(self, config):
        prev_interval = self._config.device_update_interval_s
        self._config = config
        if self._config.device_update_interval_s != prev_interval:
            self._last_device_push_at = None
        if self.simulation:
            self.simulation.update_config(config)

    async def update_route(self, route):
        if not self.simulation:
            self.route_name = route.name
            self.simulation = SimulationEngine(route, self._config)
            return

        anchor = self.simulation.current_point(speed=0.0, apply_jitter=False)
        elapsed = self.simulation.elapsed
        direction = self.simulation.direction
        new_sim = SimulationEngine(route, self._config)
        new_sim.snap_to_nearest(anchor.lat, anchor.lon)
        new_sim.elapsed = elapsed
        new_sim.direction = direction
        self.route_name = route.name
        self.simulation = new_sim
        self._last_device_push_at = None
        await self._broadcast_state("route_updated")

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
                    end_point = self.simulation.current_point(speed=0.0, apply_jitter=False)
                    self._schedule_device_push(end_point.lat, end_point.lon)

                    if self.simulation.total_distance <= 0:
                        self.state = PlaybackState.IDLE
                        await self._broadcast_state("route_complete")
                        break

                    if self._config.loop_mode == "loop":
                        self.simulation.reset()
                        self._last_device_push_at = None
                        await asyncio.sleep(cfg.TICK_INTERVAL)
                        continue
                    elif self._config.loop_mode == "bounce":
                        self.simulation.reverse()
                        self._last_device_push_at = None
                        await asyncio.sleep(cfg.TICK_INTERVAL)
                        continue
                    else:
                        self.state = PlaybackState.IDLE
                        await self._broadcast_state("route_complete")
                        break

                if point.speed > 0.05:
                    if self._speed_ema is None:
                        self._speed_ema = point.speed
                    else:
                        self._speed_ema = self._speed_ema * 0.8 + point.speed * 0.2

                if self.device_manager:
                    should_push = (
                        self._last_device_push_at is None
                        or self.simulation.elapsed - self._last_device_push_at >= self._config.device_update_interval_s
                    )
                    if should_push:
                        self._schedule_device_push(point.lat, point.lon)
                        self._last_device_push_at = self.simulation.elapsed

                speed_for_eta = self._speed_ema if self._speed_ema and self._speed_ema > 0 else self._config.speed_mps
                remaining_s = self.simulation.estimate_remaining_seconds(speed_for_eta)

                await self._broadcast({
                    "type": "position",
                    "lat": point.lat,
                    "lon": point.lon,
                    "smooth_lat": point.smooth_lat or point.lat,
                    "smooth_lon": point.smooth_lon or point.lon,
                    "speed_mps": point.speed,
                    "heading": point.heading,
                    "elapsed_s": self.simulation.elapsed,
                    "progress": self.simulation.progress,
                    "distance_m": self.simulation.distance_covered,
                    "total_distance_m": self.simulation.total_distance,
                    "segment_index": self.simulation.current_segment,
                    "remaining_s": remaining_s,
                })

                await asyncio.sleep(cfg.TICK_INTERVAL)
        except asyncio.CancelledError:
            pass

    def _schedule_device_push(self, lat, lon):
        if not self.device_manager:
            return
        if self._device_push_task and not self._device_push_task.done():
            return
        self._device_push_task = asyncio.create_task(self._push_device_location(lat, lon))

    async def _push_device_location(self, lat, lon):
        try:
            await self.device_manager.set_location(lat, lon)
            if self._device_error_active:
                self._device_error_active = False
                await self._broadcast({"type": "device", "status": "reconnected"})
        except Exception as e:
            if not self._device_error_active:
                self._device_error_active = True
                await self._broadcast({
                    "type": "error",
                    "message": f"Device disconnected; playback is still running and Driftwood will keep retrying. {e}",
                    "code": "DEVICE_RETRYING",
                })
                await self._broadcast({"type": "device", "status": "reconnecting"})

    def _cancel_device_push(self):
        if self._device_push_task and not self._device_push_task.done():
            self._device_push_task.cancel()
        self._device_push_task = None

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
