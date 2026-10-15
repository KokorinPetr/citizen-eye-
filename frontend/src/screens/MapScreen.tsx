import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  BadgeCheck,
  ChevronRight,
  Clock,
  Layers,
  List,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Phone,
  Search,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import { api, DEMO_NOTICE, type BBox } from "../lib/api";
import type { Center, Incident, IncidentType, Urgency } from "../lib/types";
import { INCIDENT_TYPES, URGENCIES } from "../lib/types";
import { CENTER_STATUS_LABEL, CENTER_TYPE_LABEL, TYPE_LABEL, URGENCY_LABEL, timeAgo } from "../lib/format";
import { BANGKOK, distanceKm, formatKm } from "../lib/geo";
import { useGeo, useIncidents } from "../state";
import { centerIcon, incidentIcon, meIcon } from "../mapIcons";
import {
  Button,
  Chips,
  Empty,
  ErrorState,
  IncidentRow,
  RowSkeletons,
  Segmented,
  Sheet,
  TypeBadge,
  TypeThumb,
  UrgencyBadge,
  VerifiedBadge,
} from "../ui";

type TypeFilter = "all" | IncidentType;
type View = "map" | "list";

interface Filters {
  urgencies: Urgency[];
  includeResolved: boolean;
  verifiedOnly: boolean;
}
const DEFAULT_FILTERS: Filters = { urgencies: [], includeResolved: false, verifiedOnly: false };

// Survives navigating to an incident and back, so the map doesn't reset.
const memory: {
  center?: L.LatLng;
  zoom?: number;
  type: TypeFilter;
  query: string;
  view: View;
  filters: Filters;
  centers: boolean;
} = { type: "all", query: "", view: "map", filters: DEFAULT_FILTERS, centers: false };

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  ...INCIDENT_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] })),
];

function matches(i: Incident, q: string) {
  if (!q) return true;
  const s = q.trim().toLowerCase();
  return [i.title, i.summary, i.area ?? ""].some((x) => x.toLowerCase().includes(s));
}

export default function MapScreen() {
  const { incidents, loaded, error, refresh } = useIncidents();
  const { pos, locate } = useGeo();
  const [params, setParams] = useSearchParams();
  const [type, setType] = useState<TypeFilter>(memory.type);
  const [query, setQuery] = useState(memory.query);
  const [view, setView] = useState<View>(params.get("view") === "list" ? "list" : memory.view);
  const [filters, setFilters] = useState<Filters>(memory.filters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [showCenters, setShowCenters] = useState(memory.centers);
  const [centers, setCenters] = useState<Center[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const mapRef = useRef<L.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    Object.assign(memory, { type, query, view, filters, centers: showCenters });
  }, [type, query, view, filters, showCenters]);

  const filterCount =
    filters.urgencies.length + (filters.includeResolved ? 1 : 0) + (filters.verifiedOnly ? 1 : 0);

  const visible = useMemo(
    () =>
      incidents.filter(
        (i) =>
          (filters.includeResolved || i.status !== "resolved") &&
          (type === "all" || i.type === type) &&
          (filters.urgencies.length === 0 || filters.urgencies.includes(i.urgency)) &&
          (!filters.verifiedOnly || i.verified) &&
          matches(i, query),
      ),
    [incidents, type, query, filters],
  );
  const selected = visible.find((i) => i.id === selectedId) ?? null;

  // /map?focus=ID — fly to an incident (used after submitting a report)
  const focus = Number(params.get("focus"));
  useEffect(() => {
    if (!focus || !mapReady) return;
    const i = incidents.find((x) => x.id === focus);
    if (!i || !mapRef.current) return;
    setView("map");
    setType("all");
    setQuery("");
    setSelectedId(i.id);
    mapRef.current.flyTo([i.lat, i.lng], 15, { duration: 0.8 });
    params.delete("focus");
    setParams(params, { replace: true });
  }, [focus, incidents, params, setParams, mapReady]);

  // First visit: fit the view to all active incidents.
  const fitted = useRef(!!memory.center);
  useEffect(() => {
    const map = mapRef.current;
    if (fitted.current || !map || focus || !loaded) return;
    const active = incidents.filter((i) => i.status !== "resolved");
    fitted.current = true;
    if (active.length) fitBounds(map, active);
  }, [incidents, loaded, focus, mapReady]);

  const loadCenters = (map: L.Map) => {
    const b = map.getBounds();
    const bbox: BBox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    api.listCenters({ bbox }).then(setCenters).catch(() => {});
  };

  useEffect(() => {
    if (showCenters && mapRef.current && mapReady) loadCenters(mapRef.current);
  }, [showCenters, mapReady]);

  const goToMe = async () => {
    setLocating(true);
    const p = pos ?? (await locate());
    setLocating(false);
    if (p) mapRef.current?.flyTo([p.lat, p.lng], 15, { duration: 0.6 });
  };

  const onSearchSubmit = () => {
    if (!visible.length) return;
    if (view === "map" && mapRef.current) fitBounds(mapRef.current, visible);
    (document.activeElement as HTMLElement | null)?.blur();
  };

  const listSorted = useMemo(
    () =>
      visible
        .slice()
        .sort((a, b) => (pos ? distanceKm(pos, a) - distanceKm(pos, b) : b.created_at.localeCompare(a.created_at))),
    [visible, pos],
  );

  return (
    <div className={`screen map-screen ${DEMO_NOTICE ? "with-notice" : ""}`}>
      <div className="map-overlay-top">
        <form
          className="search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            onSearchSubmit();
          }}
        >
          <Search size={18} className="muted" />
          <input
            placeholder="Search incidents or area…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search incidents"
            enterKeyHint="search"
          />
          {query && (
            <button type="button" className="search-clear" onClick={() => setQuery("")} aria-label="Clear search">
              <X size={14} />
            </button>
          )}
          <button
            type="button"
            className={`search-filter ${filterCount ? "on" : ""}`}
            onClick={() => setFilterOpen(true)}
            aria-label={`Filters${filterCount ? ` (${filterCount} active)` : ""}`}
          >
            <SlidersHorizontal size={17} />
            {filterCount > 0 && <span className="filter-count">{filterCount}</span>}
          </button>
        </form>
        <Chips options={TYPE_OPTIONS} value={type} onChange={setType} label="Incident type" />
        <Segmented
          options={[
            { value: "map" as View, label: "Map", icon: MapIcon },
            { value: "list" as View, label: "List", icon: List },
          ]}
          value={view}
          onChange={(v) => {
            setView(v);
            setSelectedId(null);
          }}
        />
        {DEMO_NOTICE && <div className="demo-note">Demo · all incidents are synthetic test data</div>}
        {view === "map" && (
          <div className="overlay-floats">
            <div className="map-fabs">
              <button className={`fab-sm ${locating ? "busy" : ""}`} onClick={goToMe} aria-label="Go to my location">
                <LocateFixed size={20} />
              </button>
              <button
                className={`fab-sm ${showCenters ? "on" : ""}`}
                onClick={() => setShowCenters((s) => !s)}
                aria-pressed={showCenters}
                aria-label="Show emergency centers"
              >
                <Layers size={20} />
              </button>
            </div>

            {showCenters && (
              <div className="map-legend fade-up" aria-hidden>
                <span><i className="cl shelter" />Shelter</span>
                <span><i className="cl hospital" />Hospital</span>
                <span><i className="cl fire_station" />Fire</span>
                <span><i className="cl police" />Police</span>
              </div>
            )}

            {query && loaded && (
              <div className="result-pill fade-up">
                {visible.length} result{visible.length === 1 ? "" : "s"} for “{query.trim()}”
              </div>
            )}

          </div>
        )}
      </div>

      <div className={`map-wrap ${view === "map" ? "shown" : "away"}`} aria-hidden={view !== "map"}>
        <MapContainer
          center={memory.center ?? [BANGKOK.lat, BANGKOK.lng]}
          zoom={memory.zoom ?? 12}
          zoomControl={false}
          className="map"
          ref={mapRef}
          whenReady={() => setMapReady(true)}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapEvents
            onMoveEnd={(m) => {
              memory.center = m.getCenter();
              memory.zoom = m.getZoom();
              if (showCenters) loadCenters(m);
            }}
            onClick={() => setSelectedId(null)}
            visible={view === "map"}
          />
          {pos && <Marker position={[pos.lat, pos.lng]} icon={meIcon} interactive={false} />}
          {showCenters &&
            centers.map((c) => (
              <Marker key={`c${c.id}`} position={[c.lat, c.lng]} icon={centerIcon(c.type)}>
                <Popup>
                  <strong>{c.name}</strong>
                  <br />
                  {CENTER_TYPE_LABEL[c.type]} · {CENTER_STATUS_LABEL[c.status]}
                  {c.capacity != null && <> · {c.capacity} capacity</>}
                  {c.phone && (
                    <>
                      <br />
                      <a href={`tel:${c.phone}`}>
                        <Phone size={11} /> {c.phone}
                      </a>
                    </>
                  )}
                </Popup>
              </Marker>
            ))}
          {visible.map((i) => (
            <Marker
              key={i.id}
              position={[i.lat, i.lng]}
              icon={incidentIcon(i.type, i.urgency, i.status, i.id === selectedId)}
              zIndexOffset={i.id === selectedId ? 1000 : i.urgency === "critical" ? 500 : 0}
              eventHandlers={{ click: () => setSelectedId(i.id) }}
              title={i.title}
            />
          ))}
        </MapContainer>

        {selected && <PreviewCard key={selected.id} incident={selected} onClose={() => setSelectedId(null)} />}
      </div>

      <div className={`list-view ${view === "list" ? "shown" : "away"}`} aria-hidden={view !== "list"}>
        {!loaded ? (
          <RowSkeletons count={5} label="Loading incidents…" />
        ) : error && incidents.length === 0 ? (
          <ErrorState message={error} onRetry={() => refresh()} />
        ) : listSorted.length === 0 ? (
          <Empty
            icon={Search}
            title={query || type !== "all" || filterCount ? "No matching incidents" : "No active incidents"}
            action={
              (query || type !== "all" || filterCount > 0) && (
                <Button
                  variant="soft"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setType("all");
                    setFilters(DEFAULT_FILTERS);
                  }}
                >
                  Clear filters
                </Button>
              )
            }
          >
            {query || type !== "all" || filterCount ? "Try a different search or filter." : "Everything is calm right now."}
          </Empty>
        ) : (
          <>
            <div className="list-caption">
              {listSorted.length} incident{listSorted.length === 1 ? "" : "s"} · {pos ? "nearest first" : "newest first"}
            </div>
            {view === "list" && listSorted.map((i, idx) => <IncidentRow key={i.id} incident={i} index={idx} />)}
          </>
        )}
      </div>

      <FilterSheet
        open={filterOpen}
        value={filters}
        onClose={() => setFilterOpen(false)}
        onApply={(f) => {
          setFilters(f);
          setFilterOpen(false);
        }}
      />
    </div>
  );
}

function fitBounds(map: L.Map, list: Incident[]) {
  map.fitBounds(L.latLngBounds(list.map((i) => [i.lat, i.lng] as [number, number])), {
    paddingTopLeft: [28, 200],
    paddingBottomRight: [28, 60],
    maxZoom: 15,
  });
}

function MapEvents({
  onMoveEnd,
  onClick,
  visible,
}: {
  onMoveEnd: (m: L.Map) => void;
  onClick: () => void;
  visible: boolean;
}) {
  const map = useMap();
  useMapEvents({ moveend: () => onMoveEnd(map), click: onClick });
  // Leaflet needs a size recalculation after being shown again.
  useEffect(() => {
    if (visible) {
      const t = setTimeout(() => map.invalidateSize(), 60);
      return () => clearTimeout(t);
    }
  }, [visible, map]);
  return null;
}

function FilterSheet({
  open,
  value,
  onClose,
  onApply,
}: {
  open: boolean;
  value: Filters;
  onClose: () => void;
  onApply: (f: Filters) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);
  const toggleUrg = (u: Urgency) =>
    setDraft((d) => ({
      ...d,
      urgencies: d.urgencies.includes(u) ? d.urgencies.filter((x) => x !== u) : [...d.urgencies, u],
    }));

  return (
    <Sheet open={open} onClose={onClose} title="Filters">
      <div className="filter-group">
        <span className="filter-label">Urgency</span>
        <div className="urg-pick">
          {URGENCIES.slice()
            .reverse()
            .map((u) => (
              <button
                key={u}
                className={`urg-opt urg-${u} ${draft.urgencies.includes(u) ? "active" : ""}`}
                aria-pressed={draft.urgencies.includes(u)}
                onClick={() => toggleUrg(u)}
              >
                <span className="dot" />
                {URGENCY_LABEL[u]}
              </button>
            ))}
        </div>
        <small className="muted">None selected shows every urgency.</small>
      </div>
      <label className="switch-row">
        <span className="grow">
          <strong>Show resolved incidents</strong>
          <small className="muted block">Hidden by default</small>
        </span>
        <input
          type="checkbox"
          className="switch"
          checked={draft.includeResolved}
          onChange={(e) => setDraft((d) => ({ ...d, includeResolved: e.target.checked }))}
        />
      </label>
      <label className="switch-row">
        <span className="grow">
          <strong>
            Verified only <BadgeCheck size={14} className="ok-ico" />
          </strong>
          <small className="muted block">Confirmed by 2 or more reports</small>
        </span>
        <input
          type="checkbox"
          className="switch"
          checked={draft.verifiedOnly}
          onChange={(e) => setDraft((d) => ({ ...d, verifiedOnly: e.target.checked }))}
        />
      </label>
      <div className="btn-row">
        <Button variant="secondary" onClick={() => setDraft(DEFAULT_FILTERS)}>
          Reset
        </Button>
        <Button onClick={() => onApply(draft)}>Show results</Button>
      </div>
    </Sheet>
  );
}

function PreviewCard({ incident: i, onClose }: { incident: Incident; onClose: () => void }) {
  const navigate = useNavigate();
  const { pos } = useGeo();
  return (
    <div className="preview-card card pressable" onClick={() => navigate(`/incident/${i.id}`)} role="button" tabIndex={0}>
      <TypeThumb type={i.type} urgency={i.urgency} size={88} />
      <div className="preview-body">
        <div className="meta tight">
          <TypeBadge type={i.type} />
          {pos && (
            <span>
              <MapPin size={12} /> {formatKm(distanceKm(pos, i))}
            </span>
          )}
        </div>
        <div className="row-title">{i.title}</div>
        <p className="clamp2 muted small">{i.summary}</p>
        <div className="meta">
          <UrgencyBadge urgency={i.urgency} />
          {i.verified && <VerifiedBadge />}
          <span>
            <Users size={12} /> {i.volunteers_count}/{i.needed_people}
          </span>
          <span>
            <Clock size={12} /> {timeAgo(i.created_at)}
          </span>
        </div>
      </div>
      <button
        className="preview-close"
        aria-label="Close preview"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <X size={14} />
      </button>
      <ChevronRight size={18} className="preview-chev" />
    </div>
  );
}
