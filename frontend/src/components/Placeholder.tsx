import { EmptyState } from "./States";
import styles from "./Placeholder.module.css";

/** Temporary screen for features that are built in a later step. */
export function Placeholder({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <EmptyState emoji={emoji} title={title}>
          <p>{body}</p>
        </EmptyState>
      </div>
    </div>
  );
}
