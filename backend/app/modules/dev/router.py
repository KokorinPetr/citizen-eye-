from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse

router = APIRouter(prefix="/dev", tags=["dev"], include_in_schema=False)

MAP_PAGE = Path(__file__).parent / "map.html"


@router.get("/map")
async def dev_map() -> FileResponse:
    """Lightweight Leaflet map for checking incidents and centers. Not served in production."""
    return FileResponse(MAP_PAGE)
