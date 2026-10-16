import { useEffect, useRef, useState } from "react";
import type { FeedComment } from "../../api/types";
import { ButtonLink } from "../../components/Button";
import { FormError } from "../../components/Form";
import { Icon } from "../../components/Icon";
import { format, t } from "../../i18n";
import { useAuth } from "../auth/AuthProvider";
import { useAddComment } from "./api";
import styles from "./Feed.module.css";

interface CommentComposerProps {
  postId: string;
  replyTo: FeedComment | null;
  onReplyDone: () => void;
}

/** Comment box pinned at the bottom of a thread. Logged-out readers get a login button instead. */
export function CommentComposer({ postId, replyTo, onReplyDone }: CommentComposerProps) {
  const { isLoggedIn } = useAuth();
  const [text, setText] = useState("");
  const add = useAddComment(postId);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (replyTo) input.current?.focus();
  }, [replyTo]);

  if (!isLoggedIn) {
    return (
      <ButtonLink to="/me" variant="secondary" icon="user" block>
        {t.feed.loginToJoin}
      </ButtonLink>
    );
  }

  const send = () =>
    add.mutate(
      { body: text.trim(), parent_id: replyTo?.id ?? null },
      {
        onSuccess: () => {
          setText("");
          onReplyDone();
        },
      },
    );

  return (
    <div className={styles.composer}>
      {replyTo && (
        <div className={styles.replyingTo}>
          {format(t.feed.replyingTo, { name: replyTo.author.full_name })}
          <button type="button" className={styles.action} aria-label={t.feed.cancelReply} onClick={onReplyDone}>
            <Icon name="close" size={18} />
          </button>
        </div>
      )}
      <div className={styles.composerRow}>
        <textarea
          ref={input}
          className={styles.composerInput}
          rows={1}
          value={text}
          maxLength={1000}
          placeholder={t.feed.commentPlaceholder}
          aria-label={t.feed.commentPlaceholder}
          onChange={(event) => setText(event.target.value)}
        />
        <button
          type="button"
          className={styles.sendButton}
          aria-label={t.feed.send}
          disabled={text.trim().length === 0 || add.isPending}
          onClick={send}
        >
          <Icon name="send" size={22} />
        </button>
      </div>
      <FormError message={add.error?.message} />
    </div>
  );
}
