import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  Bookmark,
  BookmarkCheck,
  Car,
  CheckCircle2,
  ChevronLeft,
  CircleDot,
  Clock,
  Footprints,
  MapPin,
  Pencil,
  RotateCcw,
  Share2,
  Trash2,
  Users,
} from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { IncidentDetail, IncidentStatus } from "../lib/types";
import { STATUS_LABEL, URGENCY_LABEL, roleLabel, timeAgo } from "../lib/format";
import { distanceKm, formatKm } from "../lib/geo";
import { toggleSaved, useSavedIds } from "../lib/saved";
import { playSound } from "../lib/sound";
import { useAuth, useGeo, useIncidents, useToast } from "../state";
import {
  Button,
  Empty,
  ErrorState,
  IconButton,
  Sheet,
  SignalLoader,
  Skeleton,
  Tabs,
  TopBar,
  TYPE_ICON,
  TypeBadge,
  VerifiedBadge,
  stagger,
  useBack,
} from "../ui";
import EditIncidentSheet from "./EditIncidentSheet";
import NearbyHelp from "../components/NearbyHelp";

type Tab = "overview" | "tasks" | "volunteers";

export default function IncidentScreen() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const back = useBack("/map");
  const { user, requireAuth } = useAuth();
  const { pos } = useGeo();
  const { upsert, remove } = useIncidents();
  const toast = useToast();
  const savedIds = useSavedIds();
  const [inc, setInc] = useState<IncidentDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState<null | "join" | "leave" | "status" | "delete">(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.getIncident(id);
      setInc(d);
      setLoadError(null);
      upsert(d);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setNotFound(true);
      else setLoadError((e as Error).message);
    }
  }, [id, upsert]);

  // Initial load + poll while visible so counters stay live.
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 3000);
    return () => clearInterval(t);
  }, [load, user?.id]);

  if (notFound)
    return (
      <div className="screen">
        <TopBar backFallback="/map" title="Incident" />
        <Empty icon={AlertTriangle} title="Incident not found" action={<Button variant="soft" size="sm" onClick={() => navigate("/map", { replace: true })}>Back to map</Button>}>
          It may have been removed by its author.
        </Empty>
      </div>
    );

  if (!inc)
    return (
      <div className="screen">
        <TopBar backFallback="/map" title="Incident" />
        {loadError ? <ErrorState message={loadError} onRetry={load} /> : <DetailSkeleton />}
      </div>
    );

  const canManage = !!user && (user.id === inc.created_by || user.is_admin);
  const Icon = TYPE_ICON[inc.type];
  const spotsLeft = Math.max(0, inc.needed_people - inc.volunteers_count);
  const pct = Math.min(100, (inc.volunteers_count / Math.max(1, inc.needed_people)) * 100);
  const saved = savedIds.includes(inc.id);

  const join = async (hasVehicle: boolean) => {
    setBusy("join");
    try {
      await api.joinIncident(inc.id, hasVehicle);
      await load();
      setJoinOpen(false);
      playSound("success");
      toast("You're on this mission. Thank you!", "success");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        await load();
        setJoinOpen(false);
        toast("You're already signed up for this incident.", "info");
      } else toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const leave = async () => {
    setBusy("leave");
    try {
      await api.leaveIncident(inc.id);
      await load();
      toast("Your sign-up was cancelled", "info");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const setStatus = async (status: IncidentStatus) => {
    setBusy("status");
    try {
      upsert(await api.patchIncident(inc.id, { status }));
      await load();
      toast(status === "resolved" ? "Marked as resolved" : `Status set to ${STATUS_LABEL[status]}`, "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const del = async () => {
    setBusy("delete");
    try {
      await api.deleteIncident(inc.id);
      remove(inc.id);
      toast("Incident deleted", "success");
      navigate("/map", { replace: true });
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(null);
    }
  };

  const share = async () => {
    const url = location.href;
    try {
      if (navigator.share) await navigator.share({ title: inc.title, text: inc.summary, url });
      else {
        await navigator.clipboard.writeText(url);
        toast("Link copied", "success");
      }
    } catch {
      /* user cancelled the share sheet */
    }
  };

  return (
    <div className="screen detail-screen">
      <div className={`hero hero-${inc.urgency}`}>
        <div className="hero-waves" aria-hidden />
        <Icon size={70} strokeWidth={1.3} className="hero-icon" />
        <div className="hero-bar">
          <IconButton icon={ChevronLeft} label="Back" variant="glass" className="back-btn" size={44} onClick={back} />
          <div className="hero-actions">
            <IconButton
              size={44}
              icon={saved ? BookmarkCheck : Bookmark}
              label={saved ? "Remove from saved" : "Save incident"}
              variant="glass"
              className={saved ? "is-on" : ""}
              onClick={() => toast(toggleSaved(inc.id) ? "Saved to your profile" : "Removed from saved", "success")}
            />
            <IconButton icon={Share2} label="Share" variant="glass" size={44} onClick={share} />
          </div>
        </div>
      </div>

      <div className="detail-body">
        <div className="meta tight">
          <TypeBadge type={inc.type} />
          {inc.verified && <VerifiedBadge />}
          {pos && (
            <span>
              <MapPin size={12} /> {formatKm(distanceKm(pos, inc))}
            </span>
          )}
        </div>
        <h2 className="detail-title">{inc.title}</h2>
        <div className="muted small detail-sub">
          <MapPin size={13} /> {inc.area ?? "Area not specified"} · <Clock size={13} /> {timeAgo(inc.created_at)}
          {inc.reports_count > 1 && <> · {inc.reports_count} reports</>}
        </div>

        <Tabs
          options={[
            { value: "overview" as Tab, label: "Overview" },
            { value: "tasks" as Tab, label: `Tasks (${inc.tasks.length})` },
            { value: "volunteers" as Tab, label: `Volunteers (${inc.volunteers.length})` },
          ]}
          value={tab}
          onChange={setTab}
        />

        <div className="tab-panel" key={tab}>
          {tab === "overview" && (
            <>
              <div className="stat-grid">
                <div className={`stat stat-${inc.urgency}`}>
                  <span className="stat-ico">
                    <AlertTriangle size={17} />
                  </span>
                  <div>
                    <small>Urgency</small>
                    <strong>{URGENCY_LABEL[inc.urgency]}</strong>
                  </div>
                </div>
                <div className={`stat stat-st-${inc.status}`}>
                  <span className="stat-ico">
                    <CircleDot size={17} />
                  </span>
                  <div>
                    <small>Status</small>
                    <strong key={inc.status} className="pop">
                      {STATUS_LABEL[inc.status]}
                    </strong>
                  </div>
                </div>
                <div className="stat stat-people">
                  <span className="stat-ico">
                    <Users size={17} />
                  </span>
                  <div>
                    <small>Volunteers</small>
                    <strong key={inc.volunteers_count} className="pop">
                      {inc.volunteers_count}/{inc.needed_people}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="progress lg" aria-label={`${inc.volunteers_count} of ${inc.needed_people} volunteers`}>
                <span style={{ width: `${pct}%` }} />
              </div>

              <p className="summary">{inc.summary || <span className="muted">No summary.</span>}</p>

              <TaskList inc={inc} compact />

              <NearbyHelp incident={inc} />

              {canManage && (
                <section className="manage card">
                  <div className="section-head">
                    <h3 className="section-title">{user!.id === inc.created_by ? "Your report" : "Admin tools"}</h3>
                  </div>
                  <div className="btn-row">
                    {inc.status !== "resolved" ? (
                      <Button variant="success" icon={CheckCircle2} loading={busy === "status"} disabled={!!busy} onClick={() => setStatus("resolved")}>
                        Mark resolved
                      </Button>
                    ) : (
                      <Button variant="secondary" icon={RotateCcw} loading={busy === "status"} disabled={!!busy} onClick={() => setStatus("open")}>
                        Reopen
                      </Button>
                    )}
                    <Button variant="secondary" icon={Pencil} disabled={!!busy} onClick={() => setEditOpen(true)}>
                      Edit
                    </Button>
                    <IconButton icon={Trash2} label="Delete incident" variant="tinted" className="danger-ico" size={48} disabled={!!busy} onClick={() => setDeleteOpen(true)} />
                  </div>
                </section>
              )}
            </>
          )}

          {tab === "tasks" && <TaskList inc={inc} />}

          {tab === "volunteers" &&
            (inc.volunteers.length === 0 ? (
              <Empty icon={Users} title="No volunteers yet">
                Be the first to help.
              </Empty>
            ) : (
              <div className="stack-sm">
                {inc.volunteers.map((v, i) => (
                  <div key={v.id} className="card vol-row stagger" style={stagger(i)}>
                    <span className="avatar sm">{v.display_name.slice(0, 1).toUpperCase()}</span>
                    <div className="grow">
                      <strong>
                        {v.display_name}
                        {user?.id === v.user_id && <span className="you"> · you</span>}
                      </strong>
                      <div className="muted small">Joined {timeAgo(v.created_at)}</div>
                    </div>
                    <span className={`badge ${v.has_vehicle ? "st-in_progress" : "neutral"}`}>
                      {v.has_vehicle ? <Car size={12} /> : <Footprints size={12} />} {v.has_vehicle ? "Vehicle" : "On foot"}
                    </span>
                  </div>
                ))}
              </div>
            ))}
        </div>
      </div>

      <div className="sticky-cta">
        {inc.status === "resolved" ? (
          <Button block size="lg" variant="secondary" icon={CheckCircle2} disabled>
            This incident is resolved
          </Button>
        ) : inc.viewer_is_volunteering ? (
          <Button block size="lg" variant="danger-outline" loading={busy === "leave"} disabled={!!busy} onClick={leave}>
            {busy === "leave" ? "Cancelling…" : "Cancel my sign-up"}
          </Button>
        ) : (
          <Button
            block
            size="lg"
            disabled={!!busy}
            onClick={() => requireAuth("Sign in to join this mission.", () => setJoinOpen(true))}
          >
            Join This Mission{spotsLeft > 0 ? ` · ${spotsLeft} needed` : ""}
          </Button>
        )}
      </div>

      <Sheet open={joinOpen} onClose={() => setJoinOpen(false)} title="Join this mission" locked={busy === "join"}>
        <p className="muted small">Do you have a vehicle that can reach {inc.area ?? "this area"}? This helps coordinators assign tasks.</p>
        <div className="choice-grid">
          <button className="choice pressable" disabled={busy === "join"} onClick={() => join(true)}>
            <span className="choice-ico">{busy === "join" ? <span className="spinner sm" /> : <Car size={22} />}</span>
            <strong>I have a vehicle</strong>
            <small>Car, pickup or boat</small>
          </button>
          <button className="choice pressable" disabled={busy === "join"} onClick={() => join(false)}>
            <span className="choice-ico">{busy === "join" ? <span className="spinner sm" /> : <Footprints size={22} />}</span>
            <strong>Coming on foot</strong>
            <small>I can carry and help</small>
          </button>
        </div>
      </Sheet>

      <Sheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete incident?" locked={busy === "delete"}>
        <p className="muted">“{inc.title}” will be removed from the map for everyone. This can't be undone.</p>
        <div className="btn-row">
          <Button variant="secondary" disabled={busy === "delete"} onClick={() => setDeleteOpen(false)}>
            Keep it
          </Button>
          <Button variant="danger" icon={Trash2} loading={busy === "delete"} onClick={del}>
            Delete
          </Button>
        </div>
      </Sheet>

      <EditIncidentSheet
        open={editOpen}
        incident={inc}
        onClose={() => setEditOpen(false)}
        onSaved={(i) => {
          upsert(i);
          setEditOpen(false);
          load();
        }}
      />
    </div>
  );
}

function TaskList({ inc, compact }: { inc: IncidentDetail; compact?: boolean }) {
  if (inc.tasks.length === 0)
    return compact ? null : (
      <Empty icon={Users} title="No tasks listed">
        The AI didn't break this incident into tasks.
      </Empty>
    );
  return (
    <section>
      {compact && (
        <div className="section-head">
          <h3 className="section-title">Tasks ({inc.tasks.length})</h3>
          <span className="muted small">
            <Users size={13} /> {inc.volunteers_count}/{inc.needed_people} volunteers
          </span>
        </div>
      )}
      <div className="stack-sm">
        {inc.tasks.map((t, idx) => (
          <div key={idx} className="card task-row stagger" style={stagger(idx)}>
            <span className="task-ico">
              <Users size={18} />
            </span>
            <div className="grow">
              <strong>{roleLabel(t.role)}</strong>
              <div className="muted small">{t.needed} needed</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function DetailSkeleton() {
  return (
    <div className="pad-x stack" aria-busy="true">
      <SignalLoader inline label="Loading incident…" />
      <Skeleton h={170} r={20} />
      <Skeleton w="40%" h={14} />
      <Skeleton w="85%" h={24} />
      <Skeleton w="55%" h={14} />
      <div className="stat-grid">
        <Skeleton h={58} r={14} />
        <Skeleton h={58} r={14} />
        <Skeleton h={58} r={14} />
      </div>
      <Skeleton h={60} r={14} />
      <Skeleton h={60} r={14} />
    </div>
  );
}
