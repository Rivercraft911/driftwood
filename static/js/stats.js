import { formatSpeed, formatDistance, formatTime, formatCoords } from './utils.js';

export class StatsDisplay {
    constructor() {
        this.elSpeed = document.getElementById('stat-speed');
        this.elDist = document.getElementById('stat-distance');
        this.elElapsed = document.getElementById('stat-elapsed');
        this.elRemaining = document.getElementById('stat-remaining');
        this.elCoords = document.getElementById('stat-coords');
    }

    update(data) {
        this.elSpeed.textContent = formatSpeed(data.speed_mps);
        this.elDist.textContent = formatDistance(data.distance_m);
        this.elElapsed.textContent = formatTime(data.elapsed_s);
        this.elCoords.textContent = formatCoords(data.lat, data.lon);

        if (data.speed_mps > 0 && data.total_distance_m > 0) {
            const remaining = (data.total_distance_m - data.distance_m) / data.speed_mps;
            this.elRemaining.textContent = formatTime(Math.max(0, remaining));
        } else {
            this.elRemaining.textContent = '--:--';
        }
    }

    reset() {
        this.elSpeed.textContent = '0 m/s';
        this.elDist.textContent = '0 m';
        this.elElapsed.textContent = '0:00';
        this.elRemaining.textContent = '--:--';
        this.elCoords.textContent = '--';
    }
}
