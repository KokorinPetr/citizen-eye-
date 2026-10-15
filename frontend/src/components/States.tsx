import type { ReactNode } from "react";
import { t } from "../i18n";
import { Button } from "./Button";
import styles from "./States.module.css";

export function LoadingState({ label = t.app.loading }: { label?: string }) {
  return (
    <div className={styles.state} role="status">
      <div className={styles.spinner} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

interface EmptyStateProps {
  emoji: string;
  title: string;
  children?: ReactNode;
}

export function EmptyState({ emoji, title, children }: EmptyStateProps) {
  return (
    <div className={styles.state}>
      <span className={styles.emoji} aria-hidden="true">
        {emoji}
      </span>
      <p className={styles.title}>{title}</p>
      {children}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className={styles.state} role="alert">
      <span className={styles.emoji} aria-hidden="true">
        🌧️
      </span>
      <p>{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          {t.app.retry}
        </Button>
      )}
    </div>
  );
}
