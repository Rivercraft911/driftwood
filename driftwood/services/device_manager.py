import asyncio
import inspect
import logging
from ..models.device import DeviceInfo
from .. import config as cfg

log = logging.getLogger(__name__)


class DeviceManager:
    def __init__(self):
        self._devices = {}
        self._active_udid = None
        self._selected_udid = None
        self._active_conn = None
        self._poll_task = None
        self._listeners = []
        self._connection_lock = asyncio.Lock()

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
                connected=(info["udid"] == self._active_udid and self._active_conn is not None),
                active=(info["udid"] == self._active_udid or info["udid"] == self._selected_udid),
            )
            for info in self._devices.values()
        ]

    async def connect(self, udid):
        async with self._connection_lock:
            if udid not in self._devices:
                await self._scan()
            if udid not in self._devices:
                raise ValueError(f"Device {udid} not found")

            await self._close_active_connection(clear_active=True, clear_selected=False)
            conn = await asyncio.wait_for(self._create_connection(udid), cfg.DEVICE_CONNECT_TIMEOUT_S)
            self._selected_udid = udid
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
        except Exception as e:
            if type(e).__name__ == "InvalidServiceError":
                raise RuntimeError(
                    "InvalidService: iOS 17+ requires an active `pymobiledevice3 remote tunneld` tunnel"
                ) from e
            raise

    async def _service_provider_for_udid(self, udid):
        try:
            try:
                from pymobiledevice3.tunneld.api import get_tunneld_devices
            except ImportError:
                from pymobiledevice3.tunneld import get_tunneld_devices

            rsd_devices = get_tunneld_devices()
            if inspect.isawaitable(rsd_devices):
                rsd_devices = await rsd_devices

            match = None
            for rsd in rsd_devices:
                rsd_udid = (
                    getattr(rsd, "udid", None)
                    or (rsd.get("udid") if isinstance(rsd, dict) else None)
                )
                if rsd_udid == udid:
                    match = rsd
                else:
                    closer = getattr(rsd, "close", None)
                    if closer:
                        try:
                            if inspect.iscoroutinefunction(closer):
                                await closer()
                            else:
                                await asyncio.to_thread(closer)
                        except Exception:
                            pass

            if match is not None:
                return match
        except Exception:
            pass

        from pymobiledevice3.lockdown import create_using_usbmux

        lockdown = create_using_usbmux(serial=udid)
        if inspect.isawaitable(lockdown):
            lockdown = await lockdown
        return lockdown

    def _create_connection_legacy(self, udid):
        try:
            try:
                from pymobiledevice3.tunneld.api import get_tunneld_devices
            except ImportError:
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
        async with self._connection_lock:
            try:
                await self._ensure_connection()
                await self._set_location(lat, lon)
            except Exception as first_error:
                log.warning("Device location push failed; reconnecting: %s", first_error)
                await self._close_active_connection(clear_active=True, clear_selected=False)
                try:
                    await self._ensure_connection()
                    await self._set_location(lat, lon)
                except Exception as retry_error:
                    await self._close_active_connection(clear_active=True, clear_selected=False)
                    raise ConnectionError(f"Device lost: {retry_error}") from retry_error

    async def clear_location(self, reconnect=False):
        async with self._connection_lock:
            if not self._active_conn and not reconnect:
                return
            if not (self._active_conn or self._active_udid or self._selected_udid):
                return
            try:
                await self._ensure_connection()
                await self._clear_location()
            except Exception:
                await self._close_active_connection(clear_active=True, clear_selected=False)

    async def disconnect(self, udid=None):
        async with self._connection_lock:
            if udid and udid not in {self._active_udid, self._selected_udid}:
                return
            try:
                if self._active_conn:
                    await self._clear_location()
            except Exception:
                pass
            await self._close_active_connection(clear_active=True, clear_selected=True)

    async def _ensure_connection(self):
        if self._active_conn:
            return

        udid = self._active_udid or self._selected_udid
        if not udid:
            raise ConnectionError("No device selected")
        if udid not in self._devices:
            await self._scan()
        if udid not in self._devices:
            raise ConnectionError(f"Device {udid} not found")

        self._active_conn = await asyncio.wait_for(self._create_connection(udid), cfg.DEVICE_CONNECT_TIMEOUT_S)
        self._active_udid = udid
        self._selected_udid = udid

    async def _set_location(self, lat, lon):
        setter = self._active_conn["loc"].set
        if inspect.iscoroutinefunction(setter):
            await asyncio.wait_for(setter(lat, lon), cfg.DEVICE_PUSH_TIMEOUT_S)
        else:
            await asyncio.wait_for(asyncio.to_thread(setter, lat, lon), cfg.DEVICE_PUSH_TIMEOUT_S)

    async def _clear_location(self):
        clearer = self._active_conn["loc"].clear
        if inspect.iscoroutinefunction(clearer):
            await asyncio.wait_for(clearer(), cfg.DEVICE_PUSH_TIMEOUT_S)
        else:
            await asyncio.wait_for(asyncio.to_thread(clearer), cfg.DEVICE_PUSH_TIMEOUT_S)

    async def _close_active_connection(self, clear_active=False, clear_selected=False):
        conn = self._active_conn
        self._active_conn = None
        if clear_active:
            self._active_udid = None
        if clear_selected:
            self._selected_udid = None

        if conn and conn.get("dvt"):
            closer = getattr(conn["dvt"], "close", None)
            if closer:
                try:
                    if inspect.iscoroutinefunction(closer):
                        await asyncio.wait_for(closer(), cfg.DEVICE_PUSH_TIMEOUT_S)
                    else:
                        await asyncio.wait_for(asyncio.to_thread(closer), cfg.DEVICE_PUSH_TIMEOUT_S)
                except Exception:
                    pass
