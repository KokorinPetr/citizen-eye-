import L from "leaflet";
import type { Center, IncidentMapItem, Post } from "../../api/types";
import { CENTER_EMOJI, POST_EMOJI, incidentColor } from "./meta";
import styles from "./markers.module.css";

const DROP_PATH = "M12 1C12 1 3 12.5 3 20a9 9 0 0 0 18 0C21 12.5 12 1 12 1Z";
const cache = new Map<string, L.DivIcon>();

function cached(key: string, build: () => L.DivIcon): L.DivIcon {
  let icon = cache.get(key);
  if (!icon) {
    icon = build();
    cache.set(key, icon);
  }
  return icon;
}

/** Water drop: size = magnitude level (1-5), colour = urgency, outlined while help is coming. */
export function incidentIcon(incident: IncidentMapItem): L.DivIcon {
  const level = incident.magnitude_level;
  const color = incidentColor(incident);
  const inProgress = incident.status === "in_progress";
  return cached(`incident:${level}:${color}:${inProgress}`, () => {
    const width = 20 + level * 5;
    const height = Math.round(width * (32 / 24));
    const fill = inProgress ? "#ffffff" : color;
    return L.divIcon({
      className: styles.marker,
      iconSize: [width, height],
      iconAnchor: [width / 2, height - 2],
      html: `<svg viewBox="0 0 24 32" width="${width}" height="${height}" aria-hidden="true">
        <path d="${DROP_PATH}" fill="${fill}" stroke="${inProgress ? color : "#ffffff"}" stroke-width="2.2"/>
        <circle cx="12" cy="20" r="3.2" fill="${inProgress ? color : "#ffffff"}" opacity="0.9"/></svg>`,
    });
  });
}

export function centerIcon(center: Pick<Center, "center_type" | "is_official">): L.DivIcon {
  return cached(`center:${center.center_type}:${center.is_official}`, () =>
    L.divIcon({
      className: styles.marker,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      html: `<span class="${styles.badge} ${center.is_official ? styles.official : styles.community}">${
        CENTER_EMOJI[center.center_type]
      }</span>`,
    }),
  );
}

export function postIcon(post: Pick<Post, "category" | "reward_amount">): L.DivIcon {
  const hasReward = Boolean(post.reward_amount);
  return cached(`post:${post.category}:${hasReward}`, () =>
    L.divIcon({
      className: styles.marker,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      html: `<span class="${styles.badge} ${styles.post}">${POST_EMOJI[post.category]}${
        hasReward ? `<span class="${styles.reward}">฿</span>` : ""
      }</span>`,
    }),
  );
}
