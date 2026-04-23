import { initMap } from './map.js';
import { RouteBuilder } from './route-builder.js';
import { WaypointPanel } from './waypoint-panel.js';
import { PlaybackControls } from './playback.js';
import { DriftwoodSocket } from './websocket.js';
import { DevicePanel } from './device-panel.js';
import { TrailRenderer } from './trail.js';
import { StatsDisplay } from './stats.js';
import { GpxHandler } from './gpx.js';

const map = initMap('map');
const ws = new DriftwoodSocket();
const trail = new TrailRenderer(map);
const builder = new RouteBuilder(map);
const panel = new WaypointPanel(builder);
const playback = new PlaybackControls(ws, builder);
const device = new DevicePanel(ws);
const stats = new StatsDisplay();
const gpx = new GpxHandler(builder);

const overlay = document.getElementById('modal-overlay');
const modalContent = document.getElementById('modal-content');
const snapToggle = document.getElementById('snap-toggle');

ws.on('position', (data) => {
    trail.addPoint(data.lat, data.lon);
    stats.update(data);
    playback.updateProgress(data.progress);
});

ws.on('state', (data) => {
    playback.onStateChange(data);
    if (data.state === 'idle') {
        trail.clear();
        stats.reset();
    }
});

ws.on('device', (data) => device.onDeviceEvent(data));

ws.on('error', (data) => {
    console.warn('Server error:', data.message);
});

ws.connect();

snapToggle.onchange = () => {
    builder.snapEnabled = snapToggle.checked;
    if (snapToggle.checked && builder.waypoints.length >= 2) {
        builder.snapToRoads();
    } else {
        builder.snappedPath = null;
        builder._updateLine();
    }
};

function showModal(html) {
    modalContent.innerHTML = html;
    overlay.hidden = false;
}

function hideModal() {
    overlay.hidden = true;
    modalContent.innerHTML = '';
}

overlay.onclick = (e) => {
    if (e.target === overlay) hideModal();
};

document.getElementById('btn-save').onclick = () => {
    const route = builder.toRoute();
    showModal(`
        <h3>Save Route</h3>
        <input type="text" id="save-name" value="${route.name}" placeholder="Route name" autofocus>
        <div class="modal-actions">
            <button class="btn-cancel" id="save-cancel">Cancel</button>
            <button id="save-confirm">Save</button>
        </div>
    `);
    document.getElementById('save-cancel').onclick = hideModal;
    document.getElementById('save-confirm').onclick = async () => {
        const name = document.getElementById('save-name').value.trim();
        if (!name) return;
        builder._routeName = name;
        const r = builder.toRoute();
        await fetch('/api/routes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(r),
        });
        hideModal();
    };
    document.getElementById('save-name').onkeydown = (e) => {
        if (e.key === 'Enter') document.getElementById('save-confirm').click();
    };
};

document.getElementById('btn-load').onclick = async () => {
    const resp = await fetch('/api/routes');
    const routes = await resp.json();

    if (routes.length === 0) {
        showModal(`
            <h3>Load Route</h3>
            <div class="empty-state">No saved routes yet</div>
            <div class="modal-actions">
                <button class="btn-cancel" id="load-cancel">Close</button>
            </div>
        `);
        document.getElementById('load-cancel').onclick = hideModal;
        return;
    }

    const items = routes.map(r => `
        <div class="route-list-item" data-name="${r.name}">
            <div>
                <div class="route-list-name">${r.name}</div>
                <div class="route-list-meta">${r.waypoint_count} pts &middot; ${(r.total_distance_m / 1000).toFixed(1)} km</div>
            </div>
            <button class="delete-btn" data-delete="${r.name}" title="Delete">&times;</button>
        </div>
    `).join('');

    showModal(`
        <h3>Load Route</h3>
        <div>${items}</div>
        <div class="modal-actions">
            <button class="btn-cancel" id="load-cancel">Close</button>
        </div>
    `);

    document.getElementById('load-cancel').onclick = hideModal;

    modalContent.querySelectorAll('[data-name]').forEach(el => {
        el.onclick = async (e) => {
            if (e.target.closest('[data-delete]')) return;
            const name = el.dataset.name;
            const resp = await fetch(`/api/routes/${encodeURIComponent(name)}`);
            const route = await resp.json();
            builder.loadRoute(route);
            hideModal();
        };
    });

    modalContent.querySelectorAll('[data-delete]').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            const name = btn.dataset.delete;
            await fetch(`/api/routes/${encodeURIComponent(name)}`, { method: 'DELETE' });
            document.getElementById('btn-load').click();
        };
    });
};

document.getElementById('btn-clear').onclick = () => {
    builder.clearRoute();
};
