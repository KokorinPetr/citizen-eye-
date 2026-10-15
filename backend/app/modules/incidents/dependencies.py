from typing import Annotated

from fastapi import Depends, Query

from app.modules.incidents.enums import IncidentStatus, NeedType, Urgency
from app.modules.incidents.schemas import IncidentFilters
from app.shared.geo import BBox, parse_bbox


def get_incident_filters(
    bbox: Annotated[BBox | None, Depends(parse_bbox)],
    status: Annotated[
        list[IncidentStatus] | None, Query(description="Repeatable. Default: open + in_progress")
    ] = None,
    need_type: Annotated[list[NeedType] | None, Query(description="Repeatable (any of)")] = None,
    urgency: Annotated[list[Urgency] | None, Query(description="Repeatable (any of)")] = None,
    verified: Annotated[bool | None, Query(description="true = verified only")] = None,
) -> IncidentFilters:
    return IncidentFilters(
        bbox=bbox,
        statuses=status or [],
        need_types=need_type or [],
        urgencies=urgency or [],
        verified=verified,
    )


IncidentFiltersDep = Annotated[IncidentFilters, Depends(get_incident_filters)]
