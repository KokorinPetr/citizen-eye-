import uuid

from app.core.exceptions import PermissionDeniedError
from app.modules.auth.enums import UserRole
from app.modules.auth.models import User

MANAGER_ROLES = (UserRole.COORDINATOR, UserRole.ADMIN)


def is_manager(user: User) -> bool:
    return user.role in MANAGER_ROLES


def ensure_owner_or_manager(user: User, owner_id: uuid.UUID | None, message: str) -> None:
    """Owners manage their own records; coordinators and admins manage everything."""
    if owner_id != user.id and not is_manager(user):
        raise PermissionDeniedError(message)
