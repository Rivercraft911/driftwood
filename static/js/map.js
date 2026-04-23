const DEFAULT_STYLES = {
    streets: 'mapbox://styles/mapbox/standard',
    satellite: 'mapbox://styles/mapbox/standard-satellite',
};

let lineId = 0;

function normalizeLatLng(value) {
    if (Array.isArray(value)) return { lat: Number(value[0]), lng: Number(value[1]) };
    return {
        lat: Number(value.lat),
        lng: Number(value.lng ?? value.lon),
    };
}

function toLngLat(value) {
    const pos = normalizeLatLng(value);
    return [pos.lng, pos.lat];
}

function lightPresetForTheme(theme) {
    return theme === 'kawaii' ? 'day' : 'night';
}

class LatLngBounds {
    constructor(coords = []) {
        this._coords = [];
        for (const coord of coords) this.extend(coord);
    }

    extend(coord) {
        this._coords.push(normalizeLatLng(coord));
        return this;
    }
}

class MapboxMarker {
    constructor(latlng, options = {}) {
        this._latlng = normalizeLatLng(latlng);
        this._options = options;
        this._listeners = new Map();
        this._marker = null;
        this._map = null;
        this._element = document.createElement('div');
        this._applyIcon(options.icon);
        if (options.zIndexOffset != null) this._element.style.zIndex = String(options.zIndexOffset);
    }

    addTo(map) {
        this._map = map;
        if (!map._map || !globalThis.mapboxgl) return this;

        this._marker = new mapboxgl.Marker({
            element: this._element,
            draggable: Boolean(this._options.draggable),
            anchor: 'center',
        })
            .setLngLat([this._latlng.lng, this._latlng.lat])
            .addTo(map._map);

        if (this._options.draggable) {
            this._marker.on('dragend', () => {
                const pos = this._marker.getLngLat();
                this._latlng = { lat: pos.lat, lng: pos.lng };
                this._emit('dragend', { target: this });
            });
        }

        return this;
    }

    on(type, handler) {
        if (!this._listeners.has(type)) this._listeners.set(type, []);
        this._listeners.get(type).push(handler);
        return this;
    }

    getLatLng() {
        if (this._marker) {
            const pos = this._marker.getLngLat();
            this._latlng = { lat: pos.lat, lng: pos.lng };
        }
        return { ...this._latlng };
    }

    setLatLng(latlng) {
        this._latlng = normalizeLatLng(latlng);
        if (this._marker) this._marker.setLngLat([this._latlng.lng, this._latlng.lat]);
        return this;
    }

    setIcon(icon) {
        this._applyIcon(icon);
        return this;
    }

    remove() {
        if (this._marker) {
            this._marker.remove();
            this._marker = null;
        }
    }

    _emit(type, event) {
        for (const handler of this._listeners.get(type) || []) handler(event);
    }

    _applyIcon(icon = {}) {
        this._icon = icon;
        this._element.className = icon.className || '';
        this._element.innerHTML = icon.html || '';
        if (Array.isArray(icon.iconSize)) {
            this._element.style.width = `${icon.iconSize[0]}px`;
            this._element.style.height = `${icon.iconSize[1]}px`;
        }
    }
}

class MapboxPolyline {
    constructor(coords, options = {}) {
        this._coords = coords;
        this._options = options;
        this._map = null;
        this._sourceId = `driftwood-line-source-${++lineId}`;
        this._layerId = `driftwood-line-layer-${lineId}`;
    }

    addTo(map) {
        this._map = map;
        map._registerLine(this);
        return this;
    }

    remove() {
        if (this._map) this._map._unregisterLine(this);
        this._map = null;
    }

    geojson() {
        return {
            type: 'Feature',
            properties: {},
            geometry: {
                type: 'LineString',
                coordinates: this._coords.map(toLngLat),
            },
        };
    }

    paint() {
        return {
            'line-color': this._options.color || '#f59e0b',
            'line-width': this._options.weight || 3,
            'line-opacity': this._options.opacity ?? 1,
            'line-emissive-strength': 1,
        };
    }
}

class MapboxMapAdapter {
    constructor(elementId, clientConfig = {}) {
        this._element = document.getElementById(elementId);
        this._listeners = new Map();
        this._lineOverlays = new Set();
        this._styles = clientConfig.mapbox?.styles || DEFAULT_STYLES;
        this._layer = 'streets';
        this._activeLayer = 'streets';
        this._theme = 'default';
        this._center = [37.7749, -122.4194];
        this._zoom = 13;
        this._map = null;

        const token = clientConfig.mapbox?.accessToken;
        if (!token || !globalThis.mapboxgl) {
            this._showUnavailable();
            return;
        }

        mapboxgl.accessToken = token;
        this._map = new mapboxgl.Map({
            container: this._element,
            style: this._styles.streets || DEFAULT_STYLES.streets,
            center: [-122.4194, 37.7749],
            zoom: this._zoom,
            projection: 'globe',
            attributionControl: true,
            config: {
                basemap: { lightPreset: lightPresetForTheme(this._theme) },
            },
        });

        this._map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');
        this._map.on('style.load', () => {
            this._applyGlobe();
            this._applyLightPreset();
            for (const line of this._lineOverlays) this._renderLine(line);
        });
        this._map.on('click', (event) => {
            this._emit('click', {
                latlng: { lat: event.lngLat.lat, lng: event.lngLat.lng },
                originalEvent: event,
            });
        });
        this._map.on('dragstart', (event) => this._emit('dragstart', event));
    }

    on(type, handler) {
        if (!this._listeners.has(type)) this._listeners.set(type, []);
        this._listeners.get(type).push(handler);
        return this;
    }

    setView(latlng, zoom = this.getZoom(), options = {}) {
        const pos = normalizeLatLng(latlng);
        this._center = [pos.lat, pos.lng];
        this._zoom = zoom;
        if (!this._map) return this;
        const target = { center: [pos.lng, pos.lat], zoom };
        if (options.animate === false) this._map.jumpTo(target);
        else this._map.easeTo(target);
        return this;
    }

    getZoom() {
        return this._map ? this._map.getZoom() : this._zoom;
    }

    fitBounds(bounds, options = {}) {
        const coords = bounds?._coords || bounds || [];
        if (!Array.isArray(coords) || coords.length === 0) return this;
        if (coords.length === 1) return this.setView(coords[0], Math.max(this.getZoom(), 15), { animate: false });
        if (!this._map || !globalThis.mapboxgl) return this;

        const mbBounds = new mapboxgl.LngLatBounds();
        for (const coord of coords) mbBounds.extend(toLngLat(coord));
        const padding = Array.isArray(options.padding)
            ? Math.max(...options.padding)
            : options.padding ?? 50;
        this._map.fitBounds(mbBounds, { padding, maxZoom: options.maxZoom || 17 });
        return this;
    }

    setBaseStyle({ layer, theme }) {
        this._layer = layer === 'satellite' ? 'satellite' : 'streets';
        this._theme = theme === 'kawaii' ? 'kawaii' : 'default';
        if (!this._map) return;

        const nextStyle = this._styles[this._layer] || DEFAULT_STYLES[this._layer];
        if (this._activeLayer === this._layer) {
            this._applyLightPreset();
            return;
        }

        this._activeLayer = this._layer;
        this._map.setStyle(nextStyle);
    }

    _emit(type, event) {
        for (const handler of this._listeners.get(type) || []) handler(event);
    }

    _registerLine(line) {
        this._lineOverlays.add(line);
        this._renderLine(line);
    }

    _unregisterLine(line) {
        this._lineOverlays.delete(line);
        if (!this._map || !this._map.isStyleLoaded()) return;
        if (this._map.getLayer(line._layerId)) this._map.removeLayer(line._layerId);
        if (this._map.getSource(line._sourceId)) this._map.removeSource(line._sourceId);
    }

    _renderLine(line) {
        if (!this._map || !this._map.isStyleLoaded()) return;
        if (this._map.getSource(line._sourceId)) {
            this._map.getSource(line._sourceId).setData(line.geojson());
            if (this._map.getLayer(line._layerId)) {
                for (const [key, value] of Object.entries(line.paint())) {
                    this._map.setPaintProperty(line._layerId, key, value);
                }
            }
            return;
        }

        this._map.addSource(line._sourceId, {
            type: 'geojson',
            data: line.geojson(),
        });
        this._map.addLayer({
            id: line._layerId,
            type: 'line',
            source: line._sourceId,
            layout: {
                'line-cap': 'round',
                'line-join': 'round',
            },
            paint: line.paint(),
        });
    }

    _applyGlobe() {
        if (!this._map) return;
        if (this._map.setProjection) this._map.setProjection('globe');
        if (this._map.setFog) this._map.setFog({});
    }

    _applyLightPreset() {
        if (!this._map || !this._map.setConfigProperty) return;
        try {
            this._map.setConfigProperty('basemap', 'lightPreset', lightPresetForTheme(this._theme));
        } catch {
            // Older style loads can briefly reject config changes while swapping styles.
        }
    }

    _showUnavailable() {
        this._element.classList.add('map-unavailable');
        this._element.innerHTML = '<div class="map-unavailable-message">Mapbox token missing. Add MAPBOX_ACCESS_TOKEN to .env and restart Driftwood.</div>';
    }
}

function installLeafletShim() {
    globalThis.L = {
        divIcon: (options = {}) => ({ ...options }),
        marker: (latlng, options = {}) => new MapboxMarker(latlng, options),
        polyline: (coords, options = {}) => new MapboxPolyline(coords, options),
        latLngBounds: (coords = []) => new LatLngBounds(coords),
    };
}

export function initMap(elementId, clientConfig = {}) {
    installLeafletShim();
    return new MapboxMapAdapter(elementId, clientConfig);
}
