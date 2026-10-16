import type { Map as LeafletMap } from "leaflet";
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, useMapEvents } from "react-leaflet";
import type { GeoPoint } from "../../api/types";
import { Button } from "../../components/Button";
import { useGeolocation } from "../../hooks/useGeolocation";
import { t } from "../../i18n";
import { MapResizer } from "./MapResizer";
import { useMapView } from "./MapViewContext";
import styles from "./PinPicker.module.css";

const PICK_ZOOM = 16;

function CenterReporter({ onChange, onReady }: { onChange: (point: GeoPoint) => void; onReady: (map: LeafletMap) => void }) {
  const map = useMapEvents({
    moveend: () => {
      const center = map.getCenter();
      onChange({ lat: Number(center.lat.toFixed(6)), lng: Number(center.lng.toFixed(6)) });
    },
  });
  useEffect(() => {
    onReady(map);
    const center = map.getCenter();
    onChange({ lat: center.lat, lng: center.lng });
  }, [map, onChange, onReady]);
  return null;
}

/** Choose a location: a fixed pin in the centre, the user moves the map (easy on phones). */
export function PinPicker({ onChange }: { onChange: (point: GeoPoint) => void }) {
  const { view, setMyLocation } = useMapView();
  const [map, setMap] = useState<LeafletMap | null>(null);
  const { locate, locating, error } = useGeolocation();

  return (
    <div className={styles.picker}>
      <MapContainer
        className={styles.map}
        center={view.center}
        zoom={Math.max(view.zoom, 13)}
        zoomControl={false}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          maxZoom={19}
        />
        <CenterReporter onChange={onChange} onReady={setMap} />
        <MapResizer />
      </MapContainer>
      <svg className={styles.pin} width="44" height="58" viewBox="0 0 24 32" aria-hidden="true">
        <path d="M12 1C12 1 3 12.5 3 20a9 9 0 0 0 18 0C21 12.5 12 1 12 1Z" fill="currentColor" stroke="#fff" strokeWidth="2" />
        <circle cx="12" cy="20" r="3.5" fill="#fff" />
      </svg>
      <div className={styles.locate}>
        <Button
          variant="secondary"
          icon="pin"
          disabled={locating || !map}
          onClick={() =>
            locate((position) => {
              setMyLocation(position);
              map?.setView([position.lat, position.lng], PICK_ZOOM);
            })
          }
        >
          {error ? t.ask.locationError : t.ask.useMyLocation}
        </Button>
      </div>
    </div>
  );
}
