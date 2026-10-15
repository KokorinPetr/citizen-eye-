import uuid
from collections.abc import Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import ConflictError, NotFoundError, PermissionDeniedError
from app.modules.auth.models import User
from app.modules.auth.permissions import ensure_owner_or_manager, is_manager
from app.modules.incidents import service as incidents_service
from app.modules.incidents.enums import TaskStatus
from app.modules.incidents.models import Incident, IncidentTask
from app.modules.volunteers import repository
from app.modules.volunteers.enums import SignupStatus
from app.modules.volunteers.models import VolunteerSignup
from app.modules.volunteers.schemas import SignupCreate


async def sign_up(
    session: AsyncSession, incident_id: uuid.UUID, data: SignupCreate, user: User
) -> VolunteerSignup:
    incident = await incidents_service.get_incident_or_raise(session, incident_id)
    incidents_service.ensure_incident_active(incident)

    if await repository.get_active_signup(session, user.id, incident_id=incident.id):
        raise ConflictError("You are already signed up for this incident")
    max_signups = get_settings().max_active_signups
    if await repository.count_user_active_signups(session, user.id) >= max_signups:
        raise ConflictError(f"You can help with at most {max_signups} incidents at a time")

    task = await pick_task(session, incident, data.task_id)
    signup = await repository.add_signup(
        session, VolunteerSignup(user=user, incident=incident, task=task)
    )
    await refresh_task_progress(session, incident, task)
    await session.commit()
    return signup


async def cancel_signup(
    session: AsyncSession, incident_id: uuid.UUID, signup_id: uuid.UUID, user: User
) -> None:
    signup = await repository.get_signup(session, signup_id)
    if signup is None or signup.incident_id != incident_id:
        raise NotFoundError("Sign-up not found")
    if signup.user_id != user.id and not is_manager(user):
        raise PermissionDeniedError("You can only cancel your own sign-up")
    if signup.status != SignupStatus.GOING:
        raise ConflictError("Sign-up is not active")

    signup.status = SignupStatus.CANCELLED
    await session.flush()
    incident = signup.incident
    task = await incidents_service.get_task_for_update(session, incident, signup.task_id)
    await refresh_task_progress(session, incident, task)
    await session.commit()


async def complete_task(
    session: AsyncSession, incident_id: uuid.UUID, task_id: uuid.UUID, user: User
) -> Incident:
    """A volunteer on the task (or the owner / a coordinator) marks it done.

    When every task is done, the incident is resolved.
    """
    incident = await incidents_service.get_incident_or_raise(session, incident_id)
    incidents_service.ensure_incident_active(incident)
    task = await incidents_service.get_task_for_update(session, incident, task_id)
    if task.status == TaskStatus.DONE:
        raise ConflictError("Task is already done")
    if not await repository.get_active_signup(session, user.id, task_id=task.id):
        ensure_owner_or_manager(
            user, incident.owner_id, "Only volunteers on this task or the owner can mark it done"
        )

    await repository.complete_task_signups(session, task.id)
    incidents_service.mark_task_done(task)
    incidents_service.sync_incident_status(incident)
    await session.commit()
    return incident


async def list_incident_volunteers(
    session: AsyncSession, incident_id: uuid.UUID
) -> Sequence[VolunteerSignup]:
    await incidents_service.get_incident_or_raise(session, incident_id)
    return await repository.list_incident_signups(session, incident_id)


async def list_user_signups(session: AsyncSession, user_id: uuid.UUID) -> Sequence[VolunteerSignup]:
    return await repository.list_user_signups(session, user_id)


async def pick_task(
    session: AsyncSession, incident: Incident, task_id: uuid.UUID | None
) -> IncidentTask:
    """The requested task, or the first one with free spots. Locked until commit."""
    if task_id is None:
        free_task = next((t for t in incident.tasks if t.status == TaskStatus.OPEN), None)
        if free_task is None:
            raise ConflictError("All tasks are already covered")
        task_id = free_task.id

    task = await incidents_service.get_task_for_update(session, incident, task_id)
    if task.status != TaskStatus.OPEN:
        raise ConflictError("This task is already covered or done")
    return task


async def refresh_task_progress(
    session: AsyncSession, incident: Incident, task: IncidentTask
) -> None:
    signed_up = await repository.count_task_active_signups(session, task.id)
    incidents_service.set_task_signups(task, signed_up)
    incidents_service.sync_incident_status(incident)
