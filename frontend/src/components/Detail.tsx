import type { CSSProperties, ReactNode } from "react";
import styles from "./Detail.module.css";

/** Building blocks for detail sheets, so incident / place / post look the same. */
export function DetailHeader({ pills, title, meta }: { pills?: ReactNode; title: string; meta?: ReactNode }) {
  return (
    <header className={styles.header}>
      {pills && <div className={styles.pills}>{pills}</div>}
      <h2 className={styles.title}>{title}</h2>
      {meta && <p className={styles.meta}>{meta}</p>}
    </header>
  );
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      {title && <h3 className={styles.sectionTitle}>{title}</h3>}
      {children}
    </section>
  );
}

export function Actions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>;
}

export function Progress({ label, value, max }: { label: string; value: number; max: number }) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={styles.progress}>
      <span className={styles.progressLabel}>{label}</span>
      <div className={styles.track} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
        <div className={styles.fill} style={{ width: `${percent}%` } as CSSProperties} />
      </div>
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className={styles.note}>{children}</p>;
}

export function Meta({ children }: { children: ReactNode }) {
  return <p className={styles.meta}>{children}</p>;
}
