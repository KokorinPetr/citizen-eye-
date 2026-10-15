import { useEffect, useState } from "react";
import { Building2, ExternalLink, Navigation, Phone, PhoneCall } from "lucide-react";
import { api } from "../lib/api";
import type { Center, Incident } from "../lib/types";
import { CENTER_STATUS_LABEL, CENTER_TYPE_LABEL, formatDate, hostOf } from "../lib/format";
import { directionsUrl, formatKm } from "../lib/geo";
import { hotlinesFor, type Hotline } from "../lib/hotlines";
import { CENTER_ICON } from "../lib/icons";
import { Expandable, Skeleton, stagger } from "../ui";

/** Nearest shelters/hospitals (GET /centers?near=…&type=shelter,hospital&limit=3) plus relevant hotlines. */
export default function NearbyHelp({ incident, defaultOpen = true }: { incident: Incident; defaultOpen?: boolean }) {
  const [centers, setCenters] = useState<Center[] | null>(null);
  const [failed, setFailed] = useState(false);
  const { lat, lng } = incident;

  useEffect(() => {
    setCenters(null);
    setFailed(false);
    api
      .listCenters({ near: { lat, lng }, type: ["shelter", "hospital"], limit: 3 })
      .then(setCenters)
      .catch(() => {
        setFailed(true);
        setCenters([]);
      });
  }, [lat, lng]);

  const hotlines = hotlinesFor(incident.type);

  return (
    <div className="stack-sm">
      <Expandable
        title="Nearest shelters & hospitals"
        icon={Building2}
        defaultOpen={defaultOpen}
        badge={centers && centers.length > 0 ? <span className="count-badge">{centers.length}</span> : null}
      >
        {centers === null ? (
          <div className="stack-sm">
            {[0, 1].map((i) => (
              <div key={i} className="center-mini">
                <Skeleton w={36} h={36} r={10} />
                <div className="grow stack-xs">
                  <Skeleton w="70%" h={13} />
                  <Skeleton w="45%" h={11} />
                </div>
              </div>
            ))}
          </div>
        ) : centers.length === 0 ? (
          <p className="muted small pad-sm">{failed ? "Couldn't load emergency centers." : "No centers found nearby."}</p>
        ) : (
          <div className="stack-sm">
            {centers.map((c, i) => (
              <NearCenter key={c.id} c={c} index={i} />
            ))}
            <p className="note">Status and capacity change quickly. Call to confirm before you go.</p>
          </div>
        )}
      </Expandable>
      <Expandable title="Emergency hotlines" icon={PhoneCall} badge={<span className="count-badge">{hotlines.length}</span>}>
        <HotlineChips hotlines={hotlines} />
      </Expandable>
    </div>
  );
}

export function HotlineChips({ hotlines }: { hotlines: Hotline[] }) {
  return (
    <div className="hotlines">
      {hotlines.map((h) => (
        <a key={h.number} href={`tel:${h.number}`} className="hotline pressable">
          <Phone size={14} />
          <strong>{h.number}</strong>
          <span>{h.label}</span>
        </a>
      ))}
    </div>
  );
}

export function NearCenter({ c, index = 0 }: { c: Center; index?: number }) {
  const Icon = CENTER_ICON[c.type];
  return (
    <div className="center-mini stagger" style={stagger(index)}>
      <span className={`cico cbg-${c.type}`}>
        <Icon size={17} />
      </span>
      <div className="grow">
        <strong className="clamp1">{c.name}</strong>
        <div className="muted small">
          {CENTER_TYPE_LABEL[c.type]}
          {c.distance_km != null && <> · {formatKm(c.distance_km)}</>} ·{" "}
          <span className={`cst-${c.status}`}>{CENTER_STATUS_LABEL[c.status]}</span>
        </div>
        <div className="tiny muted">
          <a href={c.source_url} target="_blank" rel="noreferrer">
            {hostOf(c.source_url)} <ExternalLink size={10} />
          </a>{" "}
          · {formatDate(c.retrieved_at)}
        </div>
      </div>
      <div className="mini-actions">
        {c.phone && (
          <a className="icon-btn icon-btn-tinted" style={{ width: 34, height: 34 }} href={`tel:${c.phone}`} aria-label={`Call ${c.name}`}>
            <Phone size={15} />
          </a>
        )}
        <a
          className="icon-btn icon-btn-tinted"
          style={{ width: 34, height: 34 }}
          href={directionsUrl(c)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Directions to ${c.name}`}
        >
          <Navigation size={15} />
        </a>
      </div>
    </div>
  );
}
