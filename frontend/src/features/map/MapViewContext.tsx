import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Position } from "../../hooks/useGeolocation";
import { loadJson, saveJson } from "../../utils/storage";
import { bboxAround, isValidBbox } from "./bbox";

export interface MapView {
  center: [number, number]; // [lat, lng]
  zoom: number;
  /** "min_lng,min_lat,max_lng,max_lat", rounded so tiny moves don't refetch. */
  bbox: string | null;
}

interface MapViewContextValue {
  /** `view.bbox` is always a valid area (falls back to an area around the centre). */
  view: MapView & { bbox: string };
  setView: (view: MapView) => void;
  /** A place the map should fly to (set when a detail sheet opens, or by "locate me"). */
  focus: Focus | null;
  focusOn: (lat: number, lng: number, options?: FocusOptions) => void;
  /** Called once the map has flown there, so remounting the map doesn't fly again. */
  clearFocus: () => void;
  /** Where the person is, once they let us locate them (only kept in memory). */
  myLocation: Position | null;
  setMyLocation: (position: Position) => void;
}

interface FocusOptions {
  /** Keep the place visible next to a detail sheet (default) or put it in the middle. */
  besideSheet?: boolean;
  zoom?: number;
}

export interface Focus extends FocusOptions {
  lat: number;
  lng: number;
  /** Changes on every request, so focusing the same place twice still flies. */
  requestId: number;
}

const THAILAND: MapView = { center: [13.0, 101.0], zoom: 6, bbox: null };
const KEY = "civic_eye_map_view";

const MapViewContext = createContext<MapViewContextValue | null>(null);

/** Shared map position: the list and the alert banner use the area the map shows. */
export function MapViewProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<MapView>(() => loadJson(KEY, THAILAND));
  const [focus, setFocus] = useState<Focus | null>(null);
  const [myLocation, setMyLocation] = useState<Position | null>(null);
  const focusOn = useCallback(
    (lat: number, lng: number, options: FocusOptions = {}) =>
      setFocus({ lat, lng, ...options, requestId: Date.now() }),
    [],
  );
  const clearFocus = useCallback(() => setFocus(null), []);
  useEffect(() => saveJson(KEY, view), [view]);
  const bbox = isValidBbox(view.bbox) ? view.bbox : bboxAround(view.center, view.zoom);
  return (
    <MapViewContext.Provider
      value={{ view: { ...view, bbox }, setView, focus, focusOn, clearFocus, myLocation, setMyLocation }}
    >
      {children}
    </MapViewContext.Provider>
  );
}

// Hook lives next to its provider on purpose.
// eslint-disable-next-line react-refresh/only-export-components
export function useMapView(): MapViewContextValue {
  const value = useContext(MapViewContext);
  if (!value) throw new Error("useMapView must be used inside MapViewProvider");
  return value;
}
