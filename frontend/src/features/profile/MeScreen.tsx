import { Link } from "react-router";
import { useMode } from "../../app/ModeContext";
import { Button } from "../../components/Button";
import { Screen } from "../../components/Screen";
import { LoadingState } from "../../components/States";
import { format, t } from "../../i18n";
import { AuthForm } from "../auth/AuthForm";
import { useAuth } from "../auth/AuthProvider";
import { useMyPosts } from "../community/api";
import { useFeed } from "../feed/api";
import { TOPIC_EMOJI } from "../feed/meta";
import { postStatusLabel } from "../community/postState";
import { POST_EMOJI } from "../map/meta";
import { useMySignups } from "./api";
import styles from "./MeScreen.module.css";

export function MeScreen() {
  const { user, isLoggedIn, logout } = useAuth();

  if (!isLoggedIn) {
    return (
      <Screen lead={t.auth.why}>
        <AuthForm />
      </Screen>
    );
  }
  if (!user) return <LoadingState />;

  return (
    <Screen title={format(t.me.hello, { name: user.full_name })}>
      <div className={styles.card}>
        <p className={styles.meta}>{format(t.auth.loggedInAs, { email: user.email })}</p>
        {user.has_vehicle && <p className={styles.meta}>🚗 {t.auth.vehicleYes}</p>}
        <Button variant="secondary" onClick={logout}>
          {t.auth.logout}
        </Button>
      </div>
      <MyHelp userId={user.id} />
      <MyPosts userId={user.id} />
      <MyFeedPosts userId={user.id} />
    </Screen>
  );
}

function MyHelp({ userId }: { userId: string }) {
  const { data: signups = [] } = useMySignups(userId);
  return (
    <section className={styles.section}>
      <h2>{t.me.myHelp}</h2>
      {signups.length === 0 ? (
        <p className={styles.meta}>{t.me.myHelpEmpty}</p>
      ) : (
        <ul className={styles.list}>
          {signups.map((signup) => (
            <li key={signup.id}>
              <Link to={`/incidents/${signup.incident.id}`} className={styles.item}>
                <span className={styles.itemTitle}>{signup.incident.title}</span>
                <span className={styles.meta}>
                  {signup.task.title}, {signup.status === "completed" ? t.me.statusCompleted : t.me.statusGoing}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MyPosts({ userId }: { userId: string }) {
  const { data: posts = [] } = useMyPosts(userId);
  const { setMode } = useMode();
  return (
    <section className={styles.section}>
      <h2>{t.me.myPosts}</h2>
      {posts.length === 0 ? (
        <p className={styles.meta}>{t.me.myPostsEmpty}</p>
      ) : (
        <ul className={styles.list}>
          {posts.map((post) => (
            <li key={post.id}>
              {/* Posts live on the Community map. */}
              <Link to={`/posts/${post.id}`} className={styles.item} onClick={() => setMode("community")}>
                <span className={styles.itemTitle}>
                  {POST_EMOJI[post.category]} {post.title}
                </span>
                <span className={styles.meta}>
                  {postStatusLabel(post)},{" "}
                  {post.response_count === 1
                    ? t.me.newResponsesOne
                    : format(t.me.newResponses, { n: post.response_count })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const FEED_PREVIEW = 3;

/** Last few Feed posts; "See all" opens Feed → Mine (same cached query). */
function MyFeedPosts({ userId }: { userId: string }) {
  const { data } = useFeed({ sort: "new", topic: null, authorId: userId });
  const posts = data?.pages.flat() ?? [];
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2>{t.me.myFeedPosts}</h2>
        {posts.length > 0 && (
          <Link to="/feed?view=mine" className={styles.seeAll}>
            {t.me.seeAll}
          </Link>
        )}
      </div>
      {posts.length === 0 ? (
        <p className={styles.meta}>{t.me.myFeedPostsEmpty}</p>
      ) : (
        <ul className={styles.list}>
          {posts.slice(0, FEED_PREVIEW).map((post) => (
            <li key={post.id}>
              <Link to={`/feed/${post.id}`} className={styles.item}>
                <span className={[styles.itemTitle, styles.clamp].join(" ")}>
                  {TOPIC_EMOJI[post.topic]} {post.body}
                </span>
                <span className={styles.meta}>
                  {format(t.feed.likes, { n: post.like_count })},{" "}
                  {format(t.feed.comments, { n: post.comment_count })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
