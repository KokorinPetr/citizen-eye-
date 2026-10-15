import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, computed_field

from app.modules.incidents.enums import IncidentStatus, NeedType, TaskRole, TaskStatus, Urgency
from app.modules.incidents.magnitude import get_magnitude_level
from app.shared.geo import DbPoint, GeoPoint
from app.shared.types import PhoneNumber


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    role: TaskRole = TaskRole.GENERAL
    needed_count: int = Field(default=1, ge=1, le=50)


class TaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    role: TaskRole
    needed_count: int
    signed_up_count: int
    status: TaskStatus

    @computed_field
    @property
    def spots_left(self) -> int:
        if self.status == TaskStatus.DONE:
            return 0
        return max(self.needed_count - self.signed_up_count, 0)


class IncidentCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    summary: str = Field(default="", max_length=2000)
    need_type: NeedType
    urgency: Urgency
    people_affected: int | None = Field(default=None, ge=0, le=10_000)
    location: GeoPoint = Field(description="Pin on the map (GPS to locate, then adjusted by user)")
    location_text: str | None = Field(default=None, max_length=300)
    contact_phone: PhoneNumber | None = Field(
        default=None, description="Shown only to logged-in users, never on the public map list"
    )
    tasks: list[TaskCreate] = Field(
        default_factory=list, max_length=10, description="Empty → one general helper task"
    )


class IncidentUpdate(BaseModel):
    """Details the owner can fix. Urgency and magnitude come from reports, not from edits."""

    title: str | None = Field(default=None, min_length=3, max_length=200)
    summary: str | None = Field(default=None, max_length=2000)
    need_type: NeedType | None = None
    location: GeoPoint | None = None
    location_text: str | None = Field(default=None, max_length=300)
    contact_phone: PhoneNumber | None = None


class IncidentMapItem(BaseModel):
    """Lightweight item for the map layer (polled often)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    need_type: NeedType
    urgency: Urgency
    status: IncidentStatus
    magnitude: int
    location: DbPoint
    report_count: int
    is_verified: bool
    helpers_needed: int = Field(description="For tasks that are not done yet")
    helpers_signed_up: int

    @computed_field
    @property
    def magnitude_level(self) -> int:
        return get_magnitude_level(self.magnitude)


class IncidentRead(IncidentMapItem):
    """Full incident card."""

    summary: str
    location_text: str | None
    people_affected: int | None
    contact_phone: str | None = Field(description="null for anonymous viewers")
    owner_id: uuid.UUID | None
    tasks: list[TaskRead]
    last_report_at: datetime
    resolved_at: datetime | None
    created_at: datetime
    updated_at: datetime
