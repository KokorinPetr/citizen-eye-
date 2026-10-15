import L from "leaflet";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CenterType, IncidentStatus, IncidentType, Urgency } from "./lib/types";
import { CENTER_ICON, TYPE_ICON } from "./lib/icons";

const cache = new Map<string, L.DivIcon>();

export function incidentIcon(type: IncidentType, urgency: Urgency, status: IncidentStatus, selected = false) {
  const key = `i-${type}-${urgency}-${status}-${selected}`;
  let icon = cache.get(key);
  if (!icon) {
    const svg = renderToStaticMarkup(createElement(TYPE_ICON[type], { size: 18, color: "#fff", strokeWidth: 2.4 }));
    icon = L.divIcon({
      className: "",
      html: `<div class="pin pin-${urgency} pin-${status}${selected ? " selected" : ""}">${svg}</div>`,
      iconSize: [38, 46],
      iconAnchor: [19, 44],
    });
    cache.set(key, icon);
  }
  return icon;
}

export function centerIcon(type: CenterType) {
  const key = `c-${type}`;
  let icon = cache.get(key);
  if (!icon) {
    const svg = renderToStaticMarkup(createElement(CENTER_ICON[type], { size: 14, color: "#fff", strokeWidth: 2.4 }));
    icon = L.divIcon({
      className: "",
      html: `<div class="cpin cpin-${type}">${svg}</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
    cache.set(key, icon);
  }
  return icon;
}

export const meIcon = L.divIcon({ className: "", html: `<div class="me-dot"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] });

export const draftIcon = L.divIcon({
  className: "",
  html: `<div class="pin pin-draft"><span></span></div>`,
  iconSize: [38, 46],
  iconAnchor: [19, 44],
});
