# MR Driftwood

Have you been struggling with your performativity?

Need to convince your friends that you do cool things on the weekends? Want your life360 and findMy groups to believe you went on a dangerous journey to Antarctica while you were, in fact, working on CS107E in your dorm room? 
Have you considered lying with infrastructure?

Well... look no further
MR Driftwood is a local GPS route simulator for iOS. Draw a route on a map, plug in your iPhone, press play, and watch yourdevice confidently wander the earth without you.


## What It Does

Draw GPS routes on a map. Walk your iPhone along them in real time over USB. No Xcode, no apps on the phone, no cloud.

- Draw routes on a map
- Snap paths to roads
- Simulate walking, jogging, biking, or driving
- Add pauses at waypoints
- Stream location updates to an iPhone over USB
- Save and replay routes




## Setup

Enable Developer Mode on your iPhone

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

## For Those Pesky Windows Users

Here is a setup that should work.

Install iTunes from the Microsoft Store first so `pymobiledevice3` can talk to the device over USB:
<https://apps.microsoft.com/detail/9pb2mz1zmb1s?hl=en-US&gl=US>

Then, in a normal PowerShell window:

```powershell
py -m pip install -e .
```

In an Administrator PowerShell window, start the iOS 17+ tunnel:

```powershell
py -m pymobiledevice3 remote tunneld
```

Leave that window open. In a second PowerShell window, start Driftwood:

```powershell
driftwood serve
```

Then open <http://127.0.0.1:7777>.

Notes:

- If `driftwood` is not on your `PATH`, run `py -m driftwood.cli serve` instead.
- For iOS 17.0-17.3.1 on Windows, `pymobiledevice3` notes that additional drivers may be required.
