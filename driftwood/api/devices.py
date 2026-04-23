from fastapi import APIRouter, Request, HTTPException

router = APIRouter()


@router.get("")
async def list_devices(request: Request):
    dm = request.app.state.device_manager
    return dm.list_devices()


@router.post("/{udid}/select")
async def select_device(udid: str, request: Request):
    dm = request.app.state.device_manager
    try:
        await dm.connect(udid)
        return {"status": "connected", "udid": udid}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/{udid}/disconnect")
async def disconnect_device(udid: str, request: Request):
    dm = request.app.state.device_manager
    await dm.disconnect(udid)
    return {"status": "disconnected"}
