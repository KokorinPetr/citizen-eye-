import { MapContainer, TileLayer } from "react-leaflet";
import { Outlet } from "react-router";
import { useMode } from "../../app/ModeContext";
import { TopBar } from "../../app/TopBar";
import { LayerBar, ZoomHint } from "./LayerBar";
import { CenterMarkers, IncidentMarkers, PostMarkers } from "./MapLayers";
import styles from "./MapScreen.module.css";
import { FocusController } from "./FocusController";
import { MapResizer } from "./MapResizer";
import { MapTracker } from "./MapTracker";
import { useMapView } from "./MapViewContext";
import { OFFICIAL_MIN_ZOOM, OFFICIAL_TYPES, useLayers } from "./useLayers";

/** Full-screen map. Detail sheets render through <Outlet/> on top of it (/incidents/:id …). */
export function MapScreen() {
  const { mode } = useMode();
  const { view } = useMapView();
  const { layers, update, toggleIn } = useLayers();

  const zoomedIn = view.zoom >= OFFICIAL_MIN_ZOOM;
  const centerTypes = layers.centerTypes.filter((type) => zoomedIn || !OFFICIAL_TYPES.includes(type));
  const officialHidden = !zoomedIn && layers.centerTypes.some((type) => OFFICIAL_TYPES.includes(type));

  return (
    <div className={styles.screen}>
      <MapContainer
        className={styles.map}
        center={view.center}
        zoom={view.zoom}
        minZoom={5}
        zoomControl={false}
        attributionControl
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          maxZoom={19}
        />
        <MapTracker />
        <MapResizer />
        <FocusController />
        {mode === "emergency" ? (
          <>
            <CenterMarkers bbox={view.bbox} types={centerTypes} />
            {layers.incidents && <IncidentMarkers bbox={view.bbox} urgentOnly={layers.urgentOnly} />}
          </>
        ) : (
          <PostMarkers bbox={view.bbox} categories={layers.postCategories} withReward={layers.withReward} />
        )}
      </MapContainer>
      <TopBar variant="overlay">
        <LayerBar layers={layers} update={update} toggleIn={toggleIn} />
      </TopBar>
      {mode === "emergency" && officialHidden && <ZoomHint />}
      <Outlet />
    </div>
  );
}
