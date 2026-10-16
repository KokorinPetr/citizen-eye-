import { useNavigate, useParams } from "react-router";
import { useFocusOnMap } from "../map/useFocusOnMap";
import type { Post } from "../../api/types";
import { ButtonLink } from "../../components/Button";
import { Actions, DetailHeader, Meta, Section } from "../../components/Detail";
import { Pill } from "../../components/Pill";
import { Sheet } from "../../components/Sheet";
import { ErrorState, LoadingState } from "../../components/States";
import { format, t } from "../../i18n";
import { formatBaht, timeAgo } from "../../utils/format";
import { canManage } from "../../utils/permissions";
import { useAuth } from "../auth/AuthProvider";
import { POST_EMOJI } from "../map/meta";
import { usePost } from "./api";
import { isExpired } from "./postState";
import { RespondPanel } from "./RespondPanel";
import { ResponseInbox } from "./ResponseInbox";
import styles from "./PostSheet.module.css";

export function PostSheet() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: post, isPending, error, refetch } = usePost(id);
  useFocusOnMap(post?.location, id);

  return (
    <Sheet label={post?.title ?? t.app.loading} onClose={() => navigate("/")}>
      {isPending && <LoadingState />}
      {error && <ErrorState message={error.message} onRetry={() => void refetch()} />}
      {post && <PostDetails post={post} />}
    </Sheet>
  );
}

function PostDetails({ post }: { post: Post }) {
  const { user } = useAuth();
  const manage = canManage(user, post.owner.id);
  const details = Object.entries(post.details ?? {}).filter(([, value]) => value !== null && value !== "");

  return (
    <>
      <DetailHeader
        pills={
          <>
            <Pill>
              {POST_EMOJI[post.category]} {t.community.category[post.category]}
            </Pill>
            {post.status === "matched" && <Pill>{t.community.matched}</Pill>}
            {post.status === "closed" && <Pill>{t.community.closed}</Pill>}
            {post.status !== "closed" && isExpired(post) && <Pill>{t.community.expired}</Pill>}
          </>
        }
        title={post.title}
        meta={`${format(t.community.postedBy, { name: post.owner.full_name })}, ${timeAgo(post.created_at)}`}
      />

      {post.reward_amount ? (
        <p className={styles.reward}>
          {format(t.community.reward, { amount: formatBaht(post.reward_amount) })}
          {post.reward_note && <span className={styles.rewardNote}>{post.reward_note}</span>}
        </p>
      ) : null}

      {post.contact_phone && (
        <Actions>
          <ButtonLink variant="secondary" icon="phone" href={`tel:${post.contact_phone}`}>
            {t.incident.contact}
          </ButtonLink>
        </Actions>
      )}

      <Section>
        {post.description && <p className={styles.description}>{post.description}</p>}
        {post.location_text && <Meta>📍 {post.location_text}</Meta>}
        <Meta>
          {post.response_count
            ? format(t.community.responses, { n: post.response_count })
            : t.community.responsesNone}
        </Meta>
      </Section>

      {details.length > 0 && (
        <Section title={t.community.details}>
          <dl className={styles.details}>
            {details.map(([key, value]) => (
              <div key={key} className={styles.detailRow}>
                <dt>{key.replace(/_/g, " ")}</dt>
                <dd>{String(value)}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      {manage ? (
        <ResponseInbox post={post} isAuthor={post.owner.id === user?.id} />
      ) : (
        <Section>
          <RespondPanel post={post} />
        </Section>
      )}
    </>
  );
}
