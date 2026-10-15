import { useState, type ReactNode } from "react";
import { t } from "../i18n";
import { Icon } from "./Icon";
import styles from "./Sheet.module.css";

interface SheetProps {
  label: string;
  onClose: () => void;
  children: ReactNode;
}

/** Details panel: bottom sheet on phones (tap the handle to expand), side panel on desktop. */
export function Sheet({ label, onClose, children }: SheetProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section
      className={[styles.sheet, expanded && styles.expanded].filter(Boolean).join(" ")}
      aria-label={label}
    >
      <div className={styles.header}>
        <button
          type="button"
          className={styles.handle}
          aria-label={expanded ? t.common.collapse : t.common.expand}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        />
        <button type="button" className={styles.iconButton} aria-label={t.common.close} onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
