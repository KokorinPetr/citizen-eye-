import type { ReactNode } from "react";
import { AlertBanner } from "../features/alerts/AlertBanner";
import { ModeSwitch } from "./ModeSwitch";
import styles from "./TopBar.module.css";

/** Mode switch + alert banner (+ screen extras like map filters), stacked so nothing overlaps. */
export function TopBar({ variant, children }: { variant: "overlay" | "static"; children?: ReactNode }) {
  return (
    <div className={variant === "overlay" ? styles.overlay : styles.static}>
      <div className={styles.inner}>
        <ModeSwitch />
        <AlertBanner />
      </div>
      {children}
    </div>
  );
}
