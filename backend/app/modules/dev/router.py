from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse, RedirectResponse

from app.core.exceptions import NotFoundError

router = APIRouter(prefix="/dev", tags=["dev"], include_in_schema=False)

DEV_DIR = Path(__file__).parent
PAGES = {"map": "map.html", "report": "report.html"}
ASSETS = {"common.js": "common.js"}


@router.get("")
async def dev_index() -> RedirectResponse:
    return RedirectResponse("/dev/map")


@router.get("/assets/{name}")
async def dev_asset(name: str) -> FileResponse:
    if name not in ASSETS:
        raise NotFoundError("Unknown dev asset")
    return FileResponse(DEV_DIR / ASSETS[name])


@router.get("/{page}")
async def dev_page(page: str) -> FileResponse:
    """Dev pages for checking the API by hand. Not served in production."""
    if page not in PAGES:
        raise NotFoundError("Unknown dev page")
    return FileResponse(DEV_DIR / PAGES[page])
