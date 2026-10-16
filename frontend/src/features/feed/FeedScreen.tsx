import { useState } from "react";
import { Link, Outlet, useSearchParams } from "react-router";
import type { FeedTopic } from "../../api/types";
import { Button, ButtonLink } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { Icon } from "../../components/Icon";
import { ErrorState, LoadingState } from "../../components/States";
import { t } from "../../i18n";
import { useAuth } from "../auth/AuthProvider";
import { useFeed, type FeedQuery } from "./api";
import styles from "./Feed.module.css";
import { FeedCard } from "./FeedCard";
import { TOPIC_EMOJI } from "./meta";

const TOPICS = Object.keys(t.feed.topic) as FeedTopic[];
type FeedView = "new" | "top" | "mine";

const VIEWS: { value: FeedView; label: string }[] = [
  { value: "new", label: t.feed.sortNew },
  { value: "top", label: t.feed.sortTop },
  { value: "mine", label: t.feed.mine },
];

function readView(value: string | null): FeedView {
  return VIEWS.some((view) => view.value === value) ? (value as FeedView) : "new";
}

/**
 * Neighbourhood talk: anyone can read; threads open in a sheet on top (child routes).
 * The view lives in the URL (`?view=mine`), so "See all" on Me can open it directly.
 */
export function FeedScreen() {
  const { user, isLoggedIn } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = readView(searchParams.get("view"));
  const [topic, setTopic] = useState<FeedTopic | null>(null);
  const query: FeedQuery = view === "mine" ? { sort: "new", topic, authorId: user?.id } : { sort: view, topic };
  const needsLogin = view === "mine" && !isLoggedIn;
  const feed = useFeed(query, !needsLogin && (view !== "mine" || user !== null));
  const posts = feed.data?.pages.flat() ?? [];
  const showView = (value: FeedView) => setSearchParams(value === "new" ? {} : { view: value }, { replace: true });

  return (
    <div className={styles.screen}>
      <div className={styles.scroll}>
        <div className={styles.content}>
          <header className={styles.header}>
            <h1 className={styles.title}>{t.feed.title}</h1>
            <div className={styles.segmented} role="group" aria-label={t.feed.sortLabel}>
              {VIEWS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={view === option.value}
                  onClick={() => showView(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </header>

          <Link to="/feed/new" className={styles.prompt}>
            <span className={styles.promptIcon}>
              <Icon name="plus" size={20} />
            </span>
            {t.feed.prompt}
          </Link>

          <div className={styles.topics} role="group" aria-label={t.feed.topicsLabel}>
            <Chip label={t.feed.allTopics} pressed={topic === null} onToggle={() => setTopic(null)} />
            {TOPICS.map((value) => (
              <Chip
                key={value}
                label={t.feed.topic[value]}
                emoji={TOPIC_EMOJI[value]}
                pressed={topic === value}
                onToggle={() => setTopic(topic === value ? null : value)}
              />
            ))}
          </div>

          {needsLogin && (
            <ButtonLink to="/me" variant="secondary" icon="user">
              {t.feed.loginForMine}
            </ButtonLink>
          )}
          {feed.isLoading && <LoadingState />}
          {feed.error && <ErrorState message={feed.error.message} onRetry={() => void feed.refetch()} />}
          {feed.isSuccess && posts.length === 0 && (
            <p className={styles.empty}>{view === "mine" ? t.feed.mineEmpty : t.feed.empty}</p>
          )}

          <div className={styles.list}>
            {posts.map((post) => (
              <FeedCard key={post.id} post={post} />
            ))}
          </div>

          {feed.hasNextPage ? (
            <Button variant="secondary" disabled={feed.isFetchingNextPage} onClick={() => void feed.fetchNextPage()}>
              {t.feed.loadMore}
            </Button>
          ) : (
            posts.length > 0 && <p className={styles.empty}>{t.feed.end}</p>
          )}
        </div>
      </div>
      <Outlet />
    </div>
  );
}
