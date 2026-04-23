export class RouteBuilder {
    constructor(map) {
        this.map = map;
        this.waypoints = [];
        this.polyline = null;
        this.snappedPath = null;
        this.snapEnabled = false;
        this._routeName = 'untitled';
        this._listeners = [];
        this._snapRequestId = 0;
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
                background: var(--amber-dim, #b45309);
                border: 2px solid var(--amber, #f59e0b);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 10px;
                font-weight: 700;
                color: white;
                font-family: 'SF Mono', monospace;
                box-shadow: 0 0 8px var(--marker-glow, rgba(245, 158, 11, 0.4));
            }
            .position-marker {
                width: 16px;
                height: 16px;
                background: var(--amber, #f59e0b);
                border: 3px solid white;
                border-radius: 50%;
                box-shadow: 0 0 12px var(--marker-glow, rgba(245, 158, 11, 0.6));
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

    notifyMetadataChanged() {
        this._emit();
    }

    _onGeometryChanged() {
        this.snappedPath = null;
        this._updateLine();
        if (this.snapEnabled && this.waypoints.length >= 2) void this.snapToRoads();
        this._emit();
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
                this._onGeometryChanged();
            }
        });

        this.waypoints.push({
            lat, lon, marker,
            arrivalTime: null,
            dwellTime: null,
            label: null,
        });

        this._onGeometryChanged();
    }

    removeWaypoint(index) {
        if (index < 0 || index >= this.waypoints.length) return;
        const wp = this.waypoints[index];
        wp.marker.remove();
        this.waypoints.splice(index, 1);
        this._renumberMarkers();
        this._onGeometryChanged();
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

    _accent() {
        return getComputedStyle(document.documentElement).getPropertyValue('--amber').trim() || '#f59e0b';
    }

    _updateLine() {
        if (this.polyline) {
            this.polyline.remove();
            this.polyline = null;
        }
        const color = this._accent();
        if (this.snappedPath && this.snappedPath.length >= 2) {
            this.polyline = L.polyline(this.snappedPath, {
                color,
                weight: 3,
                opacity: 0.8,
            }).addTo(this.map);
        } else if (this.waypoints.length >= 2) {
            const coords = this.waypoints.map(w => [w.lat, w.lon]);
            this.polyline = L.polyline(coords, {
                color,
                weight: 3,
                opacity: 0.8,
            }).addTo(this.map);
        }
    }

    refreshColors() {
        this._updateLine();
    }

    async snapToRoads() {
        if (this.waypoints.length < 2) return;
        const reqId = ++this._snapRequestId;
        const snapped = [];

        for (let i = 0; i < this.waypoints.length - 1; i++) {
            const a = this.waypoints[i];
            const b = this.waypoints[i + 1];
            const segment = await this._snapSegment(a, b);
            if (reqId !== this._snapRequestId) return;

            const fallback = [[a.lat, a.lon], [b.lat, b.lon]];
            this._appendSegment(snapped, segment && segment.length >= 2 ? segment : fallback);
        }

        if (reqId !== this._snapRequestId) return;
        this.snappedPath = snapped.length >= 2 ? snapped : null;
        this._updateLine();
        this._emit();
    }

    async _snapSegment(a, b) {
        const coords = `${a.lon},${a.lat};${b.lon},${b.lat}`;
        try {
            const resp = await fetch(`/api/proxy/osrm/route?coords=${encodeURIComponent(coords)}`);
            if (!resp.ok) return null;
            const data = await resp.json();
            if (!data.routes || !data.routes[0] || !data.routes[0].geometry) return null;
            const geom = data.routes[0].geometry.coordinates;
            return geom.map(c => [c[1], c[0]]);
        } catch {
            return null;
        }
    }

    _appendSegment(target, segment) {
        if (!segment || segment.length === 0) return;
        if (target.length === 0) {
            target.push(...segment);
            return;
        }
        const [lastLat, lastLon] = target[target.length - 1];
        const [firstLat, firstLon] = segment[0];
        if (Math.abs(lastLat - firstLat) < 1e-9 && Math.abs(lastLon - firstLon) < 1e-9) {
            target.push(...segment.slice(1));
        } else {
            target.push(...segment);
        }
    }

    undo() {
        if (this.waypoints.length === 0) return;
        const wp = this.waypoints[this.waypoints.length - 1];
        wp.marker.remove();
        this.waypoints.pop();
        this._renumberMarkers();
        this._onGeometryChanged();
    }

    clearRoute() {
        this._snapRequestId++;
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
        let dayOffset = 0;
        let previousArrival = null;

        return {
            name: this._routeName,
            waypoints: this.waypoints.map(w => {
                let arrival = w.arrivalTime;
                if (arrival != null) {
                    let absolute = arrival + dayOffset * 86400;
                    if (previousArrival != null && absolute < previousArrival) {
                        while (absolute < previousArrival) absolute += 86400;
                        dayOffset = Math.floor(absolute / 86400);
                    }
                    previousArrival = absolute;
                    arrival = absolute;
                }
                return {
                    lat: w.lat,
                    lon: w.lon,
                    arrival_time: arrival,
                    dwell_time: w.dwellTime,
                    label: w.label,
                };
            }),
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
                    this._onGeometryChanged();
                }
            });
            this.waypoints.push({
                lat: w.lat, lon: w.lon, marker,
                arrivalTime: w.arrival_time == null ? null : ((w.arrival_time % 86400) + 86400) % 86400,
                dwellTime: w.dwell_time ?? null,
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
