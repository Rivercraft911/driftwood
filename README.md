# MR Driftwood

Draw GPS routes on a map. Walk your iPhone along them in real time over USB. No Xcode, no apps on the phone, no cloud.

- Be the ultimate performative fellow: choreograph your GPS like a stage show.
- Draw a path, press play, and your iPhone walks it.
- Local-only GPS puppeteering for demos, testing, and harmless chaos.

## Setup

```bash
pip install -e .
```

## Run (One Terminal)

```bash
sudo -v
sudo -n "$(which python3)" -m pymobiledevice3 remote tunneld >/tmp/driftwood-tunneld.log 2>&1 &
TUNNEL_PID=$!
driftwood serve
kill $TUNNEL_PID
```

Open [http://127.0.0.1:7777](http://127.0.0.1:7777)

## CLI

```bash
driftwood devices                          # list connected iPhones
driftwood run --route myroute --speed 1.4  # headless playback
driftwood stop                             # stop playback
```

## Stack

Python (FastAPI, pymobiledevice3) · Vanilla JS · Leaflet · No build step
