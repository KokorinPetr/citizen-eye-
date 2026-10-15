"""Imports every module's ORM models so `Base.metadata` is complete (used by Alembic and tests)."""

from app.core.base_model import Base
from app.modules.auth.models import RefreshToken, User

__all__ = ["Base", "RefreshToken", "User"]
