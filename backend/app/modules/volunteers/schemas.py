import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.modules.auth.schemas import UserPublic
from app.modules.incidents.enums import IncidentStatus, NeedType, TaskRole
from app.modules.volunteers.enums import SignupStatus
from app.shared.geo import DbPoint


class SignupCreate(BaseModel):
    task_id: uuid.UUID | None = Field(
        default=None, description="Task to help with. Empty → first task with free spots"
    )


class TaskSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    role: TaskRole


class IncidentSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    need_type: NeedType
    status: IncidentStatus
    location: DbPoint


class VolunteerRead(BaseModel):
    """Public: who is helping on an incident."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: SignupStatus
    user: UserPublic
    task: TaskSummary
    created_at: datetime


class UserSignupRead(BaseModel):
    """Public: what a user is helping with."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: SignupStatus
    incident: IncidentSummary
    task: TaskSummary
    created_at: datetime
