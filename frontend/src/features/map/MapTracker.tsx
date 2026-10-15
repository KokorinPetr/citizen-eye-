import type { Map as LeafletMap } from "leaflet";
import { useEffect } from "react";
import { useMapEvents } from "react-leaflet";
import { formatBbox } from "./bbox";
import { useMapView, type MapView } from "./MapViewContext";

/** Current view, or null while the map has no size (hidden, being removed). */
function toView(map: LeafletMap): MapView | null {
  const size = map.getSize();
  if (size.x === 0 || size.y === 0) return null;
  const bounds = map.getBounds();
  const bbox = formatBbox(bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth());
  if (!bbox) return null;
  const center = map.getCenter();
  return { center: [center.lat, center.lng], zoom: map.getZoom(), bbox };
}

/** Keeps the shared map view (centre, zoom, bbox) in sync with the Leaflet map. */
export function MapTracker() {
  const { setView } = useMapView();
  const update = (map: LeafletMap) => {
    const view = toView(map);
    if (view) setView(view);
  };
  const map = useMapEvents({ moveend: () => update(map) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => update(map), [map]);
  return null;
}
