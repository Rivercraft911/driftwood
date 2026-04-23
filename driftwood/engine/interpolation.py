import bisect
from .geo import haversine, bearing


def build_cumulative_distances(path):
    cum = [0.0]
    for i in range(1, len(path)):
        cum.append(cum[-1] + haversine(path[i - 1], path[i]))
    return cum


def interpolate_along_path(path, cum_dist, target_dist):
    idx = bisect.bisect_right(cum_dist, target_dist) - 1
    idx = max(0, min(idx, len(path) - 2))

    seg_start = cum_dist[idx]
    seg_end = cum_dist[idx + 1]
    seg_len = seg_end - seg_start

    if seg_len < 1e-10:
        return path[idx][0], path[idx][1]

    t = (target_dist - seg_start) / seg_len
    t = max(0.0, min(1.0, t))

    lat = path[idx][0] + t * (path[idx + 1][0] - path[idx][0])
    lon = path[idx][1] + t * (path[idx + 1][1] - path[idx][1])
    return lat, lon


def heading_at(path, cum_dist, target_dist):
    idx = bisect.bisect_right(cum_dist, target_dist) - 1
    idx = max(0, min(idx, len(path) - 2))
    return bearing(path[idx], path[idx + 1])
