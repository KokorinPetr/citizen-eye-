from enum import StrEnum


class UserRole(StrEnum):
    USER = "user"
    COORDINATOR = "coordinator"
    ADMIN = "admin"
