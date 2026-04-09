import os
from fastapi import Header, HTTPException

_API_KEY = os.environ.get("API_KEY", "")


async def verify_api_key(x_api_key: str = Header(default="")):
    if _API_KEY and x_api_key != _API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")
