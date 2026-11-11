export class TrailRenderer {
    constructor(map) {
        this.map = map;
        this.points = [];
        this.line = null;
        this.posMarker = null;
        this.TRAIL_LENGTH = 2400;
    }

    addPoint(lat, lon) {
        this.points.push([lat, lon]);
        if (this.points.length > this.TRAIL_LENGTH) this.points.shift();
        this._render();
        this.setPosition(lat, lon);
    }

    setPosition(lat, lon) {
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

    refresh() {
        if (this.line) {
            this.line.remove();
            this.line = null;
        }
        this._render();
    }

    _render() {
        if (this.points.length < 2) return;
        if (this.line) {
            this.line.setLatLngs(this.points.slice());
        } else {
            this.line = L.polyline(this.points.slice(), { colorVar: '--trail', color: '#38bdf8', weight: 5, opacity: 0.95 }).addTo(this.map);
        }
    }

    clear() {
        if (this.line) {
            this.line.remove();
            this.line = null;
        }
        this.points = [];
        if (this.posMarker) {
            this.posMarker.remove();
            this.posMarker = null;
        }
    }
}
