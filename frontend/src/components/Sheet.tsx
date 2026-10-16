import { useEffect, useState, type ReactNode } from "react";
import { t } from "../i18n";
import { Icon } from "./Icon";
import styles from "./Sheet.module.css";

interface SheetProps {
  label: string;
  onClose: () => void;
  children: ReactNode;
  /** Pinned under the scrolling content (e.g. a comment box). */
  footer?: ReactNode;
  /**
   * Over a list instead of the map: taller, dims what's behind it (tap there or press Escape to
   * close), and a centred column on desktop.
   */
  modal?: boolean;
}

/** Details panel: bottom sheet on phones (tap the handle to expand), side panel on desktop. */
export function Sheet({ label, onClose, children, footer, modal = false }: SheetProps) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!modal) return;
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [modal, onClose]);

  return (
    <>
      {modal && <div className={styles.scrim} aria-hidden="true" onClick={onClose} />}
      <section
        className={[styles.sheet, modal && styles.modal, expanded && styles.expanded].filter(Boolean).join(" ")}
        aria-label={label}
        aria-modal={modal || undefined}
        role={modal ? "dialog" : undefined}
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
        {footer && <div className={styles.footer}>{footer}</div>}
      </section>
    </>
  );
}
