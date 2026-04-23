import math
import random


class JitterGenerator:
    def __init__(self, config):
        self.enabled = config.jitter_enabled
        self.radius_m = config.jitter_radius_m

    def apply(self, lat, lon):
        if not self.enabled:
            return lat, lon
        angle = random.uniform(0, 2 * math.pi)
        dist = random.gauss(0, self.radius_m / 3)
        dist = max(-self.radius_m, min(self.radius_m, dist))
        dlat = (dist * math.cos(angle)) / 111_320
        dlon = (dist * math.sin(angle)) / (111_320 * math.cos(math.radians(lat)))
        return lat + dlat, lon + dlon


class EasingCalculator:
    def __init__(self, config, waypoint_distances):
        self.enabled = config.easing_enabled
        self.ease_dist = config.easing_distance_m
        self.wp_dists = waypoint_distances

    def apply(self, speed, current_dist):
        if not self.enabled or not self.wp_dists:
            return speed
        min_d = float("inf")
        for d in self.wp_dists:
            min_d = min(min_d, abs(current_dist - d))
        if min_d < self.ease_dist:
            t = min_d / self.ease_dist
            factor = 0.3 + 0.7 * (0.5 - 0.5 * math.cos(math.pi * t))
            return speed * factor
        return speed


class DriftGenerator:
    def __init__(self, config):
        self.enabled = config.drift_enabled
        self.max_pct = config.drift_max_pct
        self._phase = random.uniform(0, 100)

    def apply(self, speed):
        if not self.enabled:
            return speed
        self._phase += 0.15
        drift = (
            math.sin(self._phase) * 0.6
            + math.sin(self._phase * 2.3 + 1.0) * 0.3
            + math.sin(self._phase * 5.1 + 2.0) * 0.1
        )
        return speed * (1.0 + drift * self.max_pct)
