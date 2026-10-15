import type { CSSProperties, ReactNode } from "react";
import styles from "./Pill.module.css";

/** Small label. `dotColor` is a CSS colour (from tokens) for urgency / status. */
export function Pill({ children, dotColor }: { children: ReactNode; dotColor?: string }) {
  return (
    <span className={styles.pill}>
      {dotColor && <span className={styles.dot} style={{ background: dotColor } as CSSProperties} />}
      {children}
    </span>
  );
}
