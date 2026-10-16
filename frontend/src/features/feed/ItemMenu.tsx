import { ConfirmButton } from "../../components/ConfirmButton";
import { t } from "../../i18n";
import styles from "./Feed.module.css";

interface ItemMenuProps {
  canDelete: boolean;
  canReport: boolean;
  busy: boolean;
  onDelete: () => void;
  onReport: () => void;
}

/** Quiet Delete / Report actions for a post or comment (tap twice, no pop-up). */
export function ItemMenu({ canDelete, canReport, busy, onDelete, onReport }: ItemMenuProps) {
  if (!canDelete && !canReport) return null;
  return (
    <div className={styles.itemMenu}>
      {canDelete && (
        <ConfirmButton
          variant="ghost"
          icon="trash"
          className={styles.quiet}
          disabled={busy}
          confirmLabel={t.feed.confirmDelete}
          onConfirm={onDelete}
        >
          {t.feed.delete}
        </ConfirmButton>
      )}
      {canReport && (
        <ConfirmButton
          variant="ghost"
          icon="flag"
          className={styles.quiet}
          disabled={busy}
          confirmLabel={t.feed.confirmReport}
          onConfirm={onReport}
        >
          {t.feed.report}
        </ConfirmButton>
      )}
    </div>
  );
}
