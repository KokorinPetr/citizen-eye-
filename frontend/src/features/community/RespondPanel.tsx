import { useState } from "react";
import type { Post, PostResponse } from "../../api/types";
import { Button, ButtonLink } from "../../components/Button";
import { ConfirmButton } from "../../components/ConfirmButton";
import { Meta, Note } from "../../components/Detail";
import { Field, FormError } from "../../components/Form";
import formStyles from "../../components/Form.module.css";
import { t } from "../../i18n";
import { timeAgo } from "../../utils/format";
import { useAuth } from "../auth/AuthProvider";
import { useRespond, useResponses, useWithdrawResponse } from "./api";
import { isOpenForResponses } from "./postState";
import styles from "./Responses.module.css";

/** For neighbours (not the author): send a response, then see its status or withdraw it. */
export function RespondPanel({ post }: { post: Post }) {
  const { isLoggedIn } = useAuth();
  const open = isOpenForResponses(post);
  // Non-authors only get their own responses back.
  const { data: responses = [], isPending } = useResponses(post.id, isLoggedIn);
  const mine = latestResponse(responses);

  if (!isLoggedIn) {
    return open ? (
      <ButtonLink to="/me" variant="secondary" icon="user">
        {t.community.loginToRespond}
      </ButtonLink>
    ) : (
      <Meta>{t.community.notOpen}</Meta>
    );
  }
  if (isPending) return null;
  if (mine) return <MyResponse postId={post.id} response={mine} />;
  if (!open) return <Meta>{t.community.notOpen}</Meta>;
  return <RespondForm post={post} />;
}

/** The newest response that is still worth showing (a withdrawn one lets you respond again). */
function latestResponse(responses: PostResponse[]): PostResponse | undefined {
  return responses
    .filter((response) => response.status !== "withdrawn")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

function RespondForm({ post }: { post: Post }) {
  const [message, setMessage] = useState("");
  const respond = useRespond(post.id);
  const label = t.community.respondTo[post.category];

  return (
    <div className={styles.form}>
      <Field label={label} hint={t.community.respondHint}>
        {(control) => (
          <textarea
            {...control}
            className={formStyles.input}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={t.community.respondPlaceholder}
            maxLength={1000}
          />
        )}
      </Field>
      <Button
        icon="check"
        disabled={message.trim().length === 0 || respond.isPending}
        onClick={() => respond.mutate(message.trim())}
      >
        {respond.isPending ? t.community.sending : t.community.sendResponse}
      </Button>
      <FormError message={respond.error?.message} />
    </div>
  );
}

function MyResponse({ postId, response }: { postId: string; response: PostResponse }) {
  const withdraw = useWithdrawResponse(postId);
  const active = response.status === "pending" || response.status === "accepted";

  return (
    <div className={styles.mine}>
      <span className={styles.label}>
        {t.community.yourResponse}, {timeAgo(response.created_at)}
      </span>
      <p className={styles.message}>{response.message}</p>
      {response.status === "accepted" ? (
        <Note>{t.community.responseStatus.accepted}</Note>
      ) : (
        <Meta>{t.community.responseStatus[response.status]}</Meta>
      )}
      {active && (
        <ConfirmButton
          variant="ghost"
          disabled={withdraw.isPending}
          confirmLabel={t.community.confirmWithdraw}
          onConfirm={() => withdraw.mutate(response.id)}
        >
          {t.community.withdraw}
        </ConfirmButton>
      )}
      <FormError message={withdraw.error?.message} />
    </div>
  );
}
