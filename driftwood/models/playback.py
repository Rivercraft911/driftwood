from pydantic import BaseModel, Field
from typing import Optional


class RealismConfig(BaseModel):
    jitter_enabled: bool = True
    jitter_radius_m: float = 2.0
    easing_enabled: bool = True
    easing_distance_m: float = 20.0
    drift_enabled: bool = True
    drift_max_pct: float = 0.08


class PlaybackConfig(BaseModel):
    speed_mps: float = 1.4
    use_arrival_times: bool = False
    loop_mode: str = "none"
    realism: RealismConfig = Field(default_factory=RealismConfig)


class SimPoint(BaseModel):
    lat: float
    lon: float
    speed: float
    heading: float


class PlaybackStatus(BaseModel):
    state: str = "idle"
    route_name: Optional[str] = None
    progress: float = 0.0
    elapsed_s: float = 0.0
    speed_mps: float = 0.0
    distance_m: float = 0.0
    total_distance_m: float = 0.0
    config: Optional[PlaybackConfig] = None
