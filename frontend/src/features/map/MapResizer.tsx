import { useEffect } from "react";
import { useMap } from "react-leaflet";

/**
 * Leaflet doesn't notice when its container changes size (mobile address bar sliding in/out,
 * rotating the phone, the desktop panel). Re-measure whenever that happens.
 */
export function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}
