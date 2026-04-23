import click
import json
import asyncio
import inspect


@click.group()
def main():
    pass


@main.command()
@click.option('--port', default=7777, help='Port to serve on')
@click.option('--host', default='127.0.0.1', help='Host to bind to')
def serve(port, host):
    import uvicorn
    click.echo(f"MR Driftwood starting on http://{host}:{port}")
    uvicorn.run("driftwood.app:create_app", factory=True, host=host, port=port)


@main.command()
def devices():
    from pymobiledevice3.usbmux import list_devices
    try:
        devs = list_devices()
        if inspect.isawaitable(devs):
            devs = asyncio.run(devs)
        if not devs:
            click.echo("No devices connected")
            return
        for d in devs:
            serial = (
                getattr(d, "serial", None)
                or getattr(d, "udid", None)
                or getattr(d, "Identifier", None)
                or (d.get("Identifier") if isinstance(d, dict) else None)
                or (d.get("udid") if isinstance(d, dict) else None)
                or "unknown"
            )
            name = (
                getattr(d, "name", None)
                or getattr(d, "DeviceName", None)
                or (d.get("DeviceName") if isinstance(d, dict) else None)
                or (d.get("name") if isinstance(d, dict) else None)
                or "unknown"
            )
            click.echo(f"  {serial}  {name}")
    except Exception as e:
        click.echo(f"Error listing devices: {e}")


@main.command()
@click.option('--route', required=True, help='Route name or path')
@click.option('--speed', default=1.4, help='Speed in m/s')
@click.option('--loop', is_flag=True, help='Loop the route')
@click.option('--bounce', is_flag=True, help='Bounce the route')
def run(route, speed, loop, bounce):
    from pathlib import Path
    from .models.route import Route
    from .models.playback import PlaybackConfig
    from .services.simulation import SimulationEngine
    from .config import ROUTES_DIR, TICK_INTERVAL

    path = Path(route)
    if not path.exists():
        path = ROUTES_DIR / f"{route}.json"
    if not path.exists():
        click.echo(f"Route not found: {route}")
        return

    r = Route.model_validate_json(path.read_text())
    loop_mode = "bounce" if bounce else ("loop" if loop else "none")
    config = PlaybackConfig(speed_mps=speed, loop_mode=loop_mode)

    click.echo(f"Running: {r.name} at {speed} m/s")

    async def _run():
        from .services.device_manager import DeviceManager
        dm = DeviceManager()
        await dm.start_polling()
        try:
            await asyncio.sleep(2)

            devs = dm.list_devices()
            if not devs:
                click.echo("No device connected")
                return

            await dm.connect(devs[0].udid)
            click.echo(f"Connected to {devs[0].name}")

            sim = SimulationEngine(r, config)
            try:
                while True:
                    point = sim.tick(TICK_INTERVAL)
                    if point is None:
                        if loop_mode == "loop":
                            sim.reset()
                            continue
                        elif loop_mode == "bounce":
                            sim.reverse()
                            continue
                        break
                    await dm.set_location(point.lat, point.lon)
                    pct = sim.progress * 100
                    click.echo(f"\r  {point.lat:.6f}, {point.lon:.6f}  {point.speed:.1f} m/s  {pct:.0f}%", nl=False)
                    await asyncio.sleep(TICK_INTERVAL)
            except KeyboardInterrupt:
                pass
        finally:
            click.echo("\nStopping...")
            await dm.clear_location()
            await dm.stop_polling()

    asyncio.run(_run())


@main.command()
@click.option('--port', default=7777)
def stop(port):
    import httpx
    try:
        resp = httpx.post(f"http://127.0.0.1:{port}/api/playback/stop", timeout=5)
        click.echo("Stopped" if resp.status_code == 200 else f"Error: {resp.text}")
    except Exception:
        click.echo("No running server found")


if __name__ == '__main__':
    main()
