import {
  useEffect,
  useId,
  useRef,
  useState,
  useLayoutEffect,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  CloudOff,
  BadgeCheck,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  HandHeart,
  Info,
  Map as MapIcon,
  MapPin,
  Plus,
  RefreshCw,
  User as UserIcon,
  Users,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Incident, IncidentStatus, IncidentType, Urgency } from "./lib/types";
import { STATUS_LABEL, TYPE_LABEL, URGENCY_LABEL, timeAgo } from "./lib/format";
import { distanceKm, formatKm } from "./lib/geo";
import { TYPE_ICON } from "./lib/icons";
import { getAlertsSeen, useAuth, useConnection, useGeo, useIncidents, useToastState } from "./state";
import { playSound } from "./lib/sound";
import { lastCommunityPath } from "./lib/community";

export { TYPE_ICON, CENTER_ICON } from "./lib/icons";

/* ================= Buttons ================= */

type Variant = "primary" | "secondary" | "soft" | "ghost" | "danger" | "danger-outline" | "success" | "dark";

export function Button({
  variant = "primary",
  size = "md",
  block,
  loading,
  icon: Icon,
  children,
  className = "",
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  block?: boolean;
  loading?: boolean;
  icon?: LucideIcon;
}) {
  return (
    <button
      className={`btn btn-${variant} btn-${size} ${block ? "btn-block" : ""} ${loading ? "is-loading" : ""} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="spinner sm" aria-hidden /> : Icon && <Icon size={size === "sm" ? 15 : 18} />}
      {children && <span>{children}</span>}
    </button>
  );
}

export function IconButton({
  icon: Icon,
  label,
  variant = "plain",
  size = 40,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  label: string;
  variant?: "plain" | "glass" | "tinted" | "solid";
  size?: number;
}) {
  return (
    <button
      className={`icon-btn icon-btn-${variant} ${className}`}
      aria-label={label}
      title={label}
      style={{ width: size, height: size }}
      {...rest}
    >
      <Icon size={Math.round(size * 0.46)} />
    </button>
  );
}

/* ================= Top bar ================= */

/**
 * Back goes to the previous entry when there is one in this app's history,
 * otherwise to `fallback`, so a deep link never leaves the user stuck.
 */
export function useBack(fallback = "/map") {
  const navigate = useNavigate();
  const location = useLocation();
  // `back: true` lets the page transition animate backwards for the fallback too.
  return () =>
    location.key !== "default" ? navigate(-1) : navigate(fallback, { replace: true, state: { back: true } });
}

export function TopBar({
  title,
  large,
  onBack,
  backFallback,
  right,
  transparent,
}: {
  title?: ReactNode;
  large?: boolean;
  onBack?: (() => void) | false;
  backFallback?: string;
  right?: ReactNode;
  transparent?: boolean;
}) {
  const back = useBack(backFallback);
  const showBack = onBack !== false && (onBack || backFallback);
  return (
    <header className={`topbar ${large ? "topbar-large" : ""} ${transparent ? "topbar-clear" : ""}`}>
      <div className="topbar-side">
        {showBack && (
          <IconButton
            icon={ChevronLeft}
            label="Back"
            variant={transparent ? "glass" : "plain"}
            className="back-btn"
            size={44}
            onClick={onBack || back}
          />
        )}
      </div>
      {title && <h1 className="topbar-title">{title}</h1>}
      <div className="topbar-side right">{right}</div>
    </header>
  );
}

/* ================= Badges ================= */

export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  return (
    <span className={`badge urg-${urgency}`}>
      <span className="dot" />
      {URGENCY_LABEL[urgency]}
    </span>
  );
}

export function StatusBadge({ status }: { status: IncidentStatus }) {
  return <span className={`badge st-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function TypeBadge({ type }: { type: IncidentType }) {
  const Icon = TYPE_ICON[type];
  return (
    <span className={`badge type-badge type-${type}`}>
      <Icon size={12} strokeWidth={2.5} /> {TYPE_LABEL[type]}
    </span>
  );
}

export function VerifiedBadge() {
  return (
    <span className="badge verified" title="Confirmed by 2 or more independent reports">
      <BadgeCheck size={12} strokeWidth={2.5} /> Verified
    </span>
  );
}

export function TypeThumb({ type, urgency, size = 64 }: { type: IncidentType; urgency: Urgency; size?: number }) {
  const Icon = TYPE_ICON[type];
  return (
    <div className={`thumb thumb-${urgency}`} style={{ width: size, height: size }}>
      <span className="thumb-waves" />
      <Icon size={Math.round(size * 0.42)} strokeWidth={1.9} />
    </div>
  );
}

/* ================= Incident row ================= */

export function IncidentRow({ incident, index = 0 }: { incident: Incident; index?: number }) {
  const { pos } = useGeo();
  const navigate = useNavigate();
  const i = incident;
  const pct = Math.min(100, (i.volunteers_count / Math.max(1, i.needed_people)) * 100);
  return (
    <button className="card incident-row pressable stagger" style={stagger(index)} onClick={() => navigate(`/incident/${i.id}`)}>
      <TypeThumb type={i.type} urgency={i.urgency} />
      <div className="incident-row-body">
        <div className="row-title">{i.title}</div>
        <div className="meta">
          <span>
            <MapPin size={12} /> {pos ? formatKm(distanceKm(pos, i)) : (i.area ?? "Bangkok")}
          </span>
          <UrgencyBadge urgency={i.urgency} />
          {i.verified && <VerifiedBadge />}
          {i.status === "resolved" && <StatusBadge status="resolved" />}
        </div>
        <div className="meta">
          <span>
            <Users size={12} />{" "}
            <span key={i.volunteers_count} className="pop">
              {i.volunteers_count}/{i.needed_people}
            </span>{" "}
            volunteers
          </span>
          <span>
            <Clock size={12} /> {timeAgo(i.created_at)}
          </span>
        </div>
        <div className="progress" aria-hidden>
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>
      <ChevronRight size={18} className="chev" />
    </button>
  );
}

export const stagger = (i: number) => ({ "--i": Math.min(i, 8) }) as CSSProperties;

/* ================= Chips, segmented, tabs ================= */

export function Chips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string; icon?: LucideIcon }[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Keep the active chip in view when it changes.
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [value]);
  return (
    <div className="chips" role="tablist" aria-label={label} ref={ref}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          className={`chip ${o.value === value ? "active" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <o.icon size={14} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: { value: T; label: string; icon?: LucideIcon }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className={`segmented ${className}`} role="tablist" style={{ "--n": options.length, "--idx": idx } as CSSProperties}>
      <span className="segmented-pill" aria-hidden />
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)}>
          {o.icon && <o.icon size={15} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className="tabs" role="tablist" style={{ "--n": options.length, "--idx": idx } as CSSProperties}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
      <span className="tabs-ink" aria-hidden />
    </div>
  );
}

/* ================= Forms ================= */

export function Field({
  label,
  error,
  hint,
  right,
  hideLabel,
  children,
}: {
  label: string;
  error?: string | null;
  hint?: ReactNode;
  right?: ReactNode;
  /** Keep the label for screen readers only (compact forms with placeholders). */
  hideLabel?: boolean;
  children: (id: string, invalid: boolean) => ReactNode;
}) {
  const id = useId();
  return (
    <div className={`field ${error ? "has-error" : ""}`}>
      {hideLabel ? (
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
      ) : (
        <div className="field-label">
          <label htmlFor={id}>{label}</label>
          {right}
        </div>
      )}
      {children(id, !!error)}
      {error ? (
        <div className="field-error" role="alert" key={error}>
          <AlertCircle size={13} /> {error}
        </div>
      ) : (
        hint && <div className="field-hint">{hint}</div>
      )}
    </div>
  );
}

/* ================= Sheet (bottom sheet / dialog) ================= */

// Sheets render into #overlay-root (a child of the .app frame, see App.tsx)
// through a portal. Rendering them inside a scrolling .screen would place the
// sheet relative to the scrolled content instead of the visible viewport.
let openSheets = 0;
function lockAppScroll(root: HTMLElement | null, lock: boolean) {
  openSheets = Math.max(0, openSheets + (lock ? 1 : -1));
  root?.parentElement?.classList.toggle("sheet-open", openSheets > 0);
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  tall,
  fill,
  locked,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  tall?: boolean;
  /** Fixed-height sheet whose body manages its own scrolling (e.g. comments list + composer). */
  fill?: boolean;
  /** Prevent dismissal (e.g. while a request is in flight). */
  locked?: boolean;
}) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);
  const root = typeof document !== "undefined" ? document.getElementById("overlay-root") : null;

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const t = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, 240);
    return () => clearTimeout(t);
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !locked && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, locked, onClose]);

  // Stop the page behind from scrolling while the sheet is shown.
  useEffect(() => {
    if (!mounted) return;
    lockAppScroll(root, true);
    return () => lockAppScroll(root, false);
  }, [mounted, root]);

  // Keep the sheet (and its input) above the on-screen keyboard.
  useLayoutEffect(() => {
    const vv = window.visualViewport;
    const el = backdropRef.current;
    if (!mounted || !vv || !el) return;
    const sync = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      el.style.setProperty("--kb", `${Math.round(kb)}px`);
      el.style.setProperty("--vvh", `${Math.round(vv.height)}px`);
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, [mounted]);

  if (!mounted) return null;
  const node = (
    <div ref={backdropRef} className={`sheet-backdrop ${closing ? "closing" : ""}`} onClick={() => !locked && onClose()}>
      <div
        className={`sheet ${tall ? "tall" : ""} ${fill ? "sheet-fill" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        {title && (
          <div className="sheet-head">
            <h3>{title}</h3>
            <IconButton icon={X} label="Close" variant="tinted" size={36} onClick={onClose} disabled={locked} />
          </div>
        )}
        {children}
      </div>
    </div>
  );
  return root ? createPortal(node, root) : node;
}

/* ================= Expandable section ================= */

export function Expandable({
  title,
  icon: Icon,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className={`expandable ${open ? "open" : ""}`}>
      <button className="expandable-head" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        {Icon && (
          <span className="expandable-ico">
            <Icon size={16} />
          </span>
        )}
        <span className="grow">{title}</span>
        {badge}
        <ChevronDown size={18} className="expandable-chev" />
      </button>
      <div className="expandable-body" id={id}>
        <div>{children}</div>
      </div>
    </section>
  );
}

/* ================= States ================= */

export function Empty({ icon: Icon = HandHeart, title, children, action }: { icon?: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty fade-up">
      <span className="empty-ico">
        <Icon size={28} strokeWidth={1.7} />
      </span>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

/**
 * Error with an honest cause (offline vs server) and a Retry whose icon spins
 * only while the retry request is actually running.
 */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => unknown }) {
  const { online } = useConnection();
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  const retry = async () => {
    if (!onRetry || busy) return;
    setBusy(true);
    try {
      await onRetry();
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <div className="empty error-state fade-up" role="alert">
      <span className="empty-ico">{online ? <CloudOff size={26} strokeWidth={1.7} /> : <WifiOff size={26} strokeWidth={1.7} />}</span>
      <strong>{online ? "Couldn't load this" : "You're offline"}</strong>
      <p>{online ? message : "Check your Wi-Fi or mobile data, then try again."}</p>
      {onRetry && (
        <Button variant="soft" size="sm" icon={RefreshCw} className={busy ? "is-spinning" : ""} disabled={busy} onClick={retry}>
          {busy ? "Retrying…" : "Try again"}
        </Button>
      )}
    </div>
  );
}

/** Small radar-style "signal" indicator for real in-flight work. */
export function SignalLoader({ label, inline }: { label: string; inline?: boolean }) {
  return (
    <div className={`signal-loader ${inline ? "inline" : ""}`} role="status" aria-live="polite">
      <span className="signal" aria-hidden>
        <i />
        <i />
        <b />
      </span>
      <span>{label}</span>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="spinner-wrap" role="status">
      <span className="spinner" />
      {label && <span>{label}</span>}
    </div>
  );
}

export function Skeleton({ w = "100%", h = 14, r = 8, style }: { w?: number | string; h?: number; r?: number; style?: CSSProperties }) {
  return <span className="skel" style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden />;
}

export function RowSkeletons({ count = 4, label }: { count?: number; label?: string }) {
  return (
    <div className="stack" aria-busy="true" aria-label={label ?? "Loading"}>
      {label && <SignalLoader label={label} inline />}
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card incident-row" style={{ opacity: 1 - i * 0.15 }}>
          <Skeleton w={64} h={64} r={14} />
          <div className="grow stack-sm">
            <Skeleton w="80%" h={15} />
            <Skeleton w="50%" h={12} />
            <Skeleton w="65%" h={12} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Banner({ kind = "info", icon, children }: { kind?: "info" | "success" | "error" | "warn" | "ai"; icon?: LucideIcon; children: ReactNode }) {
  const Icon = icon ?? (kind === "success" ? CheckCircle2 : kind === "error" ? AlertCircle : Info);
  return (
    <div className={`banner banner-${kind} fade-up`} role={kind === "error" ? "alert" : undefined}>
      <Icon size={18} />
      <div className="grow">{children}</div>
    </div>
  );
}

/* ================= Toast ================= */

export function ToastHost() {
  const msg = useToastState();
  if (!msg) return null;
  const Icon = msg.kind === "success" ? CheckCircle2 : msg.kind === "error" ? AlertCircle : Info;
  return (
    <div className={`toast toast-${msg.kind}`} role="status" aria-live="polite" key={msg.id}>
      <Icon size={18} />
      <span>{msg.text}</span>
    </div>
  );
}

/* ================= Bottom nav ================= */

export function BottomNav({ intro }: { intro?: boolean }) {
  const { incidents } = useIncidents();
  const { pathname } = useLocation();
  // Reopen the Community sub-tab the user last used (Feed or Volunteer).
  const communityPath = pathname === "/help" || pathname === "/feed" ? pathname : lastCommunityPath();
  const { requireAuth } = useAuth();
  const navigate = useNavigate();
  const seen = getAlertsSeen();
  const unread = incidents.filter((i) => i.updated_at > seen).length;
  return (
    <nav className={`bottom-nav ${intro ? "nav-intro" : ""}`} aria-label="Main">
      <NavLink to="/map">
        <MapIcon size={22} />
        <span>Map</span>
      </NavLink>
      <NavLink to="/alerts">
        <span className="nav-icon">
          <Bell size={22} />
          {unread > 0 && <span className="dot-count">{unread > 9 ? "9+" : unread}</span>}
        </span>
        <span>Alerts</span>
      </NavLink>
      <button
        className="nav-report"
        aria-label="Report an incident"
        onClick={() => {
          playSound("bell");
          requireAuth("Sign in to report an incident.", () => navigate("/report"));
        }}
      >
        <span className="fab">
          <Plus size={26} strokeWidth={2.5} />
        </span>
        <span>Report</span>
      </button>
      <NavLink
        to={communityPath}
        className={({ isActive }) => (isActive || pathname === "/feed" || pathname === "/help" ? "active" : "")}
      >
        <Users size={22} />
        <span>Community</span>
      </NavLink>
      <NavLink to="/profile">
        <UserIcon size={22} />
        <span>Profile</span>
      </NavLink>
    </nav>
  );
}

/* ================= Brand ================= */

export function Logo({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <circle cx="32" cy="34" r="5.5" fill="currentColor" />
      <path d="M23 43a13 13 0 1 1 18 0" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M15 50a23 23 0 1 1 34 0" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" opacity=".55" />
    </svg>
  );
}
