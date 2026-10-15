import type { ReactNode } from "react";
import styles from "./AskLayout.module.css";

interface AskStepProps {
  title: string;
  hint?: string;
  /** Map steps fill the space; form steps scroll. */
  fill?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}

/** One step of a create flow: title, content, and buttons always reachable at the bottom. */
export function AskStep({ title, hint, fill = false, actions, children }: AskStepProps) {
  return (
    <div className={styles.step}>
      <header className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        {hint && <p className={styles.hint}>{hint}</p>}
      </header>
      <div className={fill ? styles.mapBody : styles.body}>{children}</div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
