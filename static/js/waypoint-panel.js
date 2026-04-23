export class WaypointPanel {
    constructor(builder) {
        this.builder = builder;
        this.list = document.getElementById('waypoint-list');
        this.empty = document.getElementById('route-empty');
        this.builder.onChange(() => this.render());
        this.render();
    }

    render() {
        const wps = this.builder.waypoints;
        this.list.innerHTML = '';
        this.empty.hidden = wps.length > 0;

        wps.forEach((wp, i) => {
            const li = document.createElement('li');
            li.className = 'waypoint-item';
            li.innerHTML = `
                <span class="waypoint-num">${i + 1}</span>
                <div style="flex:1;min-width:0">
                    <div class="waypoint-coords">${wp.lat.toFixed(6)}, ${wp.lon.toFixed(6)}</div>
                    <div class="waypoint-timing">
                        <input type="text" placeholder="Arrive" spellcheck="false"
                            value="${this._formatArrival(wp.arrivalTime)}" data-idx="${i}" data-field="arrival">
                        <input type="number" placeholder="Dwell min" step="0.1" min="0"
                            value="${this._formatMinutes(wp.dwellTime)}" data-idx="${i}" data-field="dwell">
                    </div>
                </div>
                <div class="waypoint-actions">
                    <button data-remove="${i}" title="Remove">&times;</button>
                </div>
            `;
            this.list.appendChild(li);
        });

        this.list.querySelectorAll('[data-remove]').forEach(btn => {
            btn.onclick = () => this.builder.removeWaypoint(parseInt(btn.dataset.remove));
        });

        this.list.querySelectorAll('[data-field]').forEach(input => {
            input.onchange = () => {
                const idx = parseInt(input.dataset.idx);
                const wp = this.builder.waypoints[idx];
                if (!wp) return;

                if (input.dataset.field === 'arrival') {
                    const parsed = this._parseArrival(input.value);
                    if (parsed == null && input.value.trim() !== '') {
                        input.value = this._formatArrival(wp.arrivalTime);
                        return;
                    }
                    wp.arrivalTime = parsed;
                    input.value = this._formatArrival(parsed);
                } else {
                    const trimmed = input.value.trim();
                    const mins = trimmed === '' ? null : parseFloat(trimmed);
                    if (mins == null || Number.isNaN(mins)) {
                        wp.dwellTime = null;
                        input.value = '';
                    } else {
                        wp.dwellTime = Math.max(0, mins * 60);
                        input.value = this._formatMinutes(wp.dwellTime);
                    }
                }
                this.builder.notifyMetadataChanged();
            };
        });
    }

    _formatMinutes(seconds) {
        if (seconds == null) return '';
        const minutes = seconds / 60;
        return Number.isInteger(minutes) ? `${minutes}` : minutes.toFixed(1).replace(/\.0$/, '');
    }

    _formatArrival(secondsOfDay) {
        if (secondsOfDay == null) return '';
        const total = ((Math.floor(secondsOfDay) % 86400) + 86400) % 86400;
        const hour24 = Math.floor(total / 3600);
        const minute = Math.floor((total % 3600) / 60);
        const suffix = hour24 >= 12 ? 'PM' : 'AM';
        const hour12 = (hour24 % 12) || 12;
        return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
    }

    _parseArrival(value) {
        const raw = value.trim();
        if (!raw) return null;
        const upper = raw.toUpperCase();

        const ampm = upper.match(/^(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM)$/);
        if (ampm) {
            let hour = parseInt(ampm[1], 10);
            const minute = ampm[2] ? parseInt(ampm[2], 10) : 0;
            if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
            hour = hour % 12;
            if (ampm[3] === 'PM') hour += 12;
            return hour * 3600 + minute * 60;
        }

        const twentyFour = raw.match(/^(\d{1,2})(?::(\d{1,2}))$/);
        if (twentyFour) {
            const hour = parseInt(twentyFour[1], 10);
            const minute = parseInt(twentyFour[2], 10);
            if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
            return hour * 3600 + minute * 60;
        }

        return null;
    }
}
