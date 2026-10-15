/** Map area helpers. A bbox is "min_lng,min_lat,max_lng,max_lat" (the backend's format). */

const DECIMALS = 4;

export function isValidBbox(bbox: string | null | undefined): bbox is string {
  if (!bbox) return false;
  const parts = bbox.split(",").map(Number);
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) return false;
  const [minLng, minLat, maxLng, maxLat] = parts;
  return minLng < maxLng && minLat < maxLat;
}

/** Approximate visible area around a centre for a zoom level (used when the map isn't measured). */
export function bboxAround([lat, lng]: [number, number], zoom: number): string {
  const halfLng = Math.min(180, 360 / 2 ** zoom); // ~ a phone screen wide
  const halfLat = Math.min(85, halfLng * 1.2);
  const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
  return [
    clamp(lng - halfLng, 180),
    clamp(lat - halfLat, 90),
    clamp(lng + halfLng, 180),
    clamp(lat + halfLat, 90),
  ]
    .map((value) => value.toFixed(DECIMALS))
    .join(",");
}

export function formatBbox(west: number, south: number, east: number, north: number): string | null {
  const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
  const bbox = [clamp(west, 180), clamp(south, 90), clamp(east, 180), clamp(north, 90)]
    .map((value) => value.toFixed(DECIMALS))
    .join(",");
  return isValidBbox(bbox) ? bbox : null; // a hidden / zero-size map gives an empty box
}
