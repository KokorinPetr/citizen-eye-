from app.modules.reports.schemas import ParsedReport
from app.modules.reports.service import build_fallback_report


def test_unknown_values_from_ai_fall_back_to_safe_defaults() -> None:
    parsed = ParsedReport.model_validate(
        {
            "title": "Help",
            "need_type": "Helicopter",
            "urgency": "EXTREME",
            "people_affected": "many",
            "tasks": [{"title": "Fly", "role": "pilot", "needed_count": 500}],
        }
    )

    assert parsed.need_type == "other"
    assert parsed.urgency == "medium"
    assert parsed.people_affected is None
    assert parsed.tasks[0].role == "general"
    assert parsed.tasks[0].needed_count == 50


def test_values_are_normalized() -> None:
    parsed = ParsedReport.model_validate(
        {"title": "Help", "need_type": " Medicine ", "urgency": "HIGH", "people_affected": "4"}
    )

    assert (parsed.need_type, parsed.urgency, parsed.people_affected) == ("medicine", "high", 4)


def test_fallback_report_uses_the_text() -> None:
    parsed = build_fallback_report("Water   is rising\nplease help " + "x" * 100)

    assert parsed.title.startswith("Water is rising please help")
    assert len(parsed.title) == 80
    assert parsed.need_type == "other"
    assert parsed.urgency == "medium"
