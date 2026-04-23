const TILES = {
    default: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    kawaii: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
};

const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

export class ThemeManager {
    constructor(map) {
        this.map = map;
        this._tileLayer = null;
        this._listeners = [];
        this._btn = null;
        this._current = localStorage.getItem('driftwood_theme') || 'default';
        this._apply(this._current);
    }

    setButton(btn) {
        this._btn = btn;
        this._updateButton();
    }

    toggle() {
        this._current = this._current === 'kawaii' ? 'default' : 'kawaii';
        localStorage.setItem('driftwood_theme', this._current);
        this._apply(this._current);
        for (const fn of this._listeners) fn(this._current);
    }

    isKawaii() { return this._current === 'kawaii'; }

    accent() {
        return getComputedStyle(document.documentElement).getPropertyValue('--amber').trim() || '#f59e0b';
    }

    onChange(fn) { this._listeners.push(fn); }

    _apply(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        if (this._tileLayer) this.map.removeLayer(this._tileLayer);
        this._tileLayer = L.tileLayer(TILES[theme], {
            attribution: ATTRIBUTION,
            subdomains: 'abcd',
            maxZoom: 20,
            keepBuffer: 25,
        }).addTo(this.map);
        this._updateButton();
    }

    _updateButton() {
        if (!this._btn) return;
        if (this._current === 'kawaii') {
            this._btn.textContent = '✿ kawaii';
            this._btn.classList.add('active');
        } else {
            this._btn.textContent = '✿';
            this._btn.classList.remove('active');
        }
    }
}
