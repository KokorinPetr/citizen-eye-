import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router";
import type { FeedComment, FeedPost } from "../../api/types";
import { Meta, Note } from "../../components/Detail";
import { FormError } from "../../components/Form";
import { Sheet } from "../../components/Sheet";
import { ErrorState, LoadingState } from "../../components/States";
import { t } from "../../i18n";
import { canManage } from "../../utils/permissions";
import { useAuth } from "../auth/AuthProvider";
import { useComments, useDeleteFeedPost, useFeedPost, useReportPost } from "./api";
import { CommentComposer } from "./CommentComposer";
import { CommentItem } from "./CommentItem";
import styles from "./Feed.module.css";
import { FeedCard } from "./FeedCard";
import { ItemMenu } from "./ItemMenu";

/** A post with its comments, over the feed. Replies sit under their comment (one level). */
export function ThreadSheet() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const close = useCallback(() => navigate("/feed"), [navigate]);
  const { data: post, isPending, error, refetch } = useFeedPost(id);
  const [replyTo, setReplyTo] = useState<FeedComment | null>(null);

  return (
    <Sheet
      modal
      label={t.feed.commentsTitle}
      onClose={close}
      footer={post && <CommentComposer postId={post.id} replyTo={replyTo} onReplyDone={() => setReplyTo(null)} />}
    >
      {isPending && <LoadingState />}
      {error && <ErrorState message={error.message} onRetry={() => void refetch()} />}
      {post && (
        <>
          <FeedCard post={post} inThread />
          <PostMenu post={post} onDeleted={close} />
          <Comments postId={post.id} onReply={setReplyTo} />
        </>
      )}
    </Sheet>
  );
}

function PostMenu({ post, onDeleted }: { post: FeedPost; onDeleted: () => void }) {
  const { user } = useAuth();
  const remove = useDeleteFeedPost(post.id);
  const report = useReportPost(post.id);
  if (!user) return null;

  return (
    <>
      <ItemMenu
        canDelete={canManage(user, post.author.id)}
        canReport={user.id !== post.author.id && !report.isSuccess}
        busy={remove.isPending || report.isPending}
        onDelete={() => remove.mutate(undefined, { onSuccess: onDeleted })}
        onReport={() => report.mutate()}
      />
      {report.isSuccess && <Note>{t.feed.reported}</Note>}
      <FormError message={(remove.error ?? report.error)?.message} />
    </>
  );
}

function Comments({ postId, onReply }: { postId: string; onReply: (comment: FeedComment) => void }) {
  const { data: comments = [], isPending } = useComments(postId);
  const topLevel = comments.filter((comment) => comment.parent_id === null);
  const repliesOf = (id: string) => comments.filter((comment) => comment.parent_id === id);

  return (
    <section className={styles.comments} aria-label={t.feed.commentsTitle}>
      <h2 className={styles.commentsTitle}>{t.feed.commentsTitle}</h2>
      {isPending && <LoadingState />}
      {!isPending && comments.length === 0 && <Meta>{t.feed.noComments}</Meta>}
      <ul className={styles.commentList}>
        {topLevel.map((comment) => (
          <li key={comment.id}>
            <CommentItem postId={postId} comment={comment} onReply={onReply} />
            {repliesOf(comment.id).length > 0 && (
              <ul className={styles.replies}>
                {repliesOf(comment.id).map((reply) => (
                  <li key={reply.id}>
                    <CommentItem postId={postId} comment={reply} onReply={onReply} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
