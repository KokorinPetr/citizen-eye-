import { useNavigate } from "react-router";
import type { Post, PostResponse } from "../../api/types";
import { Button } from "../../components/Button";
import { ConfirmButton } from "../../components/ConfirmButton";
import { Actions, Meta, Note, Section } from "../../components/Detail";
import { FormError } from "../../components/Form";
import { t } from "../../i18n";
import { timeAgo } from "../../utils/format";
import { useAcceptResponse, useClosePost, useDeletePost, useResponses } from "./api";
import styles from "./Responses.module.css";

/** For the author (or a coordinator): every response, Accept one, then close or delete the post. */
export function ResponseInbox({ post, isAuthor }: { post: Post; isAuthor: boolean }) {
  const { data: responses = [] } = useResponses(post.id, true);
  const accept = useAcceptResponse(post.id);
  const visible = responses.filter((response) => response.status !== "withdrawn");

  return (
    <>
      <Section title={t.community.inbox}>
        {isAuthor && <Meta>{t.community.youAreAuthor}</Meta>}
        {visible.length === 0 ? (
          <Meta>{t.community.inboxEmpty}</Meta>
        ) : (
          <ul className={styles.inbox}>
            {visible.map((response) => (
              <ResponseRow
                key={response.id}
                response={response}
                canAccept={post.status === "open" && response.status === "pending"}
                busy={accept.isPending}
                onAccept={() => accept.mutate(response.id)}
              />
            ))}
          </ul>
        )}
        <FormError message={accept.error?.message} />
      </Section>
      <PostOwnerActions post={post} />
    </>
  );
}

interface ResponseRowProps {
  response: PostResponse;
  canAccept: boolean;
  busy: boolean;
  onAccept: () => void;
}

function ResponseRow({ response, canAccept, busy, onAccept }: ResponseRowProps) {
  const declined = response.status === "declined";
  return (
    <li className={[styles.response, declined && styles.declined].filter(Boolean).join(" ")}>
      <span className={styles.label}>
        {response.user.full_name}
        {response.user.has_vehicle && ` 🚗 ${t.community.hasVehicle}`}, {timeAgo(response.created_at)}
      </span>
      <p className={styles.message}>{response.message}</p>
      {response.status === "accepted" && <span className={styles.badge}>✓ {t.community.accepted}</span>}
      {declined && <Meta>{t.community.responseStatus.declined}</Meta>}
      {canAccept && (
        <Button icon="check" disabled={busy} onClick={onAccept}>
          {t.community.accept}
        </Button>
      )}
    </li>
  );
}

function PostOwnerActions({ post }: { post: Post }) {
  const navigate = useNavigate();
  const close = useClosePost(post.id);
  const remove = useDeletePost(post.id);
  const busy = close.isPending || remove.isPending;

  return (
    <Section>
      {close.isSuccess && <Note>{t.community.solved}</Note>}
      <Actions>
        {post.status !== "closed" && (
          <ConfirmButton
            variant="secondary"
            icon="check"
            disabled={busy}
            confirmLabel={t.community.confirmSolved}
            onConfirm={() => close.mutate()}
          >
            {t.community.markSolved}
          </ConfirmButton>
        )}
        <ConfirmButton
          variant="ghost"
          disabled={busy}
          confirmLabel={t.community.confirmDelete}
          onConfirm={() => remove.mutate(undefined, { onSuccess: () => navigate("/") })}
        >
          {t.community.delete}
        </ConfirmButton>
      </Actions>
      <FormError message={(close.error ?? remove.error)?.message} />
    </Section>
  );
}
