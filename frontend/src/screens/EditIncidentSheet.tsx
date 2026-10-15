import { useEffect, useState, type FormEvent } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import type { Incident, IncidentPatch, Task, Urgency } from "../lib/types";
import { URGENCIES } from "../lib/types";
import { URGENCY_LABEL, roleLabel } from "../lib/format";
import { useToast } from "../state";
import { Banner, Button, Field, Sheet } from "../ui";

const ROLES = ["driver", "carrier", "medic", "boat_operator", "general"];

/** PATCH /incidents/{id}: author or admin. Sends only the fields that changed. */
export default function EditIncidentSheet({
  open,
  incident,
  onClose,
  onSaved,
}: {
  open: boolean;
  incident: Incident;
  onClose: () => void;
  onSaved: (i: Incident) => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(incident.title);
  const [summary, setSummary] = useState(incident.summary);
  const [urgency, setUrgency] = useState<Urgency>(incident.urgency);
  const [needed, setNeeded] = useState(incident.needed_people);
  const [tasks, setTasks] = useState<Task[]>(incident.tasks);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Reset the draft each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setTitle(incident.title);
    setSummary(incident.summary);
    setUrgency(incident.urgency);
    setNeeded(incident.needed_people);
    setTasks(incident.tasks);
    setError(null);
    setSubmitted(false);
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const setTask = (idx: number, patch: Partial<Task>) =>
    setTasks((ts) => ts.map((t, i) => (i === idx ? { ...t, ...patch } : t)));

  const cleanTasks = tasks.filter((t) => t.needed > 0);
  const patch: IncidentPatch = {};
  if (title.trim() !== incident.title) patch.title = title.trim();
  if (summary.trim() !== incident.summary) patch.summary = summary.trim();
  if (urgency !== incident.urgency) patch.urgency = urgency;
  if (needed !== incident.needed_people) patch.needed_people = needed;
  if (JSON.stringify(cleanTasks) !== JSON.stringify(incident.tasks)) patch.tasks = cleanTasks;
  const changed = Object.keys(patch).length > 0;
  const titleError = submitted && !title.trim() ? "Title can't be empty" : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!title.trim() || !changed) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.patchIncident(incident.id, patch);
      toast("Changes saved", "success");
      onSaved(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Edit incident" tall locked={busy}>
      <form className="stack-lg" onSubmit={submit} noValidate>
        <Field label="Title" error={titleError}>
          {(id, invalid) => (
            <input id={id} className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} aria-invalid={invalid} />
          )}
        </Field>
        <Field label="Summary">
          {(id) => <textarea id={id} className="input" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />}
        </Field>
        <div className="field">
          <span className="field-label">Urgency</span>
          <div className="urg-pick">
            {URGENCIES.map((u) => (
              <button
                type="button"
                key={u}
                className={`urg-opt urg-${u} ${urgency === u ? "active" : ""}`}
                aria-pressed={urgency === u}
                onClick={() => setUrgency(u)}
              >
                <span className="dot" />
                {URGENCY_LABEL[u]}
              </button>
            ))}
          </div>
        </div>
        <div className="field inline">
          <span className="field-label">People needed</span>
          <Stepper value={needed} onChange={setNeeded} min={1} label="people needed" />
        </div>
        <div className="field">
          <span className="field-label">Tasks</span>
          <div className="stack-sm">
            {tasks.map((t, idx) => (
              <div key={idx} className="task-edit fade-up">
                <select className="input" value={t.role} onChange={(e) => setTask(idx, { role: e.target.value })} aria-label="Role">
                  {[...new Set([...ROLES, t.role])].map((r) => (
                    <option key={r} value={r}>
                      {roleLabel(r)}
                    </option>
                  ))}
                </select>
                <Stepper value={t.needed} onChange={(n) => setTask(idx, { needed: n })} min={1} label={`${roleLabel(t.role)} needed`} />
                <button
                  type="button"
                  className="icon-btn icon-btn-plain danger-ico"
                  aria-label="Remove task"
                  onClick={() => setTasks((ts) => ts.filter((_, i) => i !== idx))}
                  style={{ width: 36, height: 36 }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <Button type="button" variant="soft" size="sm" icon={Plus} onClick={() => setTasks((ts) => [...ts, { role: "general", needed: 1 }])}>
              Add task
            </Button>
          </div>
        </div>
        {error && <Banner kind="error">{error}</Banner>}
        <Button type="submit" block size="lg" loading={busy} disabled={!changed}>
          {busy ? "Saving…" : changed ? "Save changes" : "No changes yet"}
        </Button>
      </form>
    </Sheet>
  );
}

function Stepper({ value, onChange, min, label }: { value: number; onChange: (n: number) => void; min: number; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Decrease">
        <Minus size={14} />
      </button>
      <span key={value} className="pop">
        {value}
      </span>
      <button type="button" onClick={() => onChange(value + 1)} aria-label="Increase">
        <Plus size={14} />
      </button>
    </div>
  );
}
