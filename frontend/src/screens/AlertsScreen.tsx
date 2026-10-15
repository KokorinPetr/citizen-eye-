import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, BadgeCheck, Bell, CheckCircle2, ChevronRight, MapPinOff, UserRound, Users } from "lucide-react";
import type { Incident } from "../lib/types";
import { TYPE_LABEL, timeAgo } from "../lib/format";
import { distanceKm } from "../lib/geo";
import { getAlertsSeen, setAlertsSeen, useAuth, useGeo, useIncidents } from "../state";
import { Button, Chips, Empty, ErrorState, RowSkeletons, TopBar, stagger } from "../ui";

// There is no notifications endpoint, so the feed is derived from the polled
// incident list: one entry per incident describing its latest state.

type Filter = "all" | "nearby" | "mine";
const NEARBY_KM = 5;

function describe(i: Incident) {
  if (i.status === "resolved") return { icon: CheckCircle2, cls: "ok", head: "Incident resolved", body: i.title };
  if (i.status === "in_progress")
    return { icon: Users, cls: "info", head: "Volunteers on the way", body: `${i.title} · ${i.volunteers_count}/${i.needed_people} signed up` };
  if (i.verified) return { icon: BadgeCheck, cls: "ok", head: `Verified by ${i.reports_count} reports`, body: i.title };
  return {
    icon: AlertTriangle,
    cls: `urg-${i.urgency}`,
    head: `New ${TYPE_LABEL[i.type].toLowerCase()} report${i.area ? ` in ${i.area}` : ""}`,
    body: i.title,
  };
}

export default function AlertsScreen() {
  const { incidents, loaded, error, refresh } = useIncidents();
  const { user, openAuth } = useAuth();
  const { pos, locate } = useGeo();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [seen, setSeen] = useState(getAlertsSeen);

  // Persist "seen" when leaving, so unread dots stay visible while reading.
  useEffect(() => () => setAlertsSeen(new Date().toISOString()), []);

  const items = useMemo(
    () =>
      incidents
        .filter((i) => {
          if (filter === "nearby") return pos ? distanceKm(pos, i) <= NEARBY_KM : false;
          if (filter === "mine") return !!user && (i.created_by === user.id || i.viewer_is_volunteering);
          return true;
        })
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, 50),
    [incidents, filter, pos, user],
  );
  const unread = items.filter((i) => i.updated_at > seen).length;

  const markAll = () => {
    const now = new Date().toISOString();
    setAlertsSeen(now);
    setSeen(now);
  };

  let body;
  if (!loaded) body = <RowSkeletons count={5} label="Loading incidents…" />;
  else if (error && incidents.length === 0) body = <ErrorState message={error} onRetry={() => refresh()} />;
  else if (filter === "nearby" && !pos)
    body = (
      <Empty icon={MapPinOff} title="Location unavailable" action={<Button variant="soft" size="sm" onClick={() => locate()}>Allow location</Button>}>
        Share your location to see alerts within {NEARBY_KM} km.
      </Empty>
    );
  else if (filter === "mine" && !user)
    body = (
      <Empty icon={UserRound} title="Sign in to see your activity" action={<Button variant="soft" size="sm" onClick={() => openAuth({ mode: "login" })}>Sign in</Button>}>
        Updates on your reports and missions appear here.
      </Empty>
    );
  else if (items.length === 0)
    body = (
      <Empty icon={Bell} title="You're all caught up">
        {filter === "mine" ? "Report an incident or join a mission to see updates." : "No alerts right now."}
      </Empty>
    );
  else
    body = items.map((i, idx) => {
      const d = describe(i);
      const Icon = d.icon;
      const isUnread = i.updated_at > seen;
      return (
        <button key={i.id} className={`alert-row pressable stagger ${isUnread ? "unread" : ""}`} style={stagger(idx)} onClick={() => navigate(`/incident/${i.id}`)}>
          <span className={`alert-ico ${d.cls}`}>
            <Icon size={18} />
          </span>
          <span className="grow">
            <strong>{d.head}</strong>
            <span className="muted small block clamp2">{d.body}</span>
            <span className="tiny muted">{timeAgo(i.updated_at)}</span>
          </span>
          {isUnread ? <span className="unread-dot" aria-label="Unread" /> : <ChevronRight size={16} className="chev" />}
        </button>
      );
    });

  return (
    <div className="screen">
      <TopBar
        large
        title="Notifications"
        right={
          <button className="link" onClick={markAll} disabled={unread === 0}>
            Mark all read
          </button>
        }
      />
      <div className="pad-x">
        <Chips
          options={[
            { value: "all" as Filter, label: "All" },
            { value: "nearby" as Filter, label: "Nearby" },
            { value: "mine" as Filter, label: "My Activity" },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </div>
      <div className="list" key={filter}>
        {body}
      </div>
    </div>
  );
}
