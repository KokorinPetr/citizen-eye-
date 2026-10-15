"""When a new report joins an existing incident, and how the fields are combined."""

from app.modules.incidents.enums import NeedType, Urgency

# Needs that describe the same kind of situation. A new report only joins an incident nearby whose
# need is in the same group (or `other`, which matches anything).
NEED_GROUPS: tuple[frozenset[NeedType], ...] = (
    frozenset({NeedType.EVACUATION, NeedType.BOAT}),  # rescue
    frozenset({NeedType.MEDICINE, NeedType.MEDICAL}),  # health
    frozenset({NeedType.FOOD, NeedType.WATER}),  # supplies
    frozenset({NeedType.SHELTER}),
)
URGENCY_ORDER = list(Urgency)  # low < medium < high < critical


def matching_need_types(need_type: NeedType) -> set[NeedType]:
    if need_type == NeedType.OTHER:
        return set(NeedType)
    group = next((group for group in NEED_GROUPS if need_type in group), frozenset({need_type}))
    return set(group) | {NeedType.OTHER}


def max_urgency(current: Urgency, new: Urgency) -> Urgency:
    """Urgency never goes down when more reports arrive."""
    return max(current, new, key=URGENCY_ORDER.index)


def max_optional(current: int | None, new: int | None) -> int | None:
    """Two reports usually describe the same people, so take the larger number, not the sum."""
    values = [value for value in (current, new) if value is not None]
    return max(values) if values else None
