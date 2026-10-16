import { useNavigate } from "react-router";
import { Icon } from "../../components/Icon";
import { t } from "../../i18n";
import { useAuth } from "../auth/AuthProvider";
import styles from "./Feed.module.css";

interface LikeButtonProps {
  liked: boolean;
  count: number;
  onToggle: (liked: boolean) => void;
}

/** Heart with a count. Logged-out people are sent to log in. */
export function LikeButton({ liked, count, onToggle }: LikeButtonProps) {
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className={[styles.action, liked && styles.liked].filter(Boolean).join(" ")}
      aria-pressed={liked}
      aria-label={`${liked ? t.feed.unlike : t.feed.like} (${count})`}
      onClick={() => (isLoggedIn ? onToggle(!liked) : navigate("/me"))}
    >
      <Icon name="heart" size={20} />
      {count}
    </button>
  );
}
