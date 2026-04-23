from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class Waypoint(BaseModel):
    lat: float
    lon: float
    arrival_time: Optional[float] = None
    dwell_time: Optional[float] = None
    label: Optional[str] = None


class Route(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    waypoints: list[Waypoint] = Field(..., min_length=1)
    snapped_path: Optional[list[list[float]]] = None
    created: datetime = Field(default_factory=datetime.utcnow)
    modified: datetime = Field(default_factory=datetime.utcnow)


class RouteMetadata(BaseModel):
    name: str
    waypoint_count: int
    total_distance_m: float
    created: datetime
    modified: datetime
