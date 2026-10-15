import { useCallback, useEffect, useState } from "react";
import { Building2, ExternalLink, Info, MapPin, Navigation, Phone, PhoneCall, Users } from "lucide-react";
import { api } from "../lib/api";
import type { Center, CenterType } from "../lib/types";
import { CENTER_TYPES } from "../lib/types";
import { CENTER_STATUS_LABEL, CENTER_TYPE_LABEL, formatDate, hostOf } from "../lib/format";
import { directionsUrl, formatKm } from "../lib/geo";
import { ALL_HOTLINES } from "../lib/hotlines";
import { CENTER_ICON } from "../lib/icons";
import { useGeo } from "../state";
import { Chips, Empty, ErrorState, Expandable, SignalLoader, Skeleton, TopBar, stagger } from "../ui";
import { HotlineChips } from "../components/NearbyHelp";

type Filter = "all" | CenterType;
const PLURAL: Record<CenterType, string> = {
  shelter: "Shelters",
  hospital: "Hospitals",
  fire_station: "Fire Stations",
  police: "Police",
};

export default function CentersScreen() {
  const { origin, pos } = useGeo();
  const [filter, setFilter] = useState<Filter>("shelter");
  const [centers, setCenters] = useState<Center[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setCenters(null);
    setError(null);
    return api
      .listCenters({ near: origin, type: filter === "all" ? undefined : [filter], limit: 50 })
      .then(setCenters)
      .catch((e) => {
        setError((e as Error).message);
        setCenters([]);
      });
  }, [filter, origin]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="screen">
      <TopBar backFallback="/help" title="Emergency Centers" />
      <div className="pad-x">
        <Chips
          options={[{ value: "all" as Filter, label: "All" }, ...CENTER_TYPES.map((t) => ({ value: t as Filter, label: PLURAL[t] }))]}
          value={filter}
          onChange={setFilter}
        />
      </div>
      <div className="list">
        <Expandable title="Emergency hotlines" icon={PhoneCall}>
          <HotlineChips hotlines={ALL_HOTLINES} />
        </Expandable>
        <div className="banner banner-warn small">
          <Info size={16} />
          <span>
            From official and open sources. Status and capacity change quickly, so call to confirm before you go.
            {!pos && " Sorted by distance from central Bangkok."}
          </span>
        </div>
        {centers === null && <SignalLoader inline label="Loading emergency centers…" />}
        {centers === null ? (
          [0, 1, 2].map((i) => (
            <div key={i} className="card center-card">
              <div className="center-top">
                <Skeleton w={84} h={84} r={14} />
                <div className="grow stack-xs">
                  <Skeleton w="75%" h={15} />
                  <Skeleton w="45%" h={12} />
                  <Skeleton w="55%" h={12} />
                </div>
              </div>
            </div>
          ))
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : centers.length === 0 ? (
          <Empty icon={Building2} title="No centers found">
            Try another category.
          </Empty>
        ) : (
          centers.map((c, i) => <CenterCard key={c.id} c={c} index={i} />)
        )}
      </div>
    </div>
  );
}

function CenterCard({ c, index }: { c: Center; index: number }) {
  const Icon = CENTER_ICON[c.type];
  return (
    <div className="card center-card stagger" style={stagger(index)}>
      <div className="center-top">
        <span className={`center-art cbg-${c.type}`}>
          <Icon size={30} strokeWidth={1.7} />
        </span>
        <div className="grow">
          <strong className="center-name">{c.name}</strong>
          <div className="meta">
            {c.distance_km != null && (
              <span>
                <MapPin size={12} /> {formatKm(c.distance_km)}
              </span>
            )}
            {c.district && <span>{c.district}</span>}
          </div>
          <div className="meta">
            <span className={`badge cst-bg-${c.status}`}>
              <span className="dot" />
              {CENTER_STATUS_LABEL[c.status]}
            </span>
            <span>{CENTER_TYPE_LABEL[c.type]}</span>
            {c.capacity != null && (
              <span>
                <Users size={12} /> {c.capacity} capacity
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="center-actions">
        {c.phone ? (
          <a className="btn btn-secondary btn-sm" href={`tel:${c.phone}`}>
            <Phone size={14} /> <span>{c.phone}</span>
          </a>
        ) : (
          <span className="tiny muted">No phone listed</span>
        )}
        <a className="btn btn-soft btn-sm" href={directionsUrl(c)} target="_blank" rel="noreferrer">
          <Navigation size={14} /> <span>Directions</span>
        </a>
      </div>
      <div className="tiny muted source">
        Source:{" "}
        <a href={c.source_url} target="_blank" rel="noreferrer">
          {hostOf(c.source_url)} <ExternalLink size={10} />
        </a>{" "}
        · retrieved {formatDate(c.retrieved_at)}
      </div>
    </div>
  );
}
