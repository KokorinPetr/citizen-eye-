import type { CSSProperties } from "react";
import { Link } from "react-router";
import { useMode } from "../../app/ModeContext";
import { TopBar } from "../../app/TopBar";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { format, t } from "../../i18n";
import { formatBaht, timeAgo } from "../../utils/format";
import { usePosts } from "../community/api";
import { useIncidents } from "../incidents/api";
import { useMapView } from "../map/MapViewContext";
import { POST_EMOJI, incidentColor } from "../map/meta";
import styles from "./ListScreen.module.css";

/** The same things as the map (current map area), as an easy-to-scan list. */
export function ListScreen() {
  const { mode } = useMode();
  return (
    <div className={styles.screen}>
      <TopBar variant="static" />
      <div className={styles.content}>
        {mode === "emergency" ? <IncidentList /> : <PostList />}
      </div>
    </div>
  );
}

function IncidentList() {
  const { view } = useMapView();
  const { data: incidents, isPending, error, refetch } = useIncidents(view.bbox, false);
  if (isPending) return <LoadingState />;
  if (error) return <ErrorState message={error.message} onRetry={() => void refetch()} />;

  return (
    <>
      <h1 className={styles.heading}>{t.list.titleEmergency}</h1>
      {incidents.length === 0 ? (
        <EmptyState emoji="🌤️" title={t.list.empty} />
      ) : (
        <ul className={styles.items}>
          {incidents.map((incident) => (
            <li key={incident.id}>
              <Link to={`/incidents/${incident.id}`} className={styles.item}>
                <span
                  className={styles.marker}
                  style={{ background: incidentColor(incident) } as CSSProperties}
                  aria-hidden="true"
                />
                <span className={styles.text}>
                  <span className={styles.title}>{incident.title}</span>
                  <span className={styles.meta}>
                    {t.urgency[incident.urgency]}, {t.needType[incident.need_type].toLowerCase()},{" "}
                    {format(t.incident.peopleGoing, {
                      going: incident.helpers_signed_up,
                      needed: incident.helpers_needed,
                    })}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function PostList() {
  const { view } = useMapView();
  const { data: posts, isPending, error, refetch } = usePosts(view.bbox, [], false);
  if (isPending) return <LoadingState />;
  if (error) return <ErrorState message={error.message} onRetry={() => void refetch()} />;

  return (
    <>
      <h1 className={styles.heading}>{t.list.titleCommunity}</h1>
      {posts.length === 0 ? (
        <EmptyState emoji="🏘" title={t.list.empty} />
      ) : (
        <ul className={styles.items}>
          {posts.map((post) => (
            <li key={post.id}>
              <Link to={`/posts/${post.id}`} className={styles.item}>
                <span className={styles.emoji} aria-hidden="true">
                  {POST_EMOJI[post.category]}
                </span>
                <span className={styles.text}>
                  <span className={styles.title}>{post.title}</span>
                  <span className={styles.meta}>
                    {t.community.category[post.category]}, {timeAgo(post.created_at)}
                  </span>
                </span>
                {post.reward_amount ? (
                  <span className={styles.reward}>{formatBaht(post.reward_amount)} ฿</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
