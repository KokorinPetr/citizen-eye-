import { Circle, CircleMarker } from "react-leaflet";
import { useMapView } from "./MapViewContext";

/** Blue dot where the person is, with a soft circle showing how accurate the GPS is. */
export function MyLocationLayer() {
  const { myLocation } = useMapView();
  if (!myLocation) return null;
  const center: [number, number] = [myLocation.lat, myLocation.lng];

  return (
    <>
      <Circle
        center={center}
        radius={myLocation.accuracy}
        interactive={false}
        pathOptions={{ stroke: false, fillColor: "var(--blue-600)", fillOpacity: 0.12 }}
      />
      <CircleMarker
        center={center}
        radius={8}
        interactive={false}
        pathOptions={{ color: "#fff", weight: 3, fillColor: "var(--blue-600)", fillOpacity: 1 }}
      />
    </>
  );
}
