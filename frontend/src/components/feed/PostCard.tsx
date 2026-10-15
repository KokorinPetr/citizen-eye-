import { useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CarFront,
  CloudRain,
  Construction,
  ArrowRight,
  ChevronDown,
  CircleCheck,
  Gift,
  Heart,
  MapPin,
  MessageCircle,
  PawPrint,
  Siren,
  Users,
  type LucideIcon,
} from "lucide-react";
import { CATEGORY_LABEL, type FeedPost, type PostCategory } from "../../lib/demoFeed";
import { commentTotal, feedActions, useFeed } from "../../lib/feedStore";
import { playSound } from "../../lib/sound";
import { timeAgo } from "../../lib/format";
import { stagger } from "../../ui";
import AssetImage from "../AssetImage";

const CATEGORY_ICON: Record<PostCategory, LucideIcon> = {
  urgent_flood: Siren,
  traffic_accident: CarFront,
  lost_pet: PawPrint,
  community: Users,
  weather: CloudRain,
};

export default function PostCard({
  post,
  index,
  onComments,
  onFound,
  onReport,
}: {
  post: FeedPost;
  index: number;
  onComments: () => void;
  onFound: () => void;
  onReport: () => void;
}) {
  const s = useFeed();
  const liked = s.liked.includes(post.id);
  const likeCount = post.likes + (liked ? 1 : 0);
  const comments = commentTotal(s, post);
  const found = s.found[post.id];
  const Icon = CATEGORY_ICON[post.category];
  const urgent = post.category === "urgent_flood";

  return (
    <article className={`post card stagger post-${post.category}`} style={stagger(index)} aria-label={`Post by ${post.author}`}>
      <header className="post-head">
        <span className="avatar sm">{post.author.slice(0, 1)}</span>
        <div className="grow">
          <div className="post-author">
            <strong>{post.author}</strong>
            <span className="demo-tag" title="Fictional demo post, not a real or verified report">
              {post.local ? "DEMO · this device" : "DEMO"}
            </span>
          </div>
          <div className="post-meta">
            {post.location && (
              <>
                <MapPin size={11} /> {post.location} ·{" "}
              </>
            )}
            {timeAgo(post.createdAt)}
          </div>
        </div>
      </header>

      <div className="meta tight">
        <span className={`post-cat cat-${post.category}`}>
          <Icon size={12} strokeWidth={2.4} /> {CATEGORY_LABEL[post.category]}
        </span>
        {post.resolved && (
          <span className="badge resolved-badge">
            <BadgeCheck size={12} /> RESOLVED
          </span>
        )}
      </div>

      <p className="post-text" lang={post.lang}>
        {post.text}
      </p>

      {post.image && (
        <div className="post-media">
          <AssetImage src={post.image} alt={post.imageAlt ?? "Post photo"} className="post-img" />
        </div>
      )}

      {post.imagePlaceholder && !post.image && (
        <div className="post-media">
          <div className="media-placeholder" role="img" aria-label={post.imagePlaceholder}>
            <Construction size={30} />
            <span>{post.imagePlaceholder}</span>
          </div>
        </div>
      )}

      {post.resolved && (
        <section className="repair" aria-label="Resolved outcome">
          <div className="repair-top">
            <span className="repair-ico">
              <Construction size={20} />
            </span>
            <div className="grow">
              <span className="repair-label">{post.resolved.label}</span>
              <strong className="repair-company">{post.resolved.company}</strong>
            </div>
          </div>
          <p className="repair-text">{post.resolved.text}</p>
          <p className="repair-fiction">Fictional company and story, shown as demo content only.</p>
        </section>
      )}

      {post.reward && <RewardSection post={post} found={found} onFound={onFound} />}

      {urgent && (
        <button className="post-escalate pressable" onClick={onReport}>
          <AlertTriangle size={15} />
          <span className="grow">Someone in danger? Use Report so volunteers see it on the map.</span>
        </button>
      )}

      <footer className="post-actions">
        <button
          className={`post-action like ${liked ? "on" : ""}`}
          aria-pressed={liked}
          aria-label={liked ? "Unlike" : "Like"}
          onClick={() => {
            if (!liked) playSound("like");
            feedActions.toggleLike(post.id);
          }}
        >
          <span className="heart" key={String(liked)}>
            <Heart size={19} fill={liked ? "currentColor" : "none"} />
          </span>
          <span key={likeCount} className="pop">
            {likeCount}
          </span>
        </button>
        <button className="post-action" onClick={onComments} aria-label={`${comments} comments, open`}>
          <MessageCircle size={19} />
          <span key={comments} className="pop">
            {comments}
          </span>
        </button>
      </footer>
    </article>
  );
}

function RewardSection({ post, found, onFound }: { post: FeedPost; found?: string; onFound: () => void }) {
  const [open, setOpen] = useState(false);
  const r = post.reward!;
  return (
    <section className={`reward ${found ? "is-found" : ""}`} aria-label="Reward offered">
      <div className="reward-top">
        <span className="reward-ico">
          <Gift size={20} />
        </span>
        <div className="grow">
          <span className="reward-label">REWARD OFFERED</span>
          <strong className="reward-amount">{r.amountLabel}</strong>
        </div>
        {found && (
          <span className="badge found-badge pop">
            <CircleCheck size={12} /> Found · demo
          </span>
        )}
      </div>
      <p className="reward-th" lang="th">
        {r.textTh}
      </p>
      {/* The app UI is English, so the English line is shown as well. */}
      <p className="reward-en">{r.textEn}</p>

      <button className="reward-more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        How the reward works <ChevronDown size={15} className="chev-rot" />
      </button>
      <div className={`reward-details ${open ? "open" : ""}`}>
        <div>
          <p>
            The reward is offered by the pet owner, not by Citizens Eye. Citizens Eye doesn't hold or pay rewards and
            can't contact the owner yet. Any reward is arranged directly between the owner and the finder.
          </p>
        </div>
      </div>

      {found ? (
        <p className="reward-status">
          Marked found with a demo owner confirmation. No reward has been paid through the app.
        </p>
      ) : (
        <button className="btn btn-md btn-block reward-btn" onClick={onFound}>
          <PawPrint size={17} /> <span>I Found This Dog</span>
        </button>
      )}
    </section>
  );
}

/** Informational demo notice (no likes/comments). Never presented as a live forecast. */
export function WeatherCard({ post, index, onReadMore }: { post: FeedPost; index: number; onReadMore: () => void }) {
  const n = post.notice!;
  return (
    <article className="weather card stagger" style={stagger(index)} aria-label={n.title}>
      <div className="weather-head">
        <span className="weather-ico">
          <CloudRain size={22} />
        </span>
        <div className="grow">
          <div className="weather-title">{n.title}</div>
          <span className="unverified-tag">DEMO FORECAST · UNVERIFIED</span>
        </div>
      </div>
      <p className="weather-body">{post.text}</p>
      <p className="weather-note">{n.disclaimer}</p>
      <div className="weather-actions">
        <button className="btn btn-soft btn-sm" onClick={onReadMore}>
          <span>Read More</span> <ArrowRight size={14} />
        </button>
        <span className="tiny muted">Opens a demo preparedness summary</span>
      </div>
    </article>
  );
}
