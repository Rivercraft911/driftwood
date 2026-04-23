import bisect
from ..engine.geo import haversine
from ..engine.interpolation import build_cumulative_distances, interpolate_along_path, heading_at
from ..engine.realism import JitterGenerator, EasingCalculator, DriftGenerator
from ..engine.timing import derive_segment_speeds
from ..models.playback import SimPoint


class SimulationEngine:
    def __init__(self, route, config):
        self.config = config
        self.waypoints = route.waypoints

        if route.snapped_path and len(route.snapped_path) >= 2:
            self.path = route.snapped_path
        else:
            self.path = [[w.lat, w.lon] for w in route.waypoints]

        self.cum_dist = build_cumulative_distances(self.path)
        self.total_distance = self.cum_dist[-1] if self.cum_dist else 0

        wp_positions = [[w.lat, w.lon] for w in self.waypoints]
        wp_cum = build_cumulative_distances(wp_positions)
        self.waypoint_distances = wp_cum

        self._map_waypoints_to_path()

        self.segment_speeds = None
        if config.use_arrival_times:
            self.segment_speeds = derive_segment_speeds(self.waypoints, self.waypoint_distances)

        self._jitter = JitterGenerator(config.realism)
        self._easing = EasingCalculator(config.realism, self._wp_path_dists)
        self._drift = DriftGenerator(config.realism)

        self.distance_covered = 0.0
        self.elapsed = 0.0
        self.direction = 1
        self._dwell_remaining = 0.0
        self._last_heading = 0.0
        self._last_wp_crossed = -1

    def _future_dwell_seconds(self):
        if self.direction < 0:
            return self._dwell_remaining

        dwell = self._dwell_remaining
        for i, wd in enumerate(self._wp_path_dists):
            if i <= self._last_wp_crossed:
                continue
            if wd > self.distance_covered and self.waypoints[i].dwell_time:
                dwell += self.waypoints[i].dwell_time
        return dwell

    def _map_waypoints_to_path(self):
        self._wp_path_dists = []
        for w in self.waypoints:
            best_dist = 0.0
            best_delta = float("inf")
            for i, p in enumerate(self.path):
                d = haversine([w.lat, w.lon], p)
                if d < best_delta:
                    best_delta = d
                    best_dist = self.cum_dist[i]
            self._wp_path_dists.append(best_dist)

    @property
    def progress(self):
        if self.total_distance <= 0:
            return 1.0
        return min(1.0, max(0.0, self.distance_covered / self.total_distance))

    @property
    def current_segment(self):
        idx = bisect.bisect_right(self._wp_path_dists, self.distance_covered) - 1
        return max(0, min(idx, len(self.waypoints) - 2))

    def _get_speed(self):
        if self.segment_speeds:
            seg = self.current_segment
            if seg < len(self.segment_speeds) and self.segment_speeds[seg] is not None:
                return self.segment_speeds[seg]
        return self.config.speed_mps

    def tick(self, dt):
        if self._dwell_remaining > 0:
            self._dwell_remaining -= dt
            self.elapsed += dt
            lat, lon = interpolate_along_path(self.path, self.cum_dist, self.distance_covered)
            jlat, jlon = self._jitter.apply(lat, lon)
            return SimPoint(lat=jlat, lon=jlon, speed=0, heading=self._last_heading,
                            smooth_lat=lat, smooth_lon=lon)

        base_speed = self._get_speed()
        eased = self._easing.apply(base_speed, self.distance_covered)
        final_speed = self._drift.apply(eased)

        old_dist = self.distance_covered
        self.distance_covered += final_speed * dt * self.direction
        self.elapsed += dt

        if self.distance_covered >= self.total_distance:
            self.distance_covered = self.total_distance
            return None

        if self.distance_covered < 0:
            self.distance_covered = 0
            return None

        self._check_waypoint_crossing(old_dist, self.distance_covered)

        lat, lon = interpolate_along_path(self.path, self.cum_dist, self.distance_covered)
        self._last_heading = heading_at(self.path, self.cum_dist, self.distance_covered)
        jlat, jlon = self._jitter.apply(lat, lon)

        return SimPoint(lat=jlat, lon=jlon, speed=final_speed, heading=self._last_heading,
                        smooth_lat=lat, smooth_lon=lon)

    def current_point(self, speed=0.0, apply_jitter=True):
        if not self.path:
            return SimPoint(lat=0.0, lon=0.0, speed=speed, heading=self._last_heading)
        if len(self.path) < 2:
            lat = self.path[0][0]
            lon = self.path[0][1]
            return SimPoint(lat=lat, lon=lon, speed=speed, heading=self._last_heading)

        lat, lon = interpolate_along_path(self.path, self.cum_dist, self.distance_covered)
        heading = heading_at(self.path, self.cum_dist, self.distance_covered)
        if apply_jitter:
            lat, lon = self._jitter.apply(lat, lon)
        return SimPoint(lat=lat, lon=lon, speed=speed, heading=heading)

    def _check_waypoint_crossing(self, old_dist, new_dist):
        for i, wd in enumerate(self._wp_path_dists):
            if i <= self._last_wp_crossed:
                continue
            if old_dist < wd <= new_dist:
                self._last_wp_crossed = i
                if i < len(self.waypoints) and self.waypoints[i].dwell_time:
                    self._dwell_remaining = self.waypoints[i].dwell_time
                    self.distance_covered = wd
                break

    def scrub_to(self, progress):
        self.distance_covered = progress * self.total_distance
        self._dwell_remaining = 0
        self._last_wp_crossed = -1
        for i, wd in enumerate(self._wp_path_dists):
            if wd <= self.distance_covered:
                self._last_wp_crossed = i

    def nearest_path_distance(self, lat, lon):
        if not self.path:
            return 0.0

        best_idx = 0
        best_delta = float("inf")
        for i, p in enumerate(self.path):
            d = haversine([lat, lon], p)
            if d < best_delta:
                best_delta = d
                best_idx = i
        return self.cum_dist[best_idx]

    def snap_to_nearest(self, lat, lon):
        if self.total_distance <= 0:
            self.scrub_to(0.0)
            return
        nearest = self.nearest_path_distance(lat, lon)
        self.scrub_to(nearest / self.total_distance)

    def estimate_remaining_seconds(self, speed_mps):
        if self.direction > 0:
            remaining_distance = max(0.0, self.total_distance - self.distance_covered)
        else:
            remaining_distance = max(0.0, self.distance_covered)

        if remaining_distance <= 0:
            return 0.0

        if self.config.use_arrival_times and self.segment_speeds and self.direction > 0:
            return self._estimate_scheduled_remaining(speed_mps)

        base_speed = speed_mps if speed_mps and speed_mps > 0 else self.config.speed_mps
        return self._future_dwell_seconds() + remaining_distance / max(0.1, base_speed)

    def _estimate_scheduled_remaining(self, fallback_speed_mps):
        remaining = self._dwell_remaining
        current_distance = self.distance_covered
        current_segment = self.current_segment
        last_segment = len(self.waypoints) - 2

        if last_segment < 0:
            return remaining

        for seg in range(current_segment, last_segment + 1):
            seg_start = self._wp_path_dists[seg]
            seg_end = self._wp_path_dists[seg + 1]
            if seg_end <= current_distance:
                continue

            if seg == current_segment:
                seg_dist = seg_end - max(current_distance, seg_start)
            else:
                seg_dist = seg_end - seg_start

            speed = self.segment_speeds[seg] if seg < len(self.segment_speeds) else None
            if speed is None or speed <= 0:
                speed = fallback_speed_mps if fallback_speed_mps and fallback_speed_mps > 0 else self.config.speed_mps
            remaining += seg_dist / max(0.1, speed)

            wp_idx = seg + 1
            dwell = self.waypoints[wp_idx].dwell_time
            if dwell and wp_idx > self._last_wp_crossed:
                remaining += dwell

        return max(0.0, remaining)

    def reset(self):
        self.distance_covered = 0.0
        self.elapsed = 0.0
        self._dwell_remaining = 0.0
        self._last_wp_crossed = -1

    def reverse(self):
        self.direction *= -1

    def update_config(self, config):
        self.config = config
        if config.use_arrival_times:
            self.segment_speeds = derive_segment_speeds(self.waypoints, self.waypoint_distances)
        else:
            self.segment_speeds = None
        self._jitter.enabled = config.realism.jitter_enabled
        self._jitter.radius_m = config.realism.jitter_radius_m
        self._easing.enabled = config.realism.easing_enabled
        self._easing.ease_dist = config.realism.easing_distance_m
        self._drift.enabled = config.realism.drift_enabled
        self._drift.max_pct = config.realism.drift_max_pct
