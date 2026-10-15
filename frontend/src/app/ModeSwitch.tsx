import { t } from "../i18n";
import { useMode, type AppMode } from "./ModeContext";
import styles from "./ModeSwitch.module.css";

const OPTIONS: { mode: AppMode; emoji: string; label: string }[] = [
  { mode: "emergency", emoji: "🆘", label: t.mode.emergency },
  { mode: "community", emoji: "🏘", label: t.mode.community },
];

/** Emergency / Community switch, always visible at the top. */
export function ModeSwitch() {
  const { mode, setMode } = useMode();
  return (
    <div className={styles.switch} role="radiogroup" aria-label={t.mode.label}>
      {OPTIONS.map((option) => (
        <button
          key={option.mode}
          type="button"
          role="radio"
          aria-checked={mode === option.mode}
          className={[styles.option, option.mode === "community" && styles.community].filter(Boolean).join(" ")}
          onClick={() => setMode(option.mode)}
        >
          <span aria-hidden="true">{option.emoji}</span>
          {option.label}
        </button>
      ))}
    </div>
  );
}
