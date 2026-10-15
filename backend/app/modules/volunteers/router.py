import uuid

from fastapi import APIRouter, status

from app.core.database import DbSession
from app.modules.auth.dependencies import CurrentUser
from app.modules.incidents.schemas import IncidentRead
from app.modules.volunteers import service
from app.modules.volunteers.schemas import SignupCreate, UserSignupRead, VolunteerRead

router = APIRouter(tags=["volunteers"])


@router.get("/incidents/{incident_id}/volunteers")
async def list_incident_volunteers(
    incident_id: uuid.UUID, session: DbSession
) -> list[VolunteerRead]:
    """Public: who is going / has helped, per task."""
    signups = await service.list_incident_volunteers(session, incident_id)
    return [VolunteerRead.model_validate(signup) for signup in signups]


@router.post("/incidents/{incident_id}/volunteers", status_code=status.HTTP_201_CREATED)
async def sign_up(
    incident_id: uuid.UUID, data: SignupCreate, session: DbSession, user: CurrentUser
) -> VolunteerRead:
    """Sign up ("I'm going") for a task. Max 2 active sign-ups per user."""
    return VolunteerRead.model_validate(await service.sign_up(session, incident_id, data, user))


@router.delete(
    "/incidents/{incident_id}/volunteers/{signup_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def cancel_signup(
    incident_id: uuid.UUID, signup_id: uuid.UUID, session: DbSession, user: CurrentUser
) -> None:
    await service.cancel_signup(session, incident_id, signup_id, user)


@router.post("/incidents/{incident_id}/tasks/{task_id}/done")
async def complete_task(
    incident_id: uuid.UUID, task_id: uuid.UUID, session: DbSession, user: CurrentUser
) -> IncidentRead:
    """Mark a task done. All tasks done → incident resolved."""
    incident = await service.complete_task(session, incident_id, task_id, user)
    return IncidentRead.model_validate(incident)


@router.get("/users/{user_id}/signups")
async def list_user_signups(user_id: uuid.UUID, session: DbSession) -> list[UserSignupRead]:
    """Public: what a user is helping with."""
    signups = await service.list_user_signups(session, user_id)
    return [UserSignupRead.model_validate(signup) for signup in signups]
