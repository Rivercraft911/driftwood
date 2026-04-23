from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from .api.routes import router as routes_router
from .api.devices import router as devices_router
from .api.playback import router as playback_router
from .api.proxy import router as proxy_router
from .api.config import router as config_router
from .services.route_store import RouteStore
from .services.playback import PlaybackController
from .services.device_manager import DeviceManager
from . import config as cfg


@asynccontextmanager
async def lifespan(app: FastAPI):
    dm = DeviceManager()
    app.state.device_manager = dm
    app.state.route_store = RouteStore(cfg.ROUTES_DIR)
    app.state.playback = PlaybackController(dm)
    await dm.start_polling()
    yield
    await app.state.playback.stop()
    await dm.stop_polling()


def create_app():
    app = FastAPI(title="MR Driftwood", lifespan=lifespan)
    app.include_router(routes_router, prefix="/api/routes")
    app.include_router(devices_router, prefix="/api/devices")
    app.include_router(playback_router, prefix="/api/playback")
    app.include_router(proxy_router, prefix="/api/proxy")
    app.include_router(config_router, prefix="/api/config")
    app.mount("/", StaticFiles(directory=str(cfg.STATIC_DIR), html=True))
    return app
