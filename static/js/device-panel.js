export class DevicePanel {
    constructor(ws) {
        this.ws = ws;
        this.dot = document.querySelector('.device-dot');
        this.label = document.querySelector('.device-label');
        this._pollDevices();
        setInterval(() => this._pollDevices(), 3000);
    }

    async _pollDevices() {
        try {
            const resp = await fetch('/api/devices');
            const devices = await resp.json();
            if (devices.length === 0) {
                this.dot.className = 'device-dot';
                this.label.textContent = 'No device';
                this._setClickable(null);
                return;
            }
            const active = devices.find(d => d.active);
            if (active) {
                this.dot.className = active.connected ? 'device-dot connected' : 'device-dot error';
                this.label.textContent = active.connected ? active.name : `${active.name} reconnecting...`;
                this._setClickable(null);
            } else {
                this.dot.className = 'device-dot';
                this.label.textContent = `${devices.length} device${devices.length > 1 ? 's' : ''} found`;
                this._setClickable(() => this._autoConnect(devices[0].udid));
            }
        } catch {
            this.dot.className = 'device-dot';
            this.label.textContent = 'No device';
            this._setClickable(null);
        }
    }

    _setClickable(handler) {
        this.label.onclick = handler;
        this.label.style.cursor = handler ? 'pointer' : 'default';
    }

    async _autoConnect(udid) {
        try {
            this.label.textContent = 'Connecting...';
            const resp = await fetch(`/api/devices/${udid}/select`, { method: 'POST' });
            if (resp.ok) {
                this._pollDevices();
            } else {
                const data = await resp.json();
                this.dot.className = 'device-dot error';
                this.label.textContent = data.detail || 'Connection failed';
            }
        } catch {
            this.dot.className = 'device-dot error';
            this.label.textContent = 'Connection failed';
        }
    }

    onDeviceEvent(msg) {
        this._pollDevices();
    }
}
