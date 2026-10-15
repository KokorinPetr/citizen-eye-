import { useEffect } from "react";
import type { GeoPoint } from "../../api/types";
import { useMapView } from "./MapViewContext";

/** Fly the map to this point once it is known (call from a detail sheet). */
export function useFocusOnMap(location: GeoPoint | undefined, id: string) {
  const { focusOn } = useMapView();
  const lat = location?.lat;
  const lng = location?.lng;
  useEffect(() => {
    if (lat !== undefined && lng !== undefined) focusOn(lat, lng);
  }, [id, lat, lng, focusOn]);
}
