import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import type { FeedTopic } from "../../api/types";
import { Button } from "../../components/Button";
import { Choices, Field, FormError } from "../../components/Form";
import formStyles from "../../components/Form.module.css";
import { Sheet } from "../../components/Sheet";
import { t } from "../../i18n";
import { AuthForm } from "../auth/AuthForm";
import { useAuth } from "../auth/AuthProvider";
import { useCreateFeedPost } from "./api";
import styles from "./Feed.module.css";
import { TOPIC_EMOJI } from "./meta";

const TOPICS = Object.keys(t.feed.topic) as FeedTopic[];

/** Quick post: topic, text, optional area name. No pin and no AI step on purpose. */
export function NewFeedPost() {
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const close = useCallback(() => navigate("/feed"), [navigate]);
  const [topic, setTopic] = useState<FeedTopic>("complaint");
  const [body, setBody] = useState("");
  const [area, setArea] = useState("");
  const create = useCreateFeedPost();

  const publish = () =>
    create.mutate(
      { topic, body: body.trim(), area_text: area.trim() || null },
      { onSuccess: (post) => navigate(`/feed/${post.id}`, { replace: true }) },
    );

  return (
    <Sheet modal label={t.feed.newTitle} onClose={close}>
      <div className={styles.newPost}>
        <h2 className={styles.commentsTitle}>{t.feed.newTitle}</h2>
        {!isLoggedIn ? (
          <AuthForm />
        ) : (
          <>
            <Choices
              label={t.feed.newTopic}
              options={TOPICS.map((value) => ({ value, label: t.feed.topic[value], emoji: TOPIC_EMOJI[value] }))}
              selected={[topic]}
              onChange={([value]) => setTopic(value)}
            />
            <Field label={t.feed.newBody} hint={t.feed.newBodyHint}>
              {(control) => (
                <textarea
                  {...control}
                  className={formStyles.input}
                  value={body}
                  maxLength={2000}
                  placeholder={t.feed.newBodyPlaceholder}
                  onChange={(event) => setBody(event.target.value)}
                />
              )}
            </Field>
            <Field label={t.feed.area} hint={t.feed.areaHint}>
              {(control) => (
                <input
                  {...control}
                  className={formStyles.input}
                  value={area}
                  maxLength={100}
                  placeholder={t.feed.areaPlaceholder}
                  onChange={(event) => setArea(event.target.value)}
                />
              )}
            </Field>
            <Button block disabled={body.trim().length < 3 || create.isPending} onClick={publish}>
              {create.isPending ? t.feed.publishing : t.feed.publish}
            </Button>
            <FormError message={create.error?.message} />
          </>
        )}
      </div>
    </Sheet>
  );
}
