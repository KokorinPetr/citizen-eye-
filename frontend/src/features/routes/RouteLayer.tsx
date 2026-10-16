import { latLngBounds, point } from "leaflet";
import { Fragment, useEffect } from "react";
import { CircleMarker, Polyline, useMap } from "react-leaflet";
import { useRoutes } from "./RoutesContext";

const DESKTOP_MIN_WIDTH = 900;
const PANEL_WIDTH = 400;

/** Draws the routes from the incident sheet; the selected one on top and stronger. */
export function RouteLayer() {
  const map = useMap();
  const { routes, selected, select } = useRoutes();

  // Fit all routes into the part of the map not covered by the sheet / panel.
  useEffect(() => {
    if (routes.length === 0) return;
    const bounds = latLngBounds(routes.flatMap(({ route }) => route.path));
    const size = map.getSize();
    const desktop = size.x >= DESKTOP_MIN_WIDTH;
    map.flyToBounds(bounds, {
      paddingTopLeft: point(desktop ? PANEL_WIDTH + 48 : 24, desktop ? 48 : 140),
      paddingBottomRight: point(24, desktop ? 48 : Math.round(size.y * 0.55)),
      maxZoom: 16,
      duration: 0.6,
    });
  }, [routes, map]);

  // Selected route last, so it is drawn on top.
  const order = routes.map((_, index) => index).sort((a, b) => Number(a === selected) - Number(b === selected));

  return order.map((index) => {
    const { center, route } = routes[index];
    const isSelected = index === selected;
    const end = route.path[route.path.length - 1];
    return (
      <Fragment key={center.id}>
        <Polyline
          positions={route.path}
          pathOptions={{
            color: isSelected ? "var(--blue-700)" : "var(--blue-600)",
            weight: isSelected ? 7 : 5,
            opacity: isSelected ? 0.95 : 0.45,
            dashArray: route.kind === "straight_line" ? "8 10" : undefined,
            lineCap: "round",
          }}
          eventHandlers={{ click: () => select(index) }}
        />
        <CircleMarker
          center={end}
          radius={isSelected ? 8 : 6}
          pathOptions={{ color: "#fff", weight: 3, fillColor: "var(--blue-700)", fillOpacity: 1 }}
          eventHandlers={{ click: () => select(index) }}
        />
      </Fragment>
    );
  });
}
