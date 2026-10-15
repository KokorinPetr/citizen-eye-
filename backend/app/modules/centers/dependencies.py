from typing import Annotated

from fastapi import Depends, Query

from app.modules.centers.enums import CenterStatus, CenterType
from app.modules.centers.schemas import CenterFilters
from app.modules.incidents.enums import NeedType
from app.shared.geo import BBox, parse_bbox


def get_center_filters(
    bbox: Annotated[BBox | None, Depends(parse_bbox)],
    center_type: Annotated[
        list[CenterType] | None, Query(description="Repeatable (any of)")
    ] = None,
    status: Annotated[list[CenterStatus] | None, Query(description="Repeatable (any of)")] = None,
    supply: Annotated[
        list[NeedType] | None, Query(description="Repeatable: places that provide any of these")
    ] = None,
    official: Annotated[
        bool | None, Query(description="true = official only (OSM/BMA), false = community only")
    ] = None,
) -> CenterFilters:
    return CenterFilters(
        bbox=bbox,
        center_types=center_type or [],
        statuses=status or [],
        supplies=supply or [],
        official=official,
    )


CenterFiltersDep = Annotated[CenterFilters, Depends(get_center_filters)]
