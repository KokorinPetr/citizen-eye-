/** Visual meaning of API values: colours (CSS token vars) and emoji. */
import type { CenterType, IncidentMapItem, PostCategory, Urgency } from "../../api/types";

export const URGENCY_COLOR: Record<Urgency, string> = {
  critical: "var(--urgency-critical)",
  high: "var(--urgency-high)",
  medium: "var(--urgency-medium)",
  low: "var(--urgency-low)",
};

export function incidentColor(incident: Pick<IncidentMapItem, "status" | "urgency">): string {
  return incident.status === "resolved" ? "var(--urgency-resolved)" : URGENCY_COLOR[incident.urgency];
}

export const CENTER_EMOJI: Record<CenterType, string> = {
  shelter: "🏠",
  supply_point: "📦",
  hospital: "🏥",
  fire_station: "🚒",
  police: "👮",
  other: "📍",
};

export const POST_EMOJI: Record<PostCategory, string> = {
  lost_pet: "🐾",
  found_pet: "🐶",
  lost_item: "👛",
  found_item: "🔑",
  help_wanted: "🙋",
  help_offered: "🤝",
  other: "📌",
};
