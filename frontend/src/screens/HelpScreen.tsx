import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, ChevronRight, HandHeart } from "lucide-react";
import type { IncidentType } from "../lib/types";
import { INCIDENT_TYPES } from "../lib/types";
import { TYPE_LABEL, URGENCY_RANK } from "../lib/format";
import { distanceKm } from "../lib/geo";
import { useGeo, useIncidents } from "../state";
import { Chips, Empty, ErrorState, IncidentRow, RowSkeletons, TopBar } from "../ui";
import CommunityTabs from "../components/CommunityTabs";

type Filter = "nearby" | "urgent" | IncidentType;

export default function HelpScreen() {
  const { incidents, loaded, error, refresh } = useIncidents();
  const { origin, pos } = useGeo();
  const [filter, setFilter] = useState<Filter>("nearby");

  const list = useMemo(() => {
    const open = incidents.filter((i) => i.status !== "resolved" && i.volunteers_count < i.needed_people);
    const filtered = open.filter((i) =>
      filter === "nearby" ? true : filter === "urgent" ? i.urgency === "high" || i.urgency === "critical" : i.type === filter,
    );
    return filtered.sort((a, b) =>
      filter === "nearby"
        ? distanceKm(origin, a) - distanceKm(origin, b)
        : URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || distanceKm(origin, a) - distanceKm(origin, b),
    );
  }, [incidents, filter, origin]);

  const mine = incidents.filter((i) => i.viewer_is_volunteering && i.status !== "resolved");

  return (
    <div className="screen">
      <TopBar large title="Community" />
      <CommunityTabs value="help" />
      <div className="pad-x">
        <Chips
          options={[
            { value: "nearby" as Filter, label: "Nearby" },
            { value: "urgent" as Filter, label: "High Urgency" },
            ...INCIDENT_TYPES.map((t) => ({ value: t as Filter, label: TYPE_LABEL[t] })),
          ]}
          value={filter}
          onChange={setFilter}
        />
      </div>
      <div className="list" key={filter}>
        <Link to="/centers" className="card link-card pressable">
          <span className="alert-ico info">
            <Building2 size={18} />
          </span>
          <span className="grow">
            <strong>Emergency centers</strong>
            <span className="muted small block">Shelters, hospitals, fire & police stations</span>
          </span>
          <ChevronRight size={18} className="chev" />
        </Link>

        {mine.length > 0 && (
          <>
            <h3 className="section-title">Your active missions</h3>
            {mine.map((i, idx) => (
              <IncidentRow key={i.id} incident={i} index={idx} />
            ))}
            <h3 className="section-title">Needs help</h3>
          </>
        )}

        {!loaded ? (
          <RowSkeletons label="Loading incidents…" />
        ) : error && incidents.length === 0 ? (
          <ErrorState message={error} onRetry={() => refresh()} />
        ) : list.length === 0 ? (
          <Empty icon={HandHeart} title="No open requests here">
            Every matching incident has enough volunteers right now.
          </Empty>
        ) : (
          <>
            {filter === "nearby" && !pos && <p className="list-caption">Sorted by distance from central Bangkok</p>}
            {list.map((i, idx) => (
              <IncidentRow key={i.id} incident={i} index={idx} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
