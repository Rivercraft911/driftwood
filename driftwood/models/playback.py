from pydantic import BaseModel, Field
from typing import Literal, Optional


class RealismConfig(BaseModel):
    jitter_enabled: bool = True
    jitter_radius_m: float = 2.0
    easing_enabled: bool = True
    easing_distance_m: float = 20.0
    drift_enabled: bool = True
    drift_max_pct: float = 0.08


class PlaybackConfig(BaseModel):
    speed_mps: float = Field(default=1.4, ge=0.1, le=71.53)
    use_arrival_times: bool = False
    loop_mode: Literal["none", "loop", "bounce"] = "none"
    device_update_interval_s: float = Field(default=0.25, ge=0.25, le=50.0)
    realism: RealismConfig = Field(default_factory=RealismConfig)


class SimPoint(BaseModel):
    lat: float
    lon: float
    speed: float
    heading: float
    smooth_lat: Optional[float] = None
    smooth_lon: Optional[float] = None


class PlaybackStatus(BaseModel):
    state: str = "idle"
    route_name: Optional[str] = None
    progress: float = 0.0
    elapsed_s: float = 0.0
    speed_mps: float = 0.0
    distance_m: float = 0.0
    total_distance_m: float = 0.0
    remaining_s: float = 0.0
    config: Optional[PlaybackConfig] = None
