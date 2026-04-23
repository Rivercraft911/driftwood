import { mpsToMph, mphToMps } from './utils.js';

const MIN_SPEED_MPS = 0.1;
const MAX_SPEED_MPS = 71.53;

export class PlaybackControls {
    constructor(ws, builder) {
        this.ws = ws;
        this.builder = builder;
        this.state = 'idle';
        this.loopMode = 'none';
        this.speedMps = 1.4;
        this.speedUnit = localStorage.getItem('driftwood_speed_unit') === 'mps' ? 'mps' : 'mph';
        this.useArrivalTimes = false;
        this.deviceUpdateInterval = 0.25;
        this._routeUpdateTimer = null;
        this.onSpeedUnitChange = null;

        this.btnPlay = document.getElementById('btn-play');
        this.btnPause = document.getElementById('btn-pause');
        this.btnStop = document.getElementById('btn-stop');
        this.btnLoop = document.getElementById('btn-loop');
        this.slider = document.getElementById('speed-slider');
        this.speedLabel = document.getElementById('speed-label');
        this.scrubBar = document.getElementById('scrub-bar');
        this.scrubProgress = document.getElementById('scrub-progress');
        this.scrubHandle = document.getElementById('scrub-handle');
        this.presets = document.querySelectorAll('.preset');
        this._activePreset = this.presets[0] || null;
        this.unitButtons = document.querySelectorAll('.unit-btn');

        this.btnUpdateRate = document.getElementById('btn-update-rate');
        this.updateRatePanel = document.getElementById('update-rate-panel');
        this.updateRateSlider = document.getElementById('update-rate-slider');
        this.updateRateLabel = document.getElementById('update-rate-label');

        this.jitterToggle = document.getElementById('jitter-toggle');
        this.easingToggle = document.getElementById('easing-toggle');
        this.driftToggle = document.getElementById('drift-toggle');

        this._bindEvents();
        this._renderSpeed();
        this._renderUpdateRate();
        this.builder.onChange(() => this._scheduleRouteUpdate());
    }

    getSpeedUnit() {
        return this.speedUnit;
    }

    _bindEvents() {
        this.btnPlay.onclick = () => this._play();
        this.btnPause.onclick = () => this.ws.send({ type: 'pause' });
        this.btnStop.onclick = () => this.ws.send({ type: 'stop' });

        this.btnLoop.onclick = () => {
            const modes = ['none', 'loop', 'bounce'];
            const idx = (modes.indexOf(this.loopMode) + 1) % modes.length;
            this.loopMode = modes[idx];
            this.btnLoop.classList.toggle('active', this.loopMode !== 'none');
            this.btnLoop.title = `Loop: ${this.loopMode}`;
            if (this.loopMode === 'bounce') this.btnLoop.textContent = '\u21C4';
            else this.btnLoop.textContent = '\u21BB';
            if (this._isConfigLive()) this._sendConfig();
        };

        this.slider.oninput = () => {
            const raw = parseFloat(this.slider.value);
            this.speedMps = this._normalizeSpeed(this._fromDisplaySpeed(raw));
            this._renderSpeed();
            if (this._isConfigLive()) this._sendConfig();
        };

        this.presets.forEach(btn => {
            btn.onclick = () => {
                this._activePreset = btn;
                this.speedMps = this._normalizeSpeed(parseFloat(btn.dataset.speed));
                this._renderSpeed();
                if (this._isConfigLive()) this._sendConfig();
            };
        });

        this.unitButtons.forEach(btn => {
            btn.onclick = () => {
                const unit = btn.dataset.unit === 'mps' ? 'mps' : 'mph';
                this._setSpeedUnit(unit);
            };
        });

        this.btnUpdateRate.onclick = () => {
            this.updateRatePanel.hidden = !this.updateRatePanel.hidden;
        };

        this.updateRateSlider.oninput = () => {
            this.deviceUpdateInterval = this._normalizeUpdateInterval(parseFloat(this.updateRateSlider.value));
            this._renderUpdateRate();
            if (this._isConfigLive()) this._sendConfig();
        };

        document.addEventListener('click', (e) => {
            if (this.updateRatePanel.hidden) return;
            if (e.target === this.btnUpdateRate || this.updateRatePanel.contains(e.target)) return;
            this.updateRatePanel.hidden = true;
        });

        this._setupScrub();

        [this.jitterToggle, this.easingToggle, this.driftToggle].forEach(t => {
            t.onchange = () => {
                if (this._isConfigLive()) this._sendConfig();
            };
        });
    }

    _isConfigLive() {
        return this.state === 'playing' || this.state === 'paused';
    }

    _normalizeSpeed(mps) {
        return Math.max(MIN_SPEED_MPS, Math.min(MAX_SPEED_MPS, mps));
    }

    _normalizeUpdateInterval(seconds) {
        return Math.max(0.25, Math.min(50.0, seconds));
    }

    _toDisplaySpeed(mps) {
        return this.speedUnit === 'mph' ? mpsToMph(mps) : mps;
    }

    _fromDisplaySpeed(value) {
        return this.speedUnit === 'mph' ? mphToMps(value) : value;
    }

    _speedBounds() {
        if (this._activePreset) {
            const minMps = parseFloat(this._activePreset.dataset.min ?? MIN_SPEED_MPS);
            const maxMps = parseFloat(this._activePreset.dataset.max ?? MAX_SPEED_MPS);
            if (this.speedUnit === 'mph') {
                return { min: mpsToMph(minMps).toFixed(1), max: mpsToMph(maxMps).toFixed(1), step: 0.1 };
            }
            return { min: minMps.toFixed(2), max: maxMps.toFixed(2), step: 0.05 };
        }
        if (this.speedUnit === 'mph') return { min: 0.5, max: 160, step: 0.1 };
        return { min: 0.1, max: 71.5, step: 0.1 };
    }

    _formatSpeedLabel() {
        const display = this._toDisplaySpeed(this.speedMps);
        const suffix = this.speedUnit === 'mph' ? 'mph' : 'm/s';
        return `${display.toFixed(1)} ${suffix}`;
    }

    _formatUpdateRateLabel(seconds) {
        if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
        if (seconds >= 10) return `${seconds.toFixed(0)}s`;
        const rounded = Math.round(seconds * 100) / 100;
        return `${rounded.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')}s`;
    }

    _setSpeedUnit(unit) {
        if (unit === this.speedUnit) return;
        this.speedUnit = unit;
        localStorage.setItem('driftwood_speed_unit', this.speedUnit);
        this._renderSpeed();
    }

    _renderSpeed() {
        const bounds = this._speedBounds();
        this.slider.min = String(bounds.min);
        this.slider.max = String(bounds.max);
        this.slider.step = String(bounds.step);
        this.slider.value = this._toDisplaySpeed(this.speedMps).toFixed(1);
        this.speedLabel.textContent = this._formatSpeedLabel();

        this.unitButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.unit === this.speedUnit);
        });

        this._updatePresetHighlight();
        if (typeof this.onSpeedUnitChange === 'function') this.onSpeedUnitChange(this.speedUnit);
    }

    _renderUpdateRate() {
        this.updateRateSlider.value = this.deviceUpdateInterval.toString();
        this.updateRateLabel.textContent = this._formatUpdateRateLabel(this.deviceUpdateInterval);
    }

    _updatePresetHighlight() {
        this.presets.forEach(btn => {
            btn.classList.toggle('active', btn === this._activePreset);
        });
    }

    _buildConfig() {
        return {
            speed_mps: this.speedMps,
            use_arrival_times: this.useArrivalTimes,
            loop_mode: this.loopMode,
            device_update_interval_s: this.deviceUpdateInterval,
            realism: {
                jitter_enabled: this.jitterToggle.checked,
                easing_enabled: this.easingToggle.checked,
                drift_enabled: this.driftToggle.checked,
            },
        };
    }

    async _play() {
        if (this.state === 'paused') {
            this.ws.send({ type: 'resume' });
            return;
        }

        const deviceReady = await this._ensureDeviceReady();
        if (!deviceReady) return;

        const route = this.builder.toRoute();
        if (!route.waypoints || route.waypoints.length < 2) return;
        this.useArrivalTimes = route.waypoints.some(w => w.arrival_time != null);

        try {
            const resp = await fetch('/api/routes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(route),
            });
            if (!resp.ok) return;
            this.ws.send({
                type: 'play',
                route_name: route.name,
                ...this._buildConfig(),
            });
        } catch {}
    }

    async _ensureDeviceReady() {
        try {
            const resp = await fetch('/api/devices');
            if (!resp.ok) {
                alert('Could not check connected devices.');
                return false;
            }

            const devices = await resp.json();
            const active = devices.find(d => d.active);
            if (active) return true;

            if (!devices.length) {
                alert('No iPhone detected. Connect over USB, unlock it, and tap Trust.');
                return false;
            }

            const connectResp = await fetch(`/api/devices/${encodeURIComponent(devices[0].udid)}/select`, {
                method: 'POST',
            });

            if (!connectResp.ok) {
                const err = await connectResp.json().catch(() => ({}));
                alert(err.detail || 'Failed to connect to iPhone. Make sure tunnel is running.');
                return false;
            }

            return true;
        } catch {
            alert('Could not verify iPhone connection.');
            return false;
        }
    }

    _sendConfig() {
        this.ws.send({
            type: 'config',
            config: this._buildConfig(),
        });
    }

    _scheduleRouteUpdate() {
        if (!this._isConfigLive()) return;
        clearTimeout(this._routeUpdateTimer);
        this._routeUpdateTimer = setTimeout(() => {
            this._sendRouteUpdate();
        }, 120);
    }

    _sendRouteUpdate() {
        const route = this.builder.toRoute();
        if (!route.waypoints || route.waypoints.length < 2) return;
        this.useArrivalTimes = route.waypoints.some(w => w.arrival_time != null);
        this.ws.send({
            type: 'route_update',
            route,
            config: this._buildConfig(),
        });
    }

    _setupScrub() {
        let dragging = false;

        const scrub = (e) => {
            const rect = this.scrubBar.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            this.updateProgress(pct);
            this.ws.send({ type: 'scrub', progress: pct });
        };

        this.scrubBar.onmousedown = (e) => {
            dragging = true;
            scrub(e);
        };

        document.addEventListener('mousemove', (e) => {
            if (dragging) scrub(e);
        });

        document.addEventListener('mouseup', () => {
            dragging = false;
        });
    }

    updateProgress(progress) {
        const pct = `${(progress * 100).toFixed(1)}%`;
        this.scrubProgress.style.width = pct;
        this.scrubHandle.style.left = pct;
    }

    onStateChange(msg) {
        this.state = msg.state;
        this.btnPlay.hidden = this.state === 'playing';
        this.btnPause.hidden = this.state !== 'playing';

        if (this.state === 'idle') {
            clearTimeout(this._routeUpdateTimer);
            this.updateProgress(0);
        }
    }
}
