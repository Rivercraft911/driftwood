export function initMap(elementId) {
    const map = L.map(elementId, {
        center: [37.7749, -122.4194],
        zoom: 13,
        zoomControl: false,
    });

    L.control.zoom({ position: 'topright' }).addTo(map);

    return map;
}
