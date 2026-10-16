import type { FeedComment } from "../../api/types";
import { Avatar } from "../../components/Avatar";
import { Icon } from "../../components/Icon";
import { t } from "../../i18n";
import { timeAgo } from "../../utils/format";
import { canManage } from "../../utils/permissions";
import { useAuth } from "../auth/AuthProvider";
import { useDeleteComment, useLikeComment, useReportComment } from "./api";
import styles from "./Feed.module.css";
import { ItemMenu } from "./ItemMenu";
import { LikeButton } from "./LikeButton";

interface CommentItemProps {
  postId: string;
  comment: FeedComment;
  onReply: (comment: FeedComment) => void;
}

export function CommentItem({ postId, comment, onReply }: CommentItemProps) {
  const { user, isLoggedIn } = useAuth();
  const like = useLikeComment(postId);
  const remove = useDeleteComment(postId);
  const report = useReportComment();

  return (
    <article className={styles.comment}>
      <Avatar name={comment.author.full_name} small />
      <div className={styles.commentMain}>
        <p className={styles.commentText}>
          <span className={styles.name}>{comment.author.full_name}</span>{" "}
          <span className={styles.meta}>{timeAgo(comment.created_at)}</span>
          <br />
          {comment.body}
        </p>
        <div className={styles.commentActions}>
          <LikeButton
            liked={comment.liked_by_me}
            count={comment.like_count}
            onToggle={(liked) => like.mutate({ id: comment.id, liked })}
          />
          {isLoggedIn && (
            <button type="button" className={styles.action} onClick={() => onReply(comment)}>
              <Icon name="reply" size={18} />
              {t.feed.reply}
            </button>
          )}
          {user && (
            <ItemMenu
              canDelete={canManage(user, comment.author.id)}
              canReport={user.id !== comment.author.id && !report.isSuccess}
              busy={remove.isPending || report.isPending}
              onDelete={() => remove.mutate(comment.id)}
              onReport={() => report.mutate(comment.id)}
            />
          )}
        </div>
        {report.isSuccess && <span className={styles.meta}>{t.feed.reported}</span>}
      </div>
    </article>
  );
}
