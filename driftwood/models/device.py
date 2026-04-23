from pydantic import BaseModel
from typing import Optional


class DeviceInfo(BaseModel):
    udid: str
    name: str
    ios_version: Optional[str] = None
    connected: bool = True
    active: bool = False
