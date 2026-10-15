import { useEffect, useRef, useState, type CSSProperties } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type L from "leaflet";
import { useNavigate } from "react-router-dom";
import {
  Check,
  ClipboardList,
  GitMerge,
  ImageOff,
  LocateFixed,
  LogIn,
  MapPin,
  Pencil,
  RotateCcw,
  Sparkles,
  Tag,
  Users,
  X,
  AlertTriangle,
  FileText,
  Hand,
} from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { Incident, ReportResponse } from "../lib/types";
import { TYPE_LABEL, URGENCY_LABEL, roleLabel } from "../lib/format";
import { useAuth, useGeo, useIncidents, useToast } from "../state";
import { draftIcon } from "../mapIcons";
import { Banner, Button, Empty, Field, TopBar, TYPE_ICON, UrgencyBadge, VerifiedBadge, stagger, useBack } from "../ui";
import EditIncidentSheet from "./EditIncidentSheet";
import NearbyHelp from "../components/NearbyHelp";
import type { LatLng } from "../lib/geo";

type Step = "details" | "location" | "review" | "processing" | "result";
const MAX = 2000;
const MIN = 10;
const DRAFT_KEY = "ce_report_draft";

const EXAMPLES = [
  "Water up to knee level on Soi 12, an elderly woman needs medicine.",
  "น้ำท่วมสูงถึงเอว มีครอบครัว 4 คนติดอยู่ชั้นสอง ต้องการเรือ",
  "Мы застряли без питьевой воды, нас 10 человек, есть дети.",
];

function loadDraft(): string {
  try {
    return sessionStorage.getItem(DRAFT_KEY) ?? "";
  } catch {
    return "";
  }
}

export default function ReportScreen() {
  const navigate = useNavigate();
  const close = useBack("/map");
  const { user, ready, openAuth } = useAuth();
  const { pos, origin, locate } = useGeo();
  const { upsert } = useIncidents();
  const [step, setStep] = useState<Step>("details");
  const [text, setText] = useState(loadDraft);
  const [textTouched, setTextTouched] = useState(false);
  const [pin, setPin] = useState<LatLng | null>(null);
  const [result, setResult] = useState<ReportResponse | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [pending, setPending] = useState(false);
  // Set when the user leaves the AI-processing screen while the request runs.
  const detached = useRef(false);
  const toast = useToast();

  const go = (next: Step, d: "fwd" | "back" = "fwd") => {
    setDir(d);
    setStep(next);
  };

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, text);
    } catch {
      /* ignore */
    }
  }, [text]);

  // Default the pin to the user's position once known.
  useEffect(() => {
    if (!pin && pos) setPin(pos);
  }, [pos, pin]);

  // Deep link as a guest: offer sign-in in place instead of redirecting.
  if (ready && !user)
    return (
      <div className="screen">
        <TopBar onBack={close} title="Report an Incident" />
        <Empty
          icon={LogIn}
          title="Sign in to report"
          action={
            <Button icon={LogIn} onClick={() => openAuth({ mode: "login", reason: "Sign in to report an incident." })}>
              Sign in or create account
            </Button>
          }
        >
          Reports need an account so volunteers can trust them. Browsing the map stays open to everyone.
        </Empty>
      </div>
    );

  const trimmed = text.trim();
  const textError =
    textTouched && trimmed.length < MIN
      ? trimmed.length === 0
        ? "Describe what's happening"
        : `Add a bit more detail (at least ${MIN} characters)`
      : null;
  const point = pin ?? origin;

  const submit = async () => {
    if (pending) return;
    detached.current = false;
    setPending(true);
    go("processing");
    setError("");
    setDone(false);
    try {
      const r = await api.createReport(trimmed, point.lat, point.lng);
      upsert(r.incident);
      setResult(r);
      setText("");
      setDone(true);
      if (detached.current) {
        // The user went back while waiting; the report is live, so show it.
        toast(r.merged ? "Your report was merged with a nearby incident" : "Your report was published", "success");
        go("result");
      } else {
        // Let the checklist finish before revealing the result.
        setTimeout(() => go("result"), 650);
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        go("review", "back");
        return; // the sign-in sheet opens globally
      }
      setError(
        e instanceof ApiError && e.status === 502
          ? "Our AI couldn't process this report. Your text is safe. Please try again."
          : (e as Error).message,
      );
      go("review", "back");
    } finally {
      setPending(false);
    }
  };

  if (step === "processing")
    return (
      <Processing
        done={done}
        onBack={() => {
          detached.current = true;
          go("review", "back");
        }}
      />
    );
  if (step === "result" && result)
    return (
      <Result
        result={result}
        // Going back to the form would allow a duplicate submission, so Back
        // leaves the flow and shows the new incident on the map instead.
        onBack={() => navigate(`/map?focus=${result.incident.id}`, { replace: true, state: { back: true } })}
        onMap={() => navigate(`/map?focus=${result.incident.id}`, { replace: true })}
        onOpen={() => navigate(`/incident/${result.incident.id}`, { replace: true })}
      />
    );

  const stepIdx = step === "details" ? 0 : step === "location" ? 1 : 2;

  return (
    <div className="screen report-screen">
      <TopBar
        title="Report an Incident"
        // Step 1 Back leaves the flow; the draft stays in sessionStorage.
        onBack={step === "details" ? close : () => go(step === "location" ? "details" : "location", "back")}
        right={
          step !== "details" && (
            <button className="icon-btn icon-btn-tinted pressable" style={{ width: 36, height: 36 }} onClick={close} aria-label="Close (draft is kept)">
              <X size={17} />
            </button>
          )
        }
      />

      <ol className="steps" aria-label="Progress" style={{ "--p": stepIdx / 2 } as CSSProperties}>
        <span className="steps-track" aria-hidden>
          <span />
        </span>
        {["Details", "Location", "Review"].map((s, i) => (
          <li key={s} className={i < stepIdx ? "done" : i === stepIdx ? "current" : ""} aria-current={i === stepIdx ? "step" : undefined}>
            <span className="step-dot">{i < stepIdx ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
            <small>{s}</small>
          </li>
        ))}
      </ol>

      <div className={`report-body step-panel step-${dir}`} key={step}>
        {step === "details" && (
          <>
            <Field
              label="Describe what happened"
              error={textError}
              right={
                <small className={`counter ${text.length > MAX * 0.9 ? "warn" : ""}`}>
                  {text.length}/{MAX}
                </small>
              }
            >
              {(id, invalid) => (
                <textarea
                  id={id}
                  className="input"
                  rows={6}
                  maxLength={MAX}
                  placeholder="What's happening, how many people, what's needed? Any language: English, ไทย, Русский."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onBlur={() => trimmed && setTextTouched(true)}
                  aria-invalid={invalid}
                />
              )}
            </Field>

            {!text && (
              <div className="examples">
                <small className="muted">Try an example</small>
                {EXAMPLES.map((ex, i) => (
                  <button key={ex} className="example pressable stagger" style={stagger(i)} onClick={() => setText(ex)}>
                    {ex}
                  </button>
                ))}
              </div>
            )}

            <div className="ai-hint">
              <Sparkles size={18} />
              <span>
                <strong>AI fills in the details.</strong> It detects the incident type, urgency, people needed and tasks.
                Don't include phone numbers or exact addresses. Only the area is public.
              </span>
            </div>

            <div className="unsupported" aria-disabled>
              <ImageOff size={16} />
              <span>Photos aren't supported yet. Text only for now.</span>
            </div>

            <div className="spacer" />
            <Button
              block
              size="lg"
              onClick={() => {
                setTextTouched(true);
                if (trimmed.length >= MIN) go("location");
              }}
            >
              Next
            </Button>
          </>
        )}

        {step === "location" && (
          <>
            <p className="muted small">
              <Hand size={14} /> Drag the pin or tap the map where help is needed.
            </p>
            <PinPicker value={point} onChange={setPin} onLocate={locate} />
            <div className="coords">
              <MapPin size={14} />
              <span>
                {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
              </span>
              {!pin && <span className="badge urg-medium">Default: central Bangkok</span>}
            </div>
            <div className="spacer" />
            <Button
              block
              size="lg"
              onClick={() => {
                setPin(point);
                go("review");
              }}
            >
              Confirm location
            </Button>
          </>
        )}

        {step === "review" && (
          <>
            <div className="card review-card">
              <div className="review-head">
                <FileText size={16} />
                <small>Your report</small>
                <button className="link sm" onClick={() => go("details", "back")}>
                  Edit
                </button>
              </div>
              <p className="pre">{trimmed}</p>
            </div>
            <div className="card review-card">
              <div className="review-head">
                <MapPin size={16} />
                <small>Location</small>
                <button className="link sm" onClick={() => go("location", "back")}>
                  Change
                </button>
              </div>
              <p>
                {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
              </p>
            </div>
            {error && (
              <Banner kind="error" icon={AlertTriangle}>
                {error}
              </Banner>
            )}
            <p className="fine-print">Submitting publishes the incident on the shared map. You can edit it afterwards.</p>
            <div className="spacer" />
            <Button block size="lg" icon={error ? RotateCcw : Sparkles} loading={pending} onClick={submit}>
              {pending ? "Waiting for the AI…" : error ? "Try again" : "Submit report"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function PinPicker({ value, onChange, onLocate }: { value: LatLng; onChange: (p: LatLng) => void; onLocate: () => Promise<LatLng | null> }) {
  const mapRef = useRef<L.Map | null>(null);
  const [locating, setLocating] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className="pin-map">
      <MapContainer center={[value.lat, value.lng]} zoom={16} zoomControl={false} className="map" ref={mapRef}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <PinEvents onChange={onChange} />
        <Marker
          position={[value.lat, value.lng]}
          icon={draftIcon}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const ll = (e.target as L.Marker).getLatLng();
              onChange({ lat: ll.lat, lng: ll.lng });
            },
          }}
        />
      </MapContainer>
      <button
        className={`pin-locate ${locating ? "busy" : ""}`}
        type="button"
        onClick={async () => {
          setLocating(true);
          setFailed(false);
          const p = await onLocate();
          setLocating(false);
          if (p) {
            onChange(p);
            mapRef.current?.flyTo([p.lat, p.lng], 17, { duration: 0.5 });
          } else setFailed(true);
        }}
      >
        {locating ? <span className="spinner sm" /> : <LocateFixed size={16} />}
        {failed ? "Location unavailable" : "Use my location"}
      </button>
    </div>
  );
}

/** Tapping the map moves the pin there. */
function PinEvents({ onChange }: { onChange: (p: LatLng) => void }) {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 50);
    return () => clearTimeout(t);
  }, [map]);
  useMapEvents({ click: (e) => onChange({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

const STAGES = ["Understanding the situation", "Identifying incident type", "Estimating urgency", "Creating tasks", "Checking for nearby reports"];

/**
 * Shown while POST /reports is in flight (2–6 s). The checklist is paced on a
 * timer because the API doesn't report progress; it completes when the
 * response arrives.
 */
function Processing({ done, onBack }: { done: boolean; onBack: () => void }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((x) => Math.min(x + 1, STAGES.length - 1)), 1100);
    return () => clearInterval(t);
  }, []);
  const current = done ? STAGES.length : n;
  return (
    <div className="screen processing-screen">
      <TopBar onBack={done ? false : onBack} title="AI Processing" />
      <div className="processing" aria-live="polite">
      <div className="orb">
        <span className="orb-ring" />
        <span className="orb-ring r2" />
        <span className="orb-core">{done ? <Check size={34} strokeWidth={2.6} /> : <Sparkles size={32} />}</span>
      </div>
      <h2>{done ? "Done!" : "Analyzing your report…"}</h2>
      <p className="muted">Our AI is organizing the information to create an incident. This usually takes a few seconds.</p>
      <ul className="checklist">
        {STAGES.map((s, i) => (
          <li key={s} className={i < current ? "done" : i === current ? "current" : ""}>
            <span className="check">{i < current && <Check size={12} strokeWidth={3} />}</span>
            {s}
          </li>
        ))}
      </ul>
      {!done && <p className="fine-print processing-note">Going back won't cancel the request. We'll show the result when it's ready.</p>}
      </div>
    </div>
  );
}

function Result({
  result,
  onBack,
  onMap,
  onOpen,
}: {
  result: ReportResponse;
  onBack: () => void;
  onMap: () => void;
  onOpen: () => void;
}) {
  const { user } = useAuth();
  const { upsert } = useIncidents();
  const [inc, setInc] = useState<Incident>(result.incident);
  const [editing, setEditing] = useState(false);
  const Icon = TYPE_ICON[inc.type];
  const canEdit = !!user && (user.id === inc.created_by || user.is_admin);

  const EditBtn = () =>
    canEdit ? (
      <button className="link sm" onClick={() => setEditing(true)}>
        <Pencil size={12} /> Edit
      </button>
    ) : null;

  const rows = [
    { icon: MapPin, label: "Location", value: inc.area ?? `${inc.lat.toFixed(4)}, ${inc.lng.toFixed(4)}`, note: "From your pin" },
    { icon: Tag, label: "Incident type", value: TYPE_LABEL[inc.type], note: "Set by AI" },
    { icon: AlertTriangle, label: "Urgency level", value: <UrgencyBadge urgency={inc.urgency} />, edit: true },
    { icon: Users, label: "People needed", value: `${inc.needed_people}`, edit: true },
  ];

  return (
    <div className="screen result-screen">
      <TopBar title="Review AI Result" onBack={onBack} />
      <div className="report-body">
        {result.merged ? (
          <Banner kind="info" icon={GitMerge}>
            <strong>Merged with an existing report nearby.</strong> Your report confirms this incident. It now has {inc.reports_count} reports
            {inc.verified ? " and is verified." : "."}
          </Banner>
        ) : (
          <div className="ai-banner fade-up">
            <span className="ai-banner-ico">
              <Sparkles size={20} />
            </span>
            <span>
              <strong>Here is what we understood.</strong> Your report is already live on the map. Check it and fix anything
              that's off.
            </span>
          </div>
        )}

        <div className="card result-card">
          <div className="result-head">
            <span className={`thumb thumb-${inc.urgency}`} style={{ width: 52, height: 52 }}>
              <Icon size={24} />
            </span>
            <div className="grow">
              <strong>{inc.title}</strong>
              <div className="meta">
                <UrgencyBadge urgency={inc.urgency} />
                {inc.verified && <VerifiedBadge />}
              </div>
            </div>
            <EditBtn />
          </div>
          <ul className="kv-list">
            {rows.map((r, i) => (
              <li key={r.label} className="stagger" style={stagger(i)}>
                <span className="kv-ico">
                  <r.icon size={16} />
                </span>
                <span className="grow">
                  <small>{r.label}</small>
                  <span className="kv-val">{r.value}</span>
                </span>
                {r.edit ? <EditBtn /> : <small className="muted">{r.note}</small>}
              </li>
            ))}
          </ul>
          <div className="kv-block">
            <div className="kv-block-head">
              <small>Summary</small>
              <EditBtn />
            </div>
            <p>{inc.summary || <span className="muted">No summary.</span>}</p>
          </div>
          <div className="kv-block">
            <div className="kv-block-head">
              <small>
                <ClipboardList size={13} /> Suggested tasks
              </small>
              <EditBtn />
            </div>
            {inc.tasks.length ? (
              <ul className="task-chips">
                {inc.tasks.map((t, i) => (
                  <li key={i}>
                    <Users size={12} /> {roleLabel(t.role)} × {t.needed}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">No tasks suggested.</p>
            )}
          </div>
          <p className="fine-print left">
            {URGENCY_LABEL[inc.urgency]} urgency · type and location can't be changed after publishing.
          </p>
        </div>

        <NearbyHelp incident={inc} defaultOpen={false} />

        <div className="spacer" />
        <div className="btn-row">
          <Button variant="secondary" onClick={onOpen}>
            Open incident
          </Button>
          <Button icon={MapPin} onClick={onMap}>
            View on map
          </Button>
        </div>
      </div>

      <EditIncidentSheet
        open={editing}
        incident={inc}
        onClose={() => setEditing(false)}
        onSaved={(i) => {
          setInc(i);
          upsert(i);
          setEditing(false);
        }}
      />
    </div>
  );
}
