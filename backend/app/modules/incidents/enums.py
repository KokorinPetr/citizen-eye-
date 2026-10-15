from enum import StrEnum


class NeedType(StrEnum):
    EVACUATION = "evacuation"
    FOOD = "food"
    WATER = "water"
    MEDICINE = "medicine"
    MEDICAL = "medical"
    BOAT = "boat"
    SHELTER = "shelter"
    OTHER = "other"


class Urgency(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class IncidentStatus(StrEnum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"


ACTIVE_STATUSES = (IncidentStatus.OPEN, IncidentStatus.IN_PROGRESS)


class TaskRole(StrEnum):
    DRIVER = "driver"
    CARRIER = "carrier"
    BOAT_OPERATOR = "boat_operator"
    MEDIC = "medic"
    COOK = "cook"
    GENERAL = "general"


class TaskStatus(StrEnum):
    OPEN = "open"
    FILLED = "filled"
    DONE = "done"


class ReportStatus(StrEnum):
    PARSED = "parsed"  # turned into / merged into an incident
    FAILED = "failed"  # AI failed; incident created from the raw text with defaults
    REJECTED = "rejected"  # AI says it is not a request for help; no incident


class ReportSource(StrEnum):
    MANUAL = "manual"
    AI = "ai"
    SEED = "seed"
