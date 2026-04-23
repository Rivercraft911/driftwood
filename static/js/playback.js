export class PlaybackControls {
    constructor(ws, builder) {
        this.ws = ws;
        this.builder = builder;
        this.state = 'idle';
        this.loopMode = 'none';
        this.speed = 1.4;

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

        this.jitterToggle = document.getElementById('jitter-toggle');
        this.easingToggle = document.getElementById('easing-toggle');
        this.driftToggle = document.getElementById('drift-toggle');

        this._bindEvents();
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
        };

        this.slider.oninput = () => {
            this.speed = parseFloat(this.slider.value);
            this.speedLabel.textContent = `${this.speed.toFixed(1)} m/s`;
            this._updatePresetHighlight();
            if (this.state === 'playing') this._sendConfig();
        };

        this.presets.forEach(btn => {
            btn.onclick = () => {
                this.speed = parseFloat(btn.dataset.speed);
                this.slider.value = this.speed;
                this.speedLabel.textContent = `${this.speed.toFixed(1)} m/s`;
                this._updatePresetHighlight();
                if (this.state === 'playing') this._sendConfig();
            };
        });

        this._setupScrub();

        [this.jitterToggle, this.easingToggle, this.driftToggle].forEach(t => {
            t.onchange = () => { if (this.state === 'playing') this._sendConfig(); };
        });
    }

    _updatePresetHighlight() {
        this.presets.forEach(btn => {
            const s = parseFloat(btn.dataset.speed);
            btn.classList.toggle('active', Math.abs(s - this.speed) < 0.2);
        });
    }

    _play() {
        if (this.state === 'paused') {
            this.ws.send({ type: 'resume' });
            return;
        }

        const route = this.builder.toRoute();
        if (!route.waypoints || route.waypoints.length < 2) return;

        fetch('/api/routes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(route),
        }).then(() => {
            this.ws.send({
                type: 'play',
                route_name: route.name,
                speed_mps: this.speed,
                loop_mode: this.loopMode,
                realism: {
                    jitter_enabled: this.jitterToggle.checked,
                    easing_enabled: this.easingToggle.checked,
                    drift_enabled: this.driftToggle.checked,
                },
            });
        });
    }

    _sendConfig() {
        this.ws.send({
            type: 'config',
            config: {
                speed_mps: this.speed,
                loop_mode: this.loopMode,
                realism: {
                    jitter_enabled: this.jitterToggle.checked,
                    easing_enabled: this.easingToggle.checked,
                    drift_enabled: this.driftToggle.checked,
                },
            },
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
            this.updateProgress(0);
        }
    }
}
