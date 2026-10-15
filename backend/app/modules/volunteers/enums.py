from enum import StrEnum


class SignupStatus(StrEnum):
    GOING = "going"  # active, counts toward the task and the user's limit
    COMPLETED = "completed"  # the task was marked done
    CANCELLED = "cancelled"
