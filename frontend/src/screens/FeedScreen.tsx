import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FlaskConical, MessagesSquare, PenSquare, RotateCcw } from "lucide-react";
import type { FeedPost, PostCategory } from "../lib/demoFeed";
import { CATEGORY_LABEL } from "../lib/demoFeed";
import { feedActions, useFeed } from "../lib/feedStore";
import { useAuth, useToast } from "../state";
import { Button, Chips, Empty, ErrorState, Sheet, Skeleton, TopBar } from "../ui";
import CommunityTabs from "../components/CommunityTabs";
import PostCard, { WeatherCard } from "../components/feed/PostCard";
import { CommentsSheet, ComposerSheet, FoundDogSheet } from "../components/feed/FeedSheets";

// The API contract (see README) has no community-feed endpoint, so the feed
// runs only in DEMO mode on fictional posts from src/lib/demoFeed.ts. When a
// real endpoint exists, load it here and render the same states: loading →
// <FeedSkeleton>, failure → <ErrorState> with retry, zero posts → <Empty>.
// Demo posts must never be mixed into a real response.
type FeedSource = "demo";
const FEED_SOURCE: FeedSource = "demo";
type FeedStatus = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready" };

type Filter = "all" | PostCategory;

export default function FeedScreen() {
  const navigate = useNavigate();
  const { requireAuth, user } = useAuth();
  const toast = useToast();
  const feed = useFeed();
  const [filter, setFilter] = useState<Filter>("all");
  const [commentsFor, setCommentsFor] = useState<FeedPost | null>(null);
  const [foundFor, setFoundFor] = useState<FeedPost | null>(null);
  const [composing, setComposing] = useState(false);
  const [noticeFor, setNoticeFor] = useState<FeedPost | null>(null);
  // Demo data is available synchronously; a real source would start at "loading".
  const [status] = useState<FeedStatus>({ kind: "ready" });

  const posts = useMemo(
    () => feed.posts.filter((p) => filter === "all" || p.category === filter),
    [feed.posts, filter],
  );

  const goReport = () => {
    setComposing(false);
    requireAuth("Sign in to report an incident.", () => navigate("/report"));
  };

  return (
    <div className="screen feed-screen">
      <TopBar
        large
        title="Community"
        right={
          <button
            className="icon-btn icon-btn-tinted pressable"
            style={{ width: 40, height: 40 }}
            aria-label="New post"
            onClick={() => requireAuth("Sign in to post in the community feed.", () => setComposing(true))}
          >
            <PenSquare size={18} />
          </button>
        }
      />
      <CommunityTabs value="feed" />

      {FEED_SOURCE === "demo" && (
        <div className="pad-x">
          <div className="demo-banner fade-up">
            <FlaskConical size={16} />
            <span className="grow">
              <strong>Demo feed.</strong> All posts, names, places and counts are fictional sample data, not verified
              reports. The backend has no community feed yet.
            </span>
            <button
              className="link sm"
              onClick={() => {
                feedActions.reset();
                toast("Demo feed reset", "info");
              }}
              aria-label="Reset demo feed"
            >
              <RotateCcw size={13} /> Reset
            </button>
          </div>
        </div>
      )}

      <div className="pad-x">
        <Chips
          label="Post category"
          options={[
            { value: "all" as Filter, label: "All" },
            ...(Object.keys(CATEGORY_LABEL) as PostCategory[]).map((c) => ({ value: c as Filter, label: CATEGORY_LABEL[c] })),
          ]}
          value={filter}
          onChange={setFilter}
        />
      </div>

      <button
        className="compose-prompt card pressable"
        onClick={() => requireAuth("Sign in to post in the community feed.", () => setComposing(true))}
      >
        <span className="avatar sm">{user ? user.email.slice(0, 1).toUpperCase() : "?"}</span>
        <span className="grow muted">What's happening in your area?</span>
        <PenSquare size={17} className="chev" />
      </button>

      <div className="feed-list" key={filter}>
        {status.kind === "loading" ? (
          <FeedSkeleton />
        ) : status.kind === "error" ? (
          <ErrorState message={status.message} />
        ) : posts.length === 0 ? (
          <Empty icon={MessagesSquare} title="No posts here yet" action={filter !== "all" && <Button variant="soft" size="sm" onClick={() => setFilter("all")}>Show all posts</Button>}>
            {filter === "all" ? "Be the first to share an update." : "Nothing in this category right now."}
          </Empty>
        ) : (
          posts.map((p, i) =>
            p.kind === "notice" ? (
              <WeatherCard key={p.id} post={p} index={i} onReadMore={() => setNoticeFor(p)} />
            ) : (
              <PostCard
                key={p.id}
                post={p}
                index={i}
                onComments={() => setCommentsFor(p)}
                onFound={() => setFoundFor(p)}
                onReport={goReport}
              />
            ),
          )
        )}
      </div>

      <CommentsSheet post={commentsFor} onClose={() => setCommentsFor(null)} />
      <FoundDogSheet post={foundFor} onClose={() => setFoundFor(null)} />
      <Sheet open={!!noticeFor} onClose={() => setNoticeFor(null)} title="Weekly Weather Outlook" tall>
        <span className="unverified-tag">DEMO FORECAST · UNVERIFIED</span>
        <p className="muted small">
          This is sample content for the design demo. It is not a live or verified forecast, and it has no dates, places or
          probabilities on purpose.
        </p>
        <h4 className="section-title">General flood preparedness</h4>
        <ul className="prep-list">
          <li>Follow official bulletins from the Thai Meteorological Department and your district office.</li>
          <li>Keep a small kit ready: drinking water, medicines, a torch, a charged power bank and copies of documents.</li>
          <li>Know your nearest shelter. See Emergency Centers in the Community tab.</li>
          <li>In an emergency, call 1669 (medical) or 199 (fire & rescue).</li>
        </ul>
        <a className="btn btn-secondary btn-md btn-block" href="https://www.tmd.go.th/en/" target="_blank" rel="noreferrer">
          <span>Open Thai Meteorological Department</span>
        </a>
      </Sheet>
      <ComposerSheet open={composing} onClose={() => setComposing(false)} onReport={goReport} />
    </div>
  );
}

/** Placeholder cards for when a real feed request is in flight. */
export function FeedSkeleton() {
  return (
    <div className="stack" aria-busy="true" aria-label="Loading posts">
      {[0, 1, 2].map((i) => (
        <div key={i} className="post card" style={{ opacity: 1 - i * 0.2 }}>
          <div className="post-head">
            <Skeleton w={36} h={36} r={18} />
            <div className="grow stack-xs">
              <Skeleton w="40%" h={13} />
              <Skeleton w="28%" h={11} />
            </div>
          </div>
          <Skeleton w="90%" h={13} />
          <Skeleton w="70%" h={13} />
          {i === 0 && <Skeleton h={180} r={14} />}
        </div>
      ))}
    </div>
  );
}
