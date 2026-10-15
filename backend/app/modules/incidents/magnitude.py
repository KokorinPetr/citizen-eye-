"""Incident magnitude (0-100): drives marker size on the map. Weights live in config."""

import math

from app.core.config import get_settings
from app.modules.incidents.enums import Urgency

MAGNITUDE_MIN = 0
MAGNITUDE_MAX = 100
MAGNITUDE_LEVEL_STEP = 20


def clamp_magnitude(value: float) -> int:
    return max(MAGNITUDE_MIN, min(MAGNITUDE_MAX, round(value)))


def calculate_report_magnitude(urgency: Urgency, people_affected: int | None) -> int:
    settings = get_settings()
    people_points = min(people_affected or 0, settings.magnitude_people_max)
    return clamp_magnitude(settings.magnitude_urgency_points[urgency.value] + people_points)


def calculate_incident_magnitude(
    average_report_magnitude: float, source_count: int, is_verified: bool
) -> int:
    """Average of the merged reports + a bonus per extra *independent source* (+ verified bonus).

    Counting sources, not reports, means one person sending many reports can't inflate it.
    """
    settings = get_settings()
    report_bonus = min(
        settings.magnitude_report_bonus * (max(source_count, 1) - 1),
        settings.magnitude_report_bonus_max,
    )
    verified_bonus = settings.magnitude_verified_bonus if is_verified else 0
    return clamp_magnitude(average_report_magnitude + report_bonus + verified_bonus)


def get_magnitude_level(magnitude: int) -> int:
    """1-5, for marker sizing on the frontend."""
    return max(1, math.ceil(magnitude / MAGNITUDE_LEVEL_STEP))
