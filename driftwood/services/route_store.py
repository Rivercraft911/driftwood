import json
import re
from pathlib import Path
from datetime import datetime
from ..models.route import Route, RouteMetadata
from ..engine.interpolation import build_cumulative_distances


def sanitize_name(name):
    return re.sub(r'[^\w\-. ]', '', name).strip()[:100]


class RouteStore:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)

    def _path_for(self, name):
        return self.directory / f"{sanitize_name(name)}.json"

    def list_routes(self):
        results = []
        for f in sorted(self.directory.glob("*.json")):
            try:
                route = Route.model_validate_json(f.read_text())
                path = [[w.lat, w.lon] for w in route.waypoints]
                cum = build_cumulative_distances(path)
                results.append(RouteMetadata(
                    name=route.name,
                    waypoint_count=len(route.waypoints),
                    total_distance_m=cum[-1] if cum else 0,
                    created=route.created,
                    modified=route.modified,
                ))
            except Exception:
                continue
        return results

    def get_route(self, name):
        p = self._path_for(name)
        if not p.exists():
            return None
        return Route.model_validate_json(p.read_text())

    def save_route(self, route):
        route.modified = datetime.utcnow()
        p = self._path_for(route.name)
        p.write_text(route.model_dump_json(indent=2))

    def delete_route(self, name):
        p = self._path_for(name)
        if p.exists():
            p.unlink()
            return True
        return False
