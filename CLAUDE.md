# MR Driftwood

Local GPS route simulation tool. Draw routes on a map, walk your iPhone along them via USB.

## Stack

- **Backend**: Python, FastAPI, pymobiledevice3, asyncio
- **Frontend**: Vanilla JS, Leaflet, no build step
- **Storage**: JSON files in `routes/`

## Running

```bash
pip install -e .
driftwood serve          # http://127.0.0.1:7777
driftwood devices        # list connected iOS devices
driftwood run --route myroute.json --speed 1.4
driftwood stop
```

## Code Style

- No unnecessary comments — code should speak for itself
- No docstrings unless the function signature is genuinely unclear
- No type annotations on obvious things
- Keep it minimal. Don't over-abstract.

## Project Layout

- `driftwood/` — Python package (FastAPI app, services, engine, models, CLI)
- `static/` — Frontend served by FastAPI (vanilla JS ES modules, Leaflet)
- `routes/` — Saved route JSON files
- `tests/` — pytest tests

## Key Patterns

- FastAPI app factory in `driftwood/app.py` with lifespan
- Playback runs as an asyncio.Task ticking at 4Hz
- WebSocket at `/api/playback/ws` for real-time position updates
- pymobiledevice3 handles iOS device communication (tunnel for iOS 17+, usbmux fallback)
- OSRM proxied through `/api/proxy/osrm/route` to avoid CORS
