from fastapi import APIRouter

from app.modules.auth.router import router as auth_router
from app.modules.centers.router import hotlines_router
from app.modules.centers.router import router as centers_router
from app.modules.health.router import router as health_router
from app.modules.incidents.router import router as incidents_router
from app.modules.reports.router import router as reports_router
from app.modules.volunteers.router import router as volunteers_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(auth_router)
api_router.include_router(incidents_router)
api_router.include_router(reports_router)
api_router.include_router(centers_router)
api_router.include_router(hotlines_router)
api_router.include_router(volunteers_router)
