import { point } from "leaflet";
import { useEffect } from "react";
import { useMap } from "react-leaflet";
import { useMapView } from "./MapViewContext";

const FOCUS_ZOOM = 15;
const DESKTOP_MIN_WIDTH = 900;
const PANEL_WIDTH = 400;

/**
 * Flies to the focused place so it is visible next to the detail sheet:
 * phones: in the upper part (the sheet covers the bottom half); desktop: right of the left panel.
 */
export function FocusController() {
  const map = useMap();
  const { focus, clearFocus } = useMapView();

  useEffect(() => {
    if (!focus) return;
    const zoom = Math.max(map.getZoom(), FOCUS_ZOOM);
    const size = map.getSize();
    const offset =
      size.x >= DESKTOP_MIN_WIDTH ? point(-PANEL_WIDTH / 2, 0) : point(0, size.y * 0.22);
    const target = map.unproject(map.project([focus.lat, focus.lng], zoom).add(offset), zoom);
    map.flyTo(target, zoom, { duration: 0.6 });
    clearFocus();
  }, [focus, map, clearFocus]);

  return null;
}
