from .geo import haversine


def derive_segment_speeds(waypoints, waypoint_distances):
    speeds = []
    for i in range(1, len(waypoints)):
        w_prev, w_curr = waypoints[i - 1], waypoints[i]
        if w_curr.arrival_time is not None and w_prev.arrival_time is not None:
            time_delta = w_curr.arrival_time - w_prev.arrival_time
            if w_prev.dwell_time:
                time_delta -= w_prev.dwell_time
            if time_delta <= 0:
                speeds.append(1.4)
            else:
                dist = waypoint_distances[i] - waypoint_distances[i - 1]
                speeds.append(max(0.1, dist / time_delta))
        else:
            speeds.append(None)
    return speeds
