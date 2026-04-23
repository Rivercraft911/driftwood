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
                        <input type="number" placeholder="Arrive (s)" step="1" min="0"
                            value="${wp.arrivalTime ?? ''}" data-idx="${i}" data-field="arrival">
                        <input type="number" placeholder="Dwell (s)" step="1" min="0"
                            value="${wp.dwellTime ?? ''}" data-idx="${i}" data-field="dwell">
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
                const val = input.value ? parseFloat(input.value) : null;
                if (input.dataset.field === 'arrival') {
                    this.builder.waypoints[idx].arrivalTime = val;
                } else {
                    this.builder.waypoints[idx].dwellTime = val;
                }
            };
        });
    }
}
