from enum import StrEnum


class CenterType(StrEnum):
    SHELTER = "shelter"
    SUPPLY_POINT = "supply_point"
    HOSPITAL = "hospital"
    FIRE_STATION = "fire_station"
    POLICE = "police"
    OTHER = "other"


class CenterStatus(StrEnum):
    OPEN = "open"
    FULL = "full"
    CLOSED = "closed"
    UNKNOWN = "unknown"


class CenterSource(StrEnum):
    USER = "user"  # created by a user in the app
    OSM = "osm"  # OpenStreetMap / Overpass
    BMA = "bma"  # Bangkok Metropolitan Administration
    OFFICIAL = "official"  # hand-entered from another official source


OFFICIAL_SOURCES = (CenterSource.OSM, CenterSource.BMA, CenterSource.OFFICIAL)
