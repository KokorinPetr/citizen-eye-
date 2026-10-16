import styles from "./Avatar.module.css";

const TONES = [styles.green, styles.blue, styles.sand, styles.rose] as const;

/** Same name → same colour, so people are easy to recognise in a thread. */
function toneFor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}

/** Round initial for a person (no photos). */
export function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={[styles.avatar, toneFor(name), small && styles.small].filter(Boolean).join(" ")}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
