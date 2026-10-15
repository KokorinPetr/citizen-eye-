import type { ReactNode } from "react";
import styles from "./Screen.module.css";

/** Scrolling page with a centred column. */
export function Screen({ title, lead, children, top }: { title?: string; lead?: string; children: ReactNode; top?: ReactNode }) {
  return (
    <div className={styles.screen}>
      <div className={styles.content}>
        {top}
        {title && <h1 className={styles.title}>{title}</h1>}
        {lead && <p className={styles.lead}>{lead}</p>}
        {children}
      </div>
    </div>
  );
}

