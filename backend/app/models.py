"""Imports every module's ORM models so `Base.metadata` is complete (used by Alembic and tests)."""

from app.core.base_model import Base
from app.modules.auth.models import RefreshToken, User
from app.modules.centers.models import Center
from app.modules.community.models import CommunityPost, CommunityResponse
from app.modules.incidents.models import Incident, IncidentReport, IncidentTask
from app.modules.volunteers.models import VolunteerSignup

__all__ = [
    "Base",
    "Center",
    "CommunityPost",
    "CommunityResponse",
    "Incident",
    "IncidentReport",
    "IncidentTask",
    "RefreshToken",
    "User",
    "VolunteerSignup",
]
