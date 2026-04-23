export class GpxHandler {
    constructor(builder, modal) {
        this.builder = builder;
        this.modal = modal;

        document.getElementById('btn-gpx-import').onclick = () => this.importGpx();
        document.getElementById('btn-gpx-export').onclick = () => this.exportGpx();
    }

    importGpx() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.gpx';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const text = await file.text();
            try {
                const resp = await fetch('/api/routes/import-gpx', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/xml' },
                    body: text,
                });
                const data = await resp.json();
                if (data.waypoints && data.waypoints.length > 0) {
                    const name = file.name.replace('.gpx', '');
                    this.builder.loadRoute({
                        name,
                        waypoints: data.waypoints,
                    });
                }
            } catch (err) {
                console.warn('GPX import failed:', err);
            }
        };
        input.click();
    }

    async exportGpx() {
        const route = this.builder.toRoute();
        if (!route.waypoints || route.waypoints.length === 0) return;

        try {
            const resp = await fetch('/api/routes/export-gpx', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(route),
            });
            const blob = await resp.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${route.name}.gpx`;
            a.click();
            URL.revokeObjectURL(a.href);
        } catch (err) {
            console.warn('GPX export failed:', err);
        }
    }
}
