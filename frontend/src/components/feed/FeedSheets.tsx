import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { CircleCheck, ImagePlus, Info, PawPrint, Send, Siren, Trash2, Undo2 } from "lucide-react";
import { CATEGORY_LABEL, type FeedPost, type PostCategory } from "../../lib/demoFeed";
import { allComments, commentTotal, feedActions, useFeed } from "../../lib/feedStore";
import { playSound } from "../../lib/sound";
import { timeAgo } from "../../lib/format";
import { useAuth, useToast } from "../../state";
import { Banner, Button, Field, Sheet, stagger } from "../../ui";

const displayName = (email?: string) => (email ? email.split("@")[0] : "You");

/* ======================= Comments ======================= */

export function CommentsSheet({ post, onClose }: { post: FeedPost | null; onClose: () => void }) {
  const s = useFeed();
  const { user, requireAuth } = useAuth();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const comments = post ? allComments(s, post) : [];
  const total = post ? commentTotal(s, post) : 0;

  useEffect(() => setText(""), [post?.id]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!post || !t) return;
    requireAuth("Sign in to comment.", () => {
      feedActions.addComment(post.id, displayName(user?.email), t);
      playSound("success");
      setText("");
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }));
    });
  };

  return (
    <Sheet open={!!post} onClose={onClose} title={`Comments · ${total}`} fill>
      <p className="demo-note-inline">
        <Info size={13} /> Demo comments. New comments are saved on this device only.
      </p>
      <div className="comments" ref={listRef}>
        {comments.length === 0 ? (
          <p className="muted small center">No comments yet. Start the conversation.</p>
        ) : (
          comments.map((c, i) => (
            <div key={c.id} className="comment stagger" style={stagger(i)}>
              <span className="avatar sm">{c.author.slice(0, 1).toUpperCase()}</span>
              <div className="comment-bubble">
                <div className="comment-head">
                  <strong>{c.author}</strong>
                  <span>{c.local ? "this device" : timeAgo(c.createdAt)}</span>
                </div>
                <p>{c.text}</p>
              </div>
            </div>
          ))
        )}
        {total > comments.length && (
          <p className="more-comments">
            Showing {comments.length} of {total} sample comments. The rest aren't included in the demo data.
          </p>
        )}
      </div>
      <form className="comment-compose" onSubmit={submit}>
        <input
          className="input"
          placeholder={user ? "Write a comment…" : "Sign in to comment"}
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
          aria-label="Write a comment"
        />
        <button className="icon-btn icon-btn-solid" style={{ width: 46, height: 46 }} disabled={!text.trim()} aria-label="Send comment">
          <Send size={18} />
        </button>
      </form>
    </Sheet>
  );
}

/* ======================= I Found This Dog ======================= */

export function FoundDogSheet({ post, onClose }: { post: FeedPost | null; onClose: () => void }) {
  const s = useFeed();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const sighting = post ? s.sightings[post.id] : undefined;
  const found = post ? s.found[post.id] : undefined;
  const error = touched && note.trim().length < 5 ? "Say where and when you saw the dog" : null;

  useEffect(() => {
    setNote("");
    setTouched(false);
  }, [post?.id]);

  const save = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!post || note.trim().length < 5) return;
    feedActions.saveSighting(post.id, note.trim());
    playSound("success");
    toast("Sighting saved on this device (demo)", "success");
  };

  return (
    <Sheet open={!!post} onClose={onClose} title="Found this dog?" tall>
      <Banner kind="warn" icon={Info}>
        <strong>Contacting the owner isn't available yet.</strong> This is a demo. Nothing is sent to the owner or to
        anyone else.
      </Banner>

      {!sighting ? (
        <form className="stack" onSubmit={save} noValidate>
          <Field label="Where and when did you see the dog?" error={error}>
            {(id, invalid) => (
              <textarea
                id={id}
                className="input"
                rows={3}
                maxLength={500}
                placeholder="e.g. Near the Lat Phrao 71 market around 8 am, wearing a red collar"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                aria-invalid={invalid}
              />
            )}
          </Field>
          <Button type="submit" variant="success" block icon={PawPrint}>
            Save sighting (demo)
          </Button>
        </form>
      ) : (
        <div className="sighting-ok fade-up">
          <span className="sighting-check">
            <CircleCheck size={26} />
          </span>
          <div className="grow">
            <strong>Sighting saved on this device</strong>
            <p className="muted small">“{sighting.note}”</p>
            <p className="muted small">The owner was not notified. In a real release this would go to the owner's inbox.</p>
          </div>
        </div>
      )}

      <div className="demo-owner">
        <div className="demo-owner-head">
          <span className="demo-tag">DEMO</span>
          <strong>Owner confirmation</strong>
        </div>
        <p className="muted small">
          Only the owner can confirm the dog was found. This switch simulates that confirmation so you can review the
          “Found” state. It does not pay or release any reward.
        </p>
        {found ? (
          <Button
            variant="secondary"
            size="sm"
            icon={Undo2}
            onClick={() => {
              feedActions.setFound(post!.id, false);
              toast("Demo: found status removed", "info");
            }}
          >
            Undo demo confirmation
          </Button>
        ) : (
          <Button
            variant="soft"
            size="sm"
            icon={CircleCheck}
            onClick={() => {
              feedActions.setFound(post!.id, true);
              toast("Demo: owner confirmed the dog was found", "success");
            }}
          >
            Simulate owner confirming “Found”
          </Button>
        )}
      </div>
    </Sheet>
  );
}

/* ======================= Composer ======================= */

const MAX_TEXT = 1000;
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const COMPOSE_CATEGORIES: PostCategory[] = ["community", "traffic_accident", "lost_pet"];

export function ComposerSheet({ open, onClose, onReport }: { open: boolean; onClose: () => void; onReport: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [text, setText] = useState("");
  const [category, setCategory] = useState<PostCategory>("community");
  const [photo, setPhoto] = useState<{ url: string; name: string; size: number } | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // URLs handed to a post must outlive the sheet; others are revoked.
  const keepUrl = useRef<string | null>(null);

  const textError =
    touched && text.trim().length < 3 ? "Write at least 3 characters" : text.length > MAX_TEXT ? "Too long" : null;

  const clearPhoto = () => {
    if (photo && photo.url !== keepUrl.current) URL.revokeObjectURL(photo.url);
    setPhoto(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  useEffect(() => {
    if (open) return;
    clearPhoto();
    setText("");
    setTouched(false);
    setPhotoError(null);
    setCategory("community");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setPhotoError(null);
    if (!f) return;
    if (!TYPES.includes(f.type)) {
      setPhotoError("Use a JPEG, PNG, WebP or GIF image.");
      e.target.value = "";
      return;
    }
    if (f.size > MAX_BYTES) {
      setPhotoError(`That photo is ${(f.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB.`);
      e.target.value = "";
      return;
    }
    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto({ url: URL.createObjectURL(f), name: f.name, size: f.size });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (text.trim().length < 3 || text.length > MAX_TEXT) return;
    keepUrl.current = photo?.url ?? null;
    feedActions.addPost({
      id: `local-${Date.now()}`,
      author: displayName(user?.email),
      createdAt: new Date().toISOString(),
      lang: /[฀-๿]/.test(text) ? "th" : "en",
      text: text.trim(),
      category,
      image: photo?.url,
      imageAlt: photo ? "Photo added on this device" : undefined,
      likes: 0,
      comments: [],
      demo: true,
      local: true,
    });
    playSound("success");
    toast("Added to the demo feed on this device. Not published.", "success");
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="New post" tall>
      <button type="button" className="compose-urgent pressable" onClick={onReport}>
        <Siren size={18} />
        <span className="grow">
          <strong>Emergency?</strong> Use Report instead. It goes on the incident map for volunteers.
        </span>
      </button>

      <form className="stack" onSubmit={submit} noValidate>
        <div className="field">
          <span className="field-label">Category</span>
          <div className="chips wrap">
            {COMPOSE_CATEGORIES.map((c) => (
              <button
                type="button"
                key={c}
                className={`chip ${category === c ? "active" : ""}`}
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
              >
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        </div>

        <Field
          label="What's happening?"
          error={textError}
          right={
            <small className={`counter ${text.length > MAX_TEXT * 0.9 ? "warn" : ""}`}>
              {text.length}/{MAX_TEXT}
            </small>
          }
        >
          {(id, invalid) => (
            <textarea
              id={id}
              className="input"
              rows={4}
              maxLength={MAX_TEXT}
              placeholder="Share an update with your neighbours…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-invalid={invalid}
            />
          )}
        </Field>

        <div className="field">
          <span className="field-label">Photo (optional)</span>
          {photo ? (
            <div className="photo-preview fade-up">
              <img src={photo.url} alt="Selected photo preview" />
              <div className="photo-info">
                <span className="clamp1">{photo.name}</span>
                <small>{(photo.size / 1024).toFixed(0)} KB · preview only</small>
              </div>
              <button type="button" className="icon-btn icon-btn-glass" style={{ width: 36, height: 36 }} onClick={clearPhoto} aria-label="Remove photo">
                <Trash2 size={16} />
              </button>
            </div>
          ) : (
            <label className="photo-pick pressable">
              <ImagePlus size={20} />
              <span>Add a photo</span>
              <small>JPEG, PNG, WebP or GIF · up to 5 MB</small>
              <input ref={fileRef} type="file" accept={TYPES.join(",")} onChange={pick} hidden />
            </label>
          )}
          {photoError && (
            <div className="field-error" role="alert">
              {photoError}
            </div>
          )}
        </div>

        <p className="demo-note-inline">
          <Info size={13} /> The backend has no community feed or photo upload yet. Your post is added to this device's
          demo feed only and disappears when you reload.
        </p>
        <Button type="submit" block size="lg">
          Add to demo feed
        </Button>
      </form>
    </Sheet>
  );
}
