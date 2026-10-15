import styles from "./Chip.module.css";
import { Icon } from "./Icon";

interface ChipProps {
  label: string;
  emoji?: string;
  pressed: boolean;
  onToggle: () => void;
  tone?: "green" | "blue";
  /** solid: strong colour (map, over busy backgrounds). tonal: soft with a check (forms). */
  look?: "solid" | "tonal";
}

/** Toggle chip for filters and layers. */
export function Chip({ label, emoji, pressed, onToggle, tone = "green", look = "solid" }: ChipProps) {
  return (
    <button
      type="button"
      className={[styles.chip, tone === "blue" && styles.blue, look === "tonal" && styles.tonal]
        .filter(Boolean)
        .join(" ")}
      aria-pressed={pressed}
      onClick={onToggle}
    >
      {look === "tonal" && pressed && <Icon name="check" size={18} className={styles.check} />}
      {emoji && (
        <span className={styles.emoji} aria-hidden="true">
          {emoji}
        </span>
      )}
      {label}
    </button>
  );
}
