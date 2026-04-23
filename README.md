# MR Driftwood

Draw GPS routes on a map. Walk your iPhone along them in real time over USB. No Xcode, no apps on the phone, no cloud.

## Setup

```bash
pip install -e .
driftwood serve
```

Open [http://127.0.0.1:7777](http://127.0.0.1:7777)

For iOS 17+, run this in a separate terminal first:
```bash
sudo pymobiledevice3 remote start-tunnel
```

## CLI

```bash
driftwood devices                          # list connected iPhones
driftwood run --route myroute --speed 1.4  # headless playback
driftwood stop                             # stop playback
```

## Stack

Python (FastAPI, pymobiledevice3) · Vanilla JS · Leaflet · No build step
