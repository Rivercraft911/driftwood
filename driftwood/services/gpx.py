import xml.etree.ElementTree as ET
from ..models.route import Waypoint, Route


NS = {'gpx': 'http://www.topografix.com/GPX/1/1'}


def parse_gpx(gpx_string):
    root = ET.fromstring(gpx_string)

    points = []
    for tag in ['.//gpx:trkpt', './/gpx:rtept', './/gpx:wpt']:
        for el in root.findall(tag, NS):
            lat = float(el.get('lat'))
            lon = float(el.get('lon'))
            name_el = el.find('gpx:name', NS)
            points.append(Waypoint(
                lat=lat, lon=lon,
                label=name_el.text if name_el is not None else None,
            ))
        if points:
            break

    if not points:
        for el in root.findall('.//{http://www.topografix.com/GPX/1/0}trkpt'):
            points.append(Waypoint(lat=float(el.get('lat')), lon=float(el.get('lon'))))

    return points


def export_gpx(route):
    gpx = ET.Element('gpx', {
        'version': '1.1',
        'creator': 'MR Driftwood',
        'xmlns': 'http://www.topografix.com/GPX/1/1',
    })

    metadata = ET.SubElement(gpx, 'metadata')
    name = ET.SubElement(metadata, 'name')
    name.text = route.name

    trk = ET.SubElement(gpx, 'trk')
    trk_name = ET.SubElement(trk, 'name')
    trk_name.text = route.name
    trkseg = ET.SubElement(trk, 'trkseg')

    path = route.snapped_path or [[w.lat, w.lon] for w in route.waypoints]
    for p in path:
        ET.SubElement(trkseg, 'trkpt', {'lat': str(p[0]), 'lon': str(p[1])})

    return ET.tostring(gpx, encoding='unicode', xml_declaration=True)
