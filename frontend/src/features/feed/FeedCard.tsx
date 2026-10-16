import { Link } from "react-router";
import type { FeedPost } from "../../api/types";
import { Avatar } from "../../components/Avatar";
import { Icon } from "../../components/Icon";
import { format, t } from "../../i18n";
import { timeAgo } from "../../utils/format";
import { useLikePost } from "./api";
import styles from "./Feed.module.css";
import { LikeButton } from "./LikeButton";
import { TOPIC_EMOJI } from "./meta";

/** One post: who, where, when, the text, then likes and comments. In a thread it shows in full. */
export function FeedCard({ post, inThread = false }: { post: FeedPost; inThread?: boolean }) {
  const like = useLikePost();
  const threadLink = `/feed/${post.id}`;

  return (
    <article className={[styles.card, inThread && styles.cardInThread].filter(Boolean).join(" ")}>
      <header className={styles.cardHeader}>
        <Avatar name={post.author.full_name} />
        <span className={styles.who}>
          <span className={styles.name}>{post.author.full_name}</span>
          <span className={styles.meta}>{[post.area_text, timeAgo(post.created_at)].filter(Boolean).join(", ")}</span>
        </span>
        <span className={styles.topic}>
          <span aria-hidden="true">{TOPIC_EMOJI[post.topic]}</span> {t.feed.topic[post.topic]}
        </span>
      </header>

      {inThread ? (
        <p className={styles.body}>{post.body}</p>
      ) : (
        <Link to={threadLink} className={[styles.body, styles.clamped].join(" ")}>
          {post.body}
        </Link>
      )}

      <footer className={styles.actions}>
        <LikeButton
          liked={post.liked_by_me}
          count={post.like_count}
          onToggle={(liked) => like.mutate({ id: post.id, liked })}
        />
        {inThread ? (
          <span className={styles.action} aria-label={format(t.feed.comments, { n: post.comment_count })}>
            <Icon name="chat" size={20} />
            {post.comment_count}
          </span>
        ) : (
          <Link
            to={threadLink}
            className={styles.action}
            aria-label={format(t.feed.comments, { n: post.comment_count })}
          >
            <Icon name="chat" size={20} />
            {post.comment_count}
          </Link>
        )}
      </footer>
    </article>
  );
}
