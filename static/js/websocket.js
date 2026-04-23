export class DriftwoodSocket {
    constructor() {
        this._ws = null;
        this._listeners = {};
        this._reconnectDelay = 1000;
        this._maxReconnectDelay = 10000;
        this._currentDelay = this._reconnectDelay;
    }

    connect() {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        this._ws = new WebSocket(`${proto}//${location.host}/api/playback/ws`);

        this._ws.onopen = () => {
            this._currentDelay = this._reconnectDelay;
        };

        this._ws.onmessage = (e) => {
            const msg = JSON.parse(e.data);
            const fns = this._listeners[msg.type] || [];
            for (const fn of fns) fn(msg);
        };

        this._ws.onclose = () => {
            setTimeout(() => this.connect(), this._currentDelay);
            this._currentDelay = Math.min(this._currentDelay * 1.5, this._maxReconnectDelay);
        };

        this._ws.onerror = () => {};
    }

    on(type, fn) {
        (this._listeners[type] ||= []).push(fn);
    }

    send(msg) {
        if (this._ws && this._ws.readyState === WebSocket.OPEN) {
            this._ws.send(JSON.stringify(msg));
        }
    }
}
