from app.modules.incidents.enums import NeedType, Urgency
from app.modules.incidents.merge_rules import matching_need_types, max_optional, max_urgency


def test_related_needs_match_but_different_problems_do_not() -> None:
    assert NeedType.EVACUATION in matching_need_types(NeedType.BOAT)
    assert NeedType.MEDICAL in matching_need_types(NeedType.MEDICINE)
    assert NeedType.WATER in matching_need_types(NeedType.FOOD)
    assert NeedType.FOOD not in matching_need_types(NeedType.BOAT)
    assert NeedType.SHELTER not in matching_need_types(NeedType.MEDICINE)


def test_other_matches_everything_both_ways() -> None:
    assert matching_need_types(NeedType.OTHER) == set(NeedType)
    assert NeedType.OTHER in matching_need_types(NeedType.SHELTER)


def test_combining_values() -> None:
    assert max_urgency(Urgency.HIGH, Urgency.MEDIUM) == Urgency.HIGH
    assert max_urgency(Urgency.MEDIUM, Urgency.CRITICAL) == Urgency.CRITICAL
    assert max_optional(3, 5) == 5
    assert max_optional(None, 2) == 2
    assert max_optional(None, None) is None
