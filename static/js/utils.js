export const MPH_PER_MPS = 2.2369362920544;

export function mpsToMph(mps) {
    return mps * MPH_PER_MPS;
}

export function mphToMps(mph) {
    return mph / MPH_PER_MPS;
}

export function formatSpeed(mps, unit = 'mps') {
    if (unit === 'mph') return `${mpsToMph(mps).toFixed(1)} mph`;
    return `${mps.toFixed(1)} m/s`;
}

export function formatDistance(meters) {
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(2)} km`;
}

export function formatTime(seconds) {
    const s = Math.floor(seconds);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function formatCoords(lat, lon) {
    return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
}

export function speedPresetName(mps) {
    if (mps <= 2.0) return 'Walk';
    if (mps <= 4.0) return 'Jog';
    if (mps <= 8.0) return 'Bike';
    return 'Drive';
}
