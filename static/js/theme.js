export class ThemeManager {
    constructor(map) {
        this.map = map;
        this._listeners = [];
        this._btn = null;
        this._layerBtn = null;
        this._current = localStorage.getItem('driftwood_theme') || 'default';
        this._mapLayer = localStorage.getItem('driftwood_map_layer') === 'satellite' ? 'satellite' : 'streets';
        this._apply(this._current);
    }

    setButton(btn) {
        this._btn = btn;
        this._updateButton();
    }

    setLayerButton(btn) {
        this._layerBtn = btn;
        this._updateLayerButton();
    }

    toggle() {
        this._current = this._current === 'kawaii' ? 'default' : 'kawaii';
        localStorage.setItem('driftwood_theme', this._current);
        this._apply(this._current);
        for (const fn of this._listeners) fn(this._current);
    }

    toggleMapLayer() {
        this._mapLayer = this._mapLayer === 'satellite' ? 'streets' : 'satellite';
        localStorage.setItem('driftwood_map_layer', this._mapLayer);
        this._apply(this._current);
    }

    isKawaii() { return this._current === 'kawaii'; }

    accent() {
        return getComputedStyle(document.documentElement).getPropertyValue('--amber').trim() || '#f59e0b';
    }

    onChange(fn) { this._listeners.push(fn); }

    _apply(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        this.map.setBaseStyle({ layer: this._mapLayer, theme });
        this._updateButton();
        this._updateLayerButton();
    }

    _updateButton() {
        if (!this._btn) return;
        if (this._current === 'kawaii') {
            this._btn.textContent = 'kawaii';
            this._btn.classList.add('active');
        } else {
            this._btn.textContent = 'Theme';
            this._btn.classList.remove('active');
        }
    }

    _updateLayerButton() {
        if (!this._layerBtn) return;
        if (this._mapLayer === 'satellite') {
            this._layerBtn.textContent = 'Sat';
            this._layerBtn.title = 'Map layer: satellite';
            this._layerBtn.classList.add('active');
        } else {
            this._layerBtn.textContent = 'Map';
            this._layerBtn.title = 'Map layer: streets';
            this._layerBtn.classList.remove('active');
        }
    }
}
