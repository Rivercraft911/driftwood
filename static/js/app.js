import { initMap } from './map.js';
import { RouteBuilder } from './route-builder.js';
import { WaypointPanel } from './waypoint-panel.js';
import { PlaybackControls } from './playback.js';
import { DriftwoodSocket } from './websocket.js';
import { DevicePanel } from './device-panel.js';
import { TrailRenderer } from './trail.js';
import { StatsDisplay } from './stats.js';
import { GpxHandler } from './gpx.js';
import { ThemeManager } from './theme.js';

async function loadClientConfig() {
    try {
        const resp = await fetch('/api/config');
        if (!resp.ok) throw new Error('config unavailable');
        return await resp.json();
    } catch {
        return {
            mapbox: { accessToken: null },
            routing: {
                defaultProvider: 'osrm',
                providers: [
                    { id: 'osrm', label: 'OSRM', available: true },
                    { id: 'mapbox', label: 'Mapbox', available: false },
                ],
            },
        };
    }
}

const clientConfig = await loadClientConfig();
const map = initMap('map', clientConfig);
const theme = new ThemeManager(map);
const ws = new DriftwoodSocket();
const trail = new TrailRenderer(map);
const builder = new RouteBuilder(map, clientConfig.routing);
const panel = new WaypointPanel(builder);
const playback = new PlaybackControls(ws, builder);
const device = new DevicePanel(ws);
const stats = new StatsDisplay();
const gpx = new GpxHandler(builder);
stats.setSpeedUnit(playback.getSpeedUnit());
playback.onSpeedUnitChange = (unit) => stats.setSpeedUnit(unit);

const overlay = document.getElementById('modal-overlay');
const modalContent = document.getElementById('modal-content');
const snapToggle = document.getElementById('snap-toggle');

let autoFollow = false;
let lastPosition = null;

const btnFollow = document.getElementById('btn-follow');
btnFollow.onclick = () => {
    autoFollow = !autoFollow;
    btnFollow.classList.toggle('active', autoFollow);
    btnFollow.title = autoFollow ? 'Auto-follow: on' : 'Auto-follow: off';
    if (autoFollow && lastPosition) {
        map.setView([lastPosition.lat, lastPosition.lon], Math.max(map.getZoom(), 15), { animate: false });
    }
};
map.on('dragstart', () => {
    if (autoFollow) {
        autoFollow = false;
        btnFollow.classList.remove('active');
        btnFollow.title = 'Auto-follow: off';
    }
});

ws.on('position', (data) => {
    lastPosition = data;
    trail.addPoint(data.lat, data.lon);
    stats.update(data);
    playback.updateProgress(data.progress);
    if (autoFollow) {
        const lat = data.smooth_lat ?? data.lat;
        const lon = data.smooth_lon ?? data.lon;
        map.setView([lat, lon], map.getZoom(), { animate: false });
    }
});

ws.on('state', (data) => {
    playback.onStateChange(data);
    if (data.state === 'idle') {
        trail.clear();
        stats.reset();
        lastPosition = null;
    }
});

ws.on('device', (data) => device.onDeviceEvent(data));

ws.on('error', (data) => {
    console.warn('Server error:', data.message);
});

ws.connect();

// theme toggle
const btnKawaii = document.getElementById('btn-kawaii');
theme.setButton(btnKawaii);
btnKawaii.onclick = () => theme.toggle();
const btnMapLayer = document.getElementById('btn-map-layer');
theme.setLayerButton(btnMapLayer);
btnMapLayer.onclick = () => theme.toggleMapLayer();
const btn3D = document.getElementById('btn-3d');
const pitchControl = document.getElementById('pitch-control');
const pitchSlider = document.getElementById('pitch-slider');
let threeDEnabled = localStorage.getItem('driftwood_3d') === 'on';
let threeDPitch = Number(localStorage.getItem('driftwood_3d_pitch') || pitchSlider.value || 60);
if (!Number.isFinite(threeDPitch)) threeDPitch = 60;
pitchSlider.value = String(threeDPitch);
map.setPitch(threeDPitch);
map.set3DMode(threeDEnabled, threeDPitch);
function update3DControls() {
    btn3D.classList.toggle('active', threeDEnabled);
    btn3D.title = threeDEnabled ? '3D view: on' : '3D view: off';
    pitchSlider.disabled = !threeDEnabled;
    pitchControl.classList.toggle('active', threeDEnabled);
}
btn3D.onclick = () => {
    threeDEnabled = !threeDEnabled;
    localStorage.setItem('driftwood_3d', threeDEnabled ? 'on' : 'off');
    map.set3DMode(threeDEnabled, threeDPitch);
    update3DControls();
};
pitchSlider.oninput = () => {
    threeDPitch = Number(pitchSlider.value);
    localStorage.setItem('driftwood_3d_pitch', String(threeDPitch));
    map.setPitch(threeDPitch);
};
update3DControls();
const btnRouteProvider = document.getElementById('btn-route-provider');
function updateRouteProviderButton() {
    const provider = builder.routerProvider;
    const mapboxAvailable = builder.isRoutingProviderAvailable('mapbox');
    btnRouteProvider.textContent = provider === 'mapbox' ? 'Mapbox' : 'OSRM';
    btnRouteProvider.title = mapboxAvailable
        ? `Routing provider: ${provider === 'mapbox' ? 'Mapbox' : 'OSRM'}`
        : 'Routing provider: OSRM (Mapbox token missing)';
    btnRouteProvider.classList.toggle('active', provider === 'mapbox');
    btnRouteProvider.disabled = !mapboxAvailable;
}
btnRouteProvider.onclick = () => {
    const next = builder.routerProvider === 'mapbox' ? 'osrm' : 'mapbox';
    builder.setRouterProvider(next);
    updateRouteProviderButton();
};
builder.onRoutingProviderChange(updateRouteProviderButton);
updateRouteProviderButton();
theme.onChange(() => {
    builder.refreshColors();
    trail.refresh();
});

// keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        builder.undo();
        return;
    }
    if (e.key === ' ') {
        e.preventDefault();
        if (playback.state === 'playing') ws.send({ type: 'pause' });
        else if (playback.state === 'paused') ws.send({ type: 'resume' });
        else document.getElementById('btn-play').click();
    } else if (e.key === 'Escape') {
        if (playback.state !== 'idle') ws.send({ type: 'stop' });
    }
});

snapToggle.onchange = () => {
    builder.snapEnabled = snapToggle.checked;
    if (snapToggle.checked && builder.waypoints.length >= 2) {
        builder.snapToRoads();
    } else {
        builder.cancelSnap();
        builder.snappedPath = null;
        builder._updateLine();
        builder.notifyMetadataChanged();
    }
};

// fit route to view
document.getElementById('btn-fit').onclick = () => {
    if (builder.waypoints.length === 0) return;
    const coords = builder.snappedPath && builder.snappedPath.length > 0
        ? builder.snappedPath
        : builder.waypoints.map(w => [w.lat, w.lon]);
    map.fitBounds(L.latLngBounds(coords), { padding: [50, 50] });
};

function showModal(html) {
    modalContent.innerHTML = html;
    overlay.hidden = false;
}

function hideModal() {
    overlay.hidden = true;
    modalContent.innerHTML = '';
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    })[ch]);
}

overlay.onclick = (e) => {
    if (e.target === overlay) hideModal();
};

document.getElementById('btn-save').onclick = () => {
    const route = builder.toRoute();
    showModal(`
        <h3>Save Route</h3>
        <input type="text" id="save-name" value="${escapeHtml(route.name)}" placeholder="Route name" autofocus>
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
        <div class="route-list-item" data-name="${escapeHtml(r.name)}">
            <div>
                <div class="route-list-name">${escapeHtml(r.name)}</div>
                <div class="route-list-meta">${r.waypoint_count} pts &middot; ${(r.total_distance_m / 1000).toFixed(1)} km</div>
            </div>
            <button class="delete-btn" data-delete="${escapeHtml(r.name)}" title="Delete">&times;</button>
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
