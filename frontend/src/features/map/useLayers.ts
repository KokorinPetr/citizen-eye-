import { useEffect, useState } from "react";
import type { CenterType, PostCategory } from "../../api/types";
import { loadJson, saveJson } from "../../utils/storage";

export interface Layers {
  incidents: boolean;
  urgentOnly: boolean;
  centerTypes: CenterType[];
  postCategories: PostCategory[]; // empty = all
  withReward: boolean;
}

const DEFAULT_LAYERS: Layers = {
  incidents: true,
  urgentOnly: false,
  centerTypes: ["shelter", "supply_point"], // hospitals / fire / police: thousands, opt in
  postCategories: [],
  withReward: false,
};
const KEY = "civic_eye_layers";

export const OFFICIAL_TYPES: CenterType[] = ["hospital", "fire_station", "police"];
export const OFFICIAL_MIN_ZOOM = 10;

/** Which layers / filters are on. Remembered between visits. */
export function useLayers() {
  const [layers, setLayers] = useState<Layers>(() => ({ ...DEFAULT_LAYERS, ...loadJson(KEY, {}) }));
  useEffect(() => saveJson(KEY, layers), [layers]);

  const update = (patch: Partial<Layers>) => setLayers((current) => ({ ...current, ...patch }));
  const toggleIn = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  return { layers, update, toggleIn };
}
