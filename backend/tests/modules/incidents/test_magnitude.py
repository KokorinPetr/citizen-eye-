from app.modules.incidents.enums import Urgency
from app.modules.incidents.magnitude import (
    calculate_incident_magnitude,
    calculate_report_magnitude,
    get_magnitude_level,
)


def test_report_magnitude_caps_people_points() -> None:
    assert calculate_report_magnitude(Urgency.HIGH, 3) == 48
    assert calculate_report_magnitude(Urgency.CRITICAL, 500) == 75
    assert calculate_report_magnitude(Urgency.LOW, None) == 10


def test_incident_magnitude_is_average_plus_bonuses() -> None:
    reports = [
        calculate_report_magnitude(Urgency.HIGH, 3),
        calculate_report_magnitude(Urgency.CRITICAL, 10),
        calculate_report_magnitude(Urgency.MEDIUM, 0),
    ]
    average = sum(reports) / len(reports)  # 47.67

    assert calculate_incident_magnitude(average, report_count=3, is_verified=True) == 69
    assert calculate_incident_magnitude(average, report_count=1, is_verified=False) == 48
    assert calculate_incident_magnitude(90, report_count=10, is_verified=True) == 100


def test_magnitude_level() -> None:
    assert [get_magnitude_level(m) for m in (0, 20, 21, 69, 100)] == [1, 1, 2, 4, 5]
