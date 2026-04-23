export class RouteBuilder {
    constructor(map) {
        this.map = map;
        this.waypoints = [];
        this.polyline = null;
        this.snappedPath = null;
        this.snapEnabled = false;
        this._routeName = 'untitled';
        this._listeners = [];
        this._markerIcon = L.divIcon({
            className: 'waypoint-marker',
            html: '',
            iconSize: [24, 24],
            iconAnchor: [12, 12],
        });

        this._injectMarkerStyles();
        this.map.on('click', (e) => this.addWaypoint(e.latlng.lat, e.latlng.lng));
    }

    _injectMarkerStyles() {
        if (document.getElementById('wp-marker-styles')) return;
        const style = document.createElement('style');
        style.id = 'wp-marker-styles';
        style.textContent = `
            .waypoint-marker {
                background: #b45309;
                border: 2px solid #f59e0b;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 10px;
                font-weight: 700;
                color: white;
                font-family: 'SF Mono', monospace;
                box-shadow: 0 0 8px rgba(245, 158, 11, 0.4);
            }
            .position-marker {
                width: 16px;
                height: 16px;
                background: #f59e0b;
                border: 3px solid white;
                border-radius: 50%;
                box-shadow: 0 0 12px rgba(245, 158, 11, 0.6);
            }
        `;
        document.head.appendChild(style);
    }

    onChange(fn) {
        this._listeners.push(fn);
    }

    _emit() {
        for (const fn of this._listeners) fn();
    }

    addWaypoint(lat, lon) {
        const idx = this.waypoints.length;
        const icon = L.divIcon({
            className: 'waypoint-marker',
            html: `${idx + 1}`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
        });

        const marker = L.marker([lat, lon], { icon, draggable: true }).addTo(this.map);

        marker.on('dragend', () => {
            const pos = marker.getLatLng();
            const wp = this.waypoints.find(w => w.marker === marker);
            if (wp) {
                wp.lat = pos.lat;
                wp.lon = pos.lng;
                this._updateLine();
                if (this.snapEnabled) this.snapToRoads();
                this._emit();
            }
        });

        this.waypoints.push({
            lat, lon, marker,
            arrivalTime: null,
            dwellTime: null,
            label: null,
        });

        this._updateLine();
        if (this.snapEnabled && this.waypoints.length >= 2) this.snapToRoads();
        this._emit();
    }

    removeWaypoint(index) {
        if (index < 0 || index >= this.waypoints.length) return;
        const wp = this.waypoints[index];
        wp.marker.remove();
        this.waypoints.splice(index, 1);
        this._renumberMarkers();
        this._updateLine();
        if (this.snapEnabled && this.waypoints.length >= 2) this.snapToRoads();
        this._emit();
    }

    _renumberMarkers() {
        this.waypoints.forEach((wp, i) => {
            wp.marker.setIcon(L.divIcon({
                className: 'waypoint-marker',
                html: `${i + 1}`,
                iconSize: [24, 24],
                iconAnchor: [12, 12],
            }));
        });
    }

    _updateLine() {
        if (this.polyline) {
            this.polyline.remove();
            this.polyline = null;
        }
        if (this.snappedPath && this.snappedPath.length >= 2) {
            this.polyline = L.polyline(this.snappedPath, {
                color: '#f59e0b',
                weight: 3,
                opacity: 0.8,
            }).addTo(this.map);
        } else if (this.waypoints.length >= 2) {
            const coords = this.waypoints.map(w => [w.lat, w.lon]);
            this.polyline = L.polyline(coords, {
                color: '#f59e0b',
                weight: 3,
                opacity: 0.8,
            }).addTo(this.map);
        }
    }

    async snapToRoads() {
        if (this.waypoints.length < 2) return;
        const coords = this.waypoints.map(w => `${w.lon},${w.lat}`).join(';');
        try {
            const resp = await fetch(`/api/proxy/osrm/route?coords=${coords}`);
            const data = await resp.json();
            if (data.routes && data.routes[0]) {
                const geom = data.routes[0].geometry.coordinates;
                this.snappedPath = geom.map(c => [c[1], c[0]]);
                this._updateLine();
            }
        } catch (e) {
            console.warn('OSRM snap failed:', e);
        }
    }

    clearRoute() {
        for (const wp of this.waypoints) wp.marker.remove();
        this.waypoints = [];
        this.snappedPath = null;
        if (this.polyline) {
            this.polyline.remove();
            this.polyline = null;
        }
        this._routeName = 'untitled';
        this._emit();
    }

    toRoute() {
        return {
            name: this._routeName,
            waypoints: this.waypoints.map(w => ({
                lat: w.lat,
                lon: w.lon,
                arrival_time: w.arrivalTime,
                dwell_time: w.dwellTime,
                label: w.label,
            })),
            snapped_path: this.snappedPath,
        };
    }

    loadRoute(route) {
        this.clearRoute();
        this._routeName = route.name || 'untitled';
        if (route.snapped_path) this.snappedPath = route.snapped_path;

        const wps = route.waypoints || [];
        for (const w of wps) {
            const idx = this.waypoints.length;
            const icon = L.divIcon({
                className: 'waypoint-marker',
                html: `${idx + 1}`,
                iconSize: [24, 24],
                iconAnchor: [12, 12],
            });
            const marker = L.marker([w.lat, w.lon], { icon, draggable: true }).addTo(this.map);
            marker.on('dragend', () => {
                const pos = marker.getLatLng();
                const wp = this.waypoints.find(x => x.marker === marker);
                if (wp) {
                    wp.lat = pos.lat;
                    wp.lon = pos.lng;
                    this._updateLine();
                    this._emit();
                }
            });
            this.waypoints.push({
                lat: w.lat, lon: w.lon, marker,
                arrivalTime: w.arrival_time || null,
                dwellTime: w.dwell_time || null,
                label: w.label || null,
            });
        }

        this._updateLine();
        if (this.waypoints.length > 0) {
            const bounds = L.latLngBounds(this.waypoints.map(w => [w.lat, w.lon]));
            this.map.fitBounds(bounds, { padding: [50, 50] });
        }
        this._emit();
    }
}
