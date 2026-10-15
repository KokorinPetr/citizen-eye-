import type { CenterType, PostCategory } from "../../api/types";
import { useMode } from "../../app/ModeContext";
import { Chip } from "../../components/Chip";
import { t } from "../../i18n";
import styles from "./LayerBar.module.css";
import { CENTER_EMOJI, POST_EMOJI } from "./meta";
import type { Layers } from "./useLayers";

const CENTER_CHIPS: { type: CenterType; label: string }[] = [
  { type: "shelter", label: t.layers.shelters },
  { type: "supply_point", label: t.layers.supplies },
  { type: "hospital", label: t.layers.hospitals },
  { type: "fire_station", label: t.layers.fireStations },
  { type: "police", label: t.layers.police },
];

const POST_CATEGORIES = Object.keys(POST_EMOJI) as PostCategory[];

interface LayerBarProps {
  layers: Layers;
  update: (patch: Partial<Layers>) => void;
  toggleIn: <T>(list: T[], value: T) => T[];
}

/** Horizontal chip row under the mode switch: what to show on the map. */
export function LayerBar({ layers, update, toggleIn }: LayerBarProps) {
  const { mode } = useMode();

  if (mode === "community") {
    return (
      <div className={styles.bar} role="toolbar" aria-label={t.mode.community}>
        <Chip
          label={t.layers.withReward}
          emoji="฿"
          pressed={layers.withReward}
          onToggle={() => update({ withReward: !layers.withReward })}
          tone="blue"
        />
        {POST_CATEGORIES.map((category) => (
          <Chip
            key={category}
            label={t.community.category[category]}
            emoji={POST_EMOJI[category]}
            pressed={layers.postCategories.includes(category)}
            onToggle={() => update({ postCategories: toggleIn(layers.postCategories, category) })}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={styles.bar} role="toolbar" aria-label={t.mode.emergency}>
      <Chip
        label={t.layers.needHelp}
        emoji="💧"
        pressed={layers.incidents}
        onToggle={() => update({ incidents: !layers.incidents })}
      />
      <Chip
        label={t.layers.urgentOnly}
        pressed={layers.urgentOnly}
        onToggle={() => update({ urgentOnly: !layers.urgentOnly })}
        tone="blue"
      />
      {CENTER_CHIPS.map(({ type, label }) => (
        <Chip
          key={type}
          label={label}
          emoji={CENTER_EMOJI[type]}
          pressed={layers.centerTypes.includes(type)}
          onToggle={() => update({ centerTypes: toggleIn(layers.centerTypes, type) })}
        />
      ))}
    </div>
  );
}

export function ZoomHint() {
  return <p className={styles.hint}>{t.layers.zoomInForOfficial}</p>;
}
