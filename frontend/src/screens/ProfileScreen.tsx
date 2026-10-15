import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bookmark,
  Building2,
  ChevronRight,
  ClipboardList,
  HandHeart,
  Info,
  LogIn,
  LogOut,
  ShieldCheck,
  UserPlus,
  Volume2,
  VolumeX,
  type LucideIcon,
} from "lucide-react";
import { useSavedIds } from "../lib/saved";
import { playSound, setSoundEnabled, useSoundEnabled } from "../lib/sound";
import { useAuth, useIncidents, useToast } from "../state";
import { Button, Empty, ErrorState, IncidentRow, Logo, RowSkeletons, Sheet, TopBar } from "../ui";

type Section = null | "missions" | "reports" | "saved";
const SECTION_TITLE = { missions: "My Missions", reports: "My Reports", saved: "Saved Incidents" };

export default function ProfileScreen() {
  const { user, ready, logout, openAuth } = useAuth();
  const { incidents, loaded, error, refresh } = useIncidents();
  const savedIds = useSavedIds();
  const toast = useToast();
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>(null);
  const [confirmOut, setConfirmOut] = useState(false);

  const saved = incidents.filter((i) => savedIds.includes(i.id));

  if (section) {
    const list =
      section === "missions"
        ? incidents.filter((i) => i.viewer_is_volunteering)
        : section === "reports"
          ? incidents.filter((i) => i.created_by === user?.id)
          : saved;
    return (
      <div className="screen">
        <TopBar onBack={() => setSection(null)} title={SECTION_TITLE[section]} />
        <div className="list">
          {!loaded ? (
            <RowSkeletons />
          ) : error && incidents.length === 0 ? (
            <ErrorState message={error} onRetry={() => refresh()} />
          ) : list.length === 0 ? (
            <Empty icon={section === "saved" ? Bookmark : section === "missions" ? HandHeart : ClipboardList} title={`No ${SECTION_TITLE[section].toLowerCase()} yet`}>
              {section === "saved"
                ? "Tap the bookmark on any incident to save it here. Saved items stay on this device."
                : section === "missions"
                  ? "Join a mission from the Help tab."
                  : "Use the + button to report an incident."}
            </Empty>
          ) : (
            list.map((i, idx) => <IncidentRow key={i.id} incident={i} index={idx} />)
          )}
        </div>
      </div>
    );
  }

  if (!ready) return <div className="screen"><RowSkeletons count={3} /></div>;

  if (!user)
    return (
      <div className="screen">
        <TopBar large title="Profile" />
        <div className="guest-card card fade-up">
          <span className="auth-logo">
            <Logo size={34} />
          </span>
          <strong>You're browsing as a guest</strong>
          <p className="muted small">Sign in to report incidents, join missions and follow updates.</p>
          <div className="btn-row">
            <Button variant="secondary" icon={UserPlus} onClick={() => openAuth({ mode: "register" })}>
              Create account
            </Button>
            <Button icon={LogIn} onClick={() => openAuth({ mode: "login" })}>
              Sign in
            </Button>
          </div>
        </div>
        <div className="pad-x">
          <Menu
            items={[
              { icon: Bookmark, label: "Saved Incidents", hint: savedIds.length ? String(savedIds.length) : undefined, onClick: () => setSection("saved") },
              { icon: Building2, label: "Emergency Centers", onClick: () => navigate("/centers") },
              { icon: Info, label: "About Citizens Eye", onClick: () => navigate("/about") },
            ]}
          />
          <SoundSetting />
        </div>
      </div>
    );

  const missions = incidents.filter((i) => i.viewer_is_volunteering).length;
  const reports = incidents.filter((i) => i.created_by === user.id).length;
  const name = user.email.split("@")[0];

  return (
    <div className="screen">
      <TopBar large title="Profile" />
      <div className="profile-head fade-up">
        <span className="avatar xl">{name.slice(0, 1).toUpperCase()}</span>
        <h2>{name}</h2>
        <div className="muted small">{user.email}</div>
        <span className={`badge ${user.is_admin ? "verified" : "st-in_progress"}`}>
          {user.is_admin ? (
            <>
              <ShieldCheck size={12} /> Admin
            </>
          ) : (
            "Volunteer"
          )}
        </span>
      </div>
      <div className="stats-row fade-up">
        <button onClick={() => setSection("missions")}>
          <strong>{loaded ? missions : "–"}</strong>
          <small>Missions joined</small>
        </button>
        <button onClick={() => setSection("reports")}>
          <strong>{loaded ? reports : "–"}</strong>
          <small>Reports submitted</small>
        </button>
        <button onClick={() => setSection("saved")}>
          <strong>{savedIds.length}</strong>
          <small>Saved</small>
        </button>
      </div>
      <div className="pad-x">
        <Menu
          items={[
            { icon: HandHeart, label: "My Missions", onClick: () => setSection("missions") },
            { icon: ClipboardList, label: "My Reports", onClick: () => setSection("reports") },
            { icon: Bookmark, label: "Saved Incidents", onClick: () => setSection("saved") },
          ]}
        />
        <Menu
          items={[
            { icon: Building2, label: "Emergency Centers", onClick: () => navigate("/centers") },
            { icon: Info, label: "Help & About", onClick: () => navigate("/about") },
          ]}
        />
        <SoundSetting />
        <Menu items={[{ icon: LogOut, label: "Sign out", danger: true, onClick: () => setConfirmOut(true) }]} />
        <p className="fine-print">Counts come from the incidents currently on the map.</p>
      </div>

      <Sheet open={confirmOut} onClose={() => setConfirmOut(false)} title="Sign out?">
        <p className="muted">You can keep browsing the map as a guest.</p>
        <div className="btn-row">
          <Button variant="secondary" onClick={() => setConfirmOut(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            icon={LogOut}
            onClick={() => {
              setConfirmOut(false);
              logout();
              toast("Signed out", "info");
            }}
          >
            Sign out
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

/** Optional UI sounds (like, report bell, confirmations). Off = silent; visual feedback is unchanged. */
function SoundSetting() {
  const on = useSoundEnabled();
  return (
    <div className="menu fade-up">
      <label className="menu-switch">
        <span className="menu-ico">{on ? <Volume2 size={17} /> : <VolumeX size={17} />}</span>
        <span className="grow">
          Sound effects
          <small className="muted block">Soft sounds for likes, reports and confirmations</small>
        </span>
        <input
          type="checkbox"
          className="switch"
          checked={on}
          onChange={(e) => {
            setSoundEnabled(e.target.checked);
            if (e.target.checked) playSound("success");
          }}
        />
      </label>
    </div>
  );
}

function Menu({ items }: { items: { icon: LucideIcon; label: string; hint?: string; danger?: boolean; onClick: () => void }[] }) {
  return (
    <div className="menu fade-up">
      {items.map((it) => (
        <button key={it.label} className={`pressable ${it.danger ? "danger" : ""}`} onClick={it.onClick}>
          <span className="menu-ico">
            <it.icon size={17} />
          </span>
          <span className="grow">{it.label}</span>
          {it.hint && <span className="count-badge">{it.hint}</span>}
          {!it.danger && <ChevronRight size={16} className="chev" />}
        </button>
      ))}
    </div>
  );
}

export function AboutScreen() {
  return (
    <div className="screen">
      <TopBar backFallback="/profile" title="Help & About" />
      <div className="pad-x prose fade-up">
        <div className="about-brand">
          <span className="auth-logo">
            <Logo size={34} />
          </span>
          <strong>Citizens Eye</strong>
        </div>
        <p>
          Citizens Eye is a mobile-first app for flood response in Bangkok. People report problems in their own words, AI turns each
          report into a structured incident on a shared live map, and volunteers sign up for the tasks.
        </p>
        <h3>How it works</h3>
        <ol>
          <li>Tap <strong>+</strong> and describe what's happening, then drop a pin.</li>
          <li>AI detects the type, urgency, people needed and tasks.</li>
          <li>Volunteers tap <strong>Join This Mission</strong>. Counters update for everyone.</li>
          <li>The author marks the incident resolved when help has arrived.</li>
        </ol>
        <h3>Privacy</h3>
        <p className="muted">Your original report text is never shown. Only an AI-cleaned summary and the general area are public.</p>
        <h3>Emergency</h3>
        <p className="muted">
          In a life-threatening emergency call <a href="tel:1669">1669</a> (medical), <a href="tel:199">199</a> (fire & rescue) or{" "}
          <a href="tel:191">191</a> (police). Bangkok hotline <a href="tel:1555">1555</a>, tourist police <a href="tel:1155">1155</a>.
        </p>
        <h3>Not available yet</h3>
        <p className="muted">Photos, push notifications, profile editing and social sign-in aren't supported by the current backend.</p>
      </div>
    </div>
  );
}
