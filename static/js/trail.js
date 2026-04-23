export class TrailRenderer {
    constructor(map) {
        this.map = map;
        this.points = [];
        this.segments = [];
        this.posMarker = null;
        this.TRAIL_LENGTH = 80;
        this.FADE_DURATION = 20;
    }

    addPoint(lat, lon) {
        this.points.push({ lat, lon, ts: Date.now() });
        if (this.points.length > this.TRAIL_LENGTH) this.points.shift();
        this._render();
        this._updatePosition(lat, lon);
    }

    _updatePosition(lat, lon) {
        if (!this.posMarker) {
            this.posMarker = L.marker([lat, lon], {
                icon: L.divIcon({
                    className: 'position-marker',
                    iconSize: [16, 16],
                    iconAnchor: [8, 8],
                }),
                zIndexOffset: 1000,
            }).addTo(this.map);
        } else {
            this.posMarker.setLatLng([lat, lon]);
        }
    }

    _render() {
        for (const s of this.segments) s.remove();
        this.segments = [];
        const now = Date.now();
        for (let i = 1; i < this.points.length; i++) {
            const age = (now - this.points[i].ts) / 1000;
            const opacity = Math.max(0.05, 1 - age / this.FADE_DURATION);
            const seg = L.polyline(
                [[this.points[i - 1].lat, this.points[i - 1].lon],
                 [this.points[i].lat, this.points[i].lon]],
                { color: '#f59e0b', weight: 3, opacity }
            ).addTo(this.map);
            this.segments.push(seg);
        }
    }

    clear() {
        for (const s of this.segments) s.remove();
        this.segments = [];
        this.points = [];
        if (this.posMarker) {
            this.posMarker.remove();
            this.posMarker = null;
        }
    }
}
