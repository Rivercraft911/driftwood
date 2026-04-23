import asyncio
import inspect
import logging
from ..models.device import DeviceInfo

log = logging.getLogger(__name__)


class DeviceManager:
    def __init__(self):
        self._devices = {}
        self._active_udid = None
        self._active_conn = None
        self._poll_task = None
        self._listeners = []

    async def start_polling(self):
        self._poll_task = asyncio.create_task(self._poll_loop())

    async def stop_polling(self):
        if self._poll_task:
            self._poll_task.cancel()
            try:
                await self._poll_task
            except asyncio.CancelledError:
                pass

    async def _poll_loop(self):
        while True:
            try:
                await self._scan()
            except asyncio.CancelledError:
                raise
            except Exception as e:
                log.debug(f"Device scan error: {e}")
            await asyncio.sleep(2)

    async def _scan(self):
        try:
            from pymobiledevice3.usbmux import list_devices
            current = {}
            devices = list_devices()
            if inspect.isawaitable(devices):
                devices = await devices

            for d in devices:
                serial = (
                    getattr(d, "serial", None)
                    or getattr(d, "udid", None)
                    or getattr(d, "Identifier", None)
                    or (d.get("Identifier") if isinstance(d, dict) else None)
                    or (d.get("udid") if isinstance(d, dict) else None)
                )
                if not serial:
                    continue

                name = (
                    getattr(d, "name", None)
                    or getattr(d, "DeviceName", None)
                    or (d.get("DeviceName") if isinstance(d, dict) else None)
                    or (d.get("name") if isinstance(d, dict) else None)
                    or serial[:12]
                )
                current[serial] = {
                    "udid": serial,
                    "name": name,
                }

            for udid in set(self._devices) - set(current):
                del self._devices[udid]
                if self._active_udid == udid:
                    self._active_udid = None
                    self._active_conn = None

            for udid, info in current.items():
                if udid not in self._devices:
                    self._devices[udid] = info

        except ImportError:
            pass
        except Exception as e:
            log.debug(f"pymobiledevice3 scan: {e}")

    def list_devices(self):
        return [
            DeviceInfo(
                udid=info["udid"],
                name=info["name"],
                active=(info["udid"] == self._active_udid),
            )
            for info in self._devices.values()
        ]

    async def connect(self, udid):
        if udid not in self._devices:
            raise ValueError(f"Device {udid} not found")

        conn = await self._create_connection(udid)
        self._active_udid = udid
        self._active_conn = conn

    async def _create_connection(self, udid):
        try:
            from pymobiledevice3.services.dvt.instruments.dvt_provider import DvtProvider
            from pymobiledevice3.services.dvt.instruments.location_simulation import LocationSimulation

            service_provider = await self._service_provider_for_udid(udid)
            dvt = DvtProvider(service_provider)
            await dvt.connect()
            loc = LocationSimulation(dvt)
            await loc.connect()
            return {"dvt": dvt, "loc": loc, "service_provider": service_provider}
        except ImportError:
            return await asyncio.to_thread(self._create_connection_legacy, udid)

    async def _service_provider_for_udid(self, udid):
        try:
            from pymobiledevice3.tunneld import get_tunneld_devices
            rsd_devices = get_tunneld_devices()
            if inspect.isawaitable(rsd_devices):
                rsd_devices = await rsd_devices

            for rsd in rsd_devices:
                rsd_udid = (
                    getattr(rsd, "udid", None)
                    or (rsd.get("udid") if isinstance(rsd, dict) else None)
                )
                if rsd_udid == udid:
                    return rsd
        except Exception:
            pass

        from pymobiledevice3.lockdown import create_using_usbmux

        lockdown = create_using_usbmux(serial=udid)
        if inspect.isawaitable(lockdown):
            lockdown = await lockdown
        return lockdown

    def _create_connection_legacy(self, udid):
        try:
            from pymobiledevice3.tunneld import get_tunneld_devices
            rsd_devices = get_tunneld_devices()
            if inspect.isawaitable(rsd_devices):
                rsd_devices = asyncio.run(rsd_devices)

            for rsd in rsd_devices:
                rsd_udid = (
                    getattr(rsd, "udid", None)
                    or (rsd.get("udid") if isinstance(rsd, dict) else None)
                )
                if rsd_udid == udid:
                    from pymobiledevice3.services.dvt.dvt_secure_socket_proxy import DvtSecureSocketProxyService
                    from pymobiledevice3.services.dvt.instruments.location_simulation import LocationSimulation
                    dvt = DvtSecureSocketProxyService(rsd)
                    dvt.perform_handshake()
                    return {"dvt": dvt, "loc": LocationSimulation(dvt)}
        except Exception:
            pass

        from pymobiledevice3.lockdown import create_using_usbmux
        from pymobiledevice3.services.dvt.dvt_secure_socket_proxy import DvtSecureSocketProxyService
        from pymobiledevice3.services.dvt.instruments.location_simulation import LocationSimulation
        lockdown = create_using_usbmux(serial=udid)
        if inspect.isawaitable(lockdown):
            lockdown = asyncio.run(lockdown)
        dvt = DvtSecureSocketProxyService(lockdown)
        dvt.perform_handshake()
        return {"dvt": dvt, "loc": LocationSimulation(dvt)}

    async def set_location(self, lat, lon):
        if not self._active_conn:
            return
        try:
            setter = self._active_conn["loc"].set
            if inspect.iscoroutinefunction(setter):
                await setter(lat, lon)
            else:
                await asyncio.to_thread(setter, lat, lon)
        except Exception as e:
            self._active_conn = None
            self._active_udid = None
            raise ConnectionError(f"Device lost: {e}")

    async def clear_location(self):
        if not self._active_conn:
            return
        try:
            clearer = self._active_conn["loc"].clear
            if inspect.iscoroutinefunction(clearer):
                await clearer()
            else:
                await asyncio.to_thread(clearer)
        except Exception:
            pass

    async def disconnect(self, udid=None):
        await self.clear_location()
        if self._active_conn and self._active_conn.get("dvt"):
            closer = getattr(self._active_conn["dvt"], "close", None)
            if closer:
                try:
                    if inspect.iscoroutinefunction(closer):
                        await closer()
                    else:
                        await asyncio.to_thread(closer)
                except Exception:
                    pass
        self._active_conn = None
        self._active_udid = None
