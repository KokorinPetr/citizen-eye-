import { useState } from "react";
import { useNavigate } from "react-router";
import type { GeoPoint, NeedType, ParsedReport, ReportResult, Urgency } from "../../api/types";
import { Button } from "../../components/Button";
import { Choices, Field, FormError } from "../../components/Form";
import formStyles from "../../components/Form.module.css";
import { Note } from "../../components/Detail";
import { LoadingState } from "../../components/States";
import { t } from "../../i18n";
import { useAuth } from "../auth/AuthProvider";
import { PinPicker } from "../map/PinPicker";
import { AskStep } from "./AskLayout";
import { usePreviewReport, useSubmitReport } from "./api";
import styles from "./ReportFlow.module.css";

type Step = "where" | "what" | "check" | "done";

const NEED_TYPES = Object.keys(t.needType) as NeedType[];
const URGENCIES = Object.keys(t.urgency).reverse() as Urgency[]; // critical first

/** "I need help": pin → describe → check what the AI understood → sent. */
export function ReportFlow() {
  const [step, setStep] = useState<Step>("where");
  const [location, setLocation] = useState<GeoPoint | null>(null);
  const [text, setText] = useState("");
  const [phone, setPhone] = useState("");
  const [parsed, setParsed] = useState<ParsedReport | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [result, setResult] = useState<ReportResult | null>(null);
  const preview = usePreviewReport();
  const submit = useSubmitReport();

  const send = (confirmed: ParsedReport | null) => {
    if (!location) return;
    submit.mutate(
      {
        text,
        location,
        contact_phone: phone.trim() || undefined,
        parsed: confirmed ?? undefined,
      },
      {
        onSuccess: (data) => {
          setResult(data);
          setStep("done");
        },
      },
    );
  };

  const check = () =>
    preview.mutate(text, {
      onSuccess: (data) => {
        setParsed(data);
        setStep("check");
      },
      onError: () => setAiUnavailable(true),
    });

  if (step === "where") {
    return (
      <AskStep
        title={t.ask.stepWhere}
        hint={t.ask.stepWhereHint}
        fill
        actions={
          <Button block disabled={!location} onClick={() => setStep("what")}>
            {t.ask.confirmPlace}
          </Button>
        }
      >
        <PinPicker onChange={setLocation} />
      </AskStep>
    );
  }

  if (step === "what") {
    const tooShort = text.trim().length < 5;
    return (
      <AskStep
        title={t.ask.stepWhat}
        actions={
          <>
            <Button block disabled={tooShort || preview.isPending || submit.isPending} onClick={check}>
              {preview.isPending ? t.ask.checking : t.ask.check}
            </Button>
            <Button variant="ghost" block disabled={tooShort || submit.isPending} onClick={() => send(null)}>
              {submit.isPending ? t.ask.sending : t.ask.sendNow}
            </Button>
            <Button variant="ghost" block onClick={() => setStep("where")}>
              {t.ask.back}
            </Button>
          </>
        }
      >
        <div className={styles.form}>
          <Field label={t.ask.stepWhat} hint={t.ask.whatHint}>
            {(control) => (
              <textarea
                {...control}
                className={formStyles.input}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={t.ask.whatPlaceholder}
                maxLength={2000}
              />
            )}
          </Field>
          <Field label={t.ask.phone} hint={t.ask.phoneHint}>
            {(control) => (
              <input
                {...control}
                className={formStyles.input}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            )}
          </Field>
          {preview.isPending && <LoadingState label={t.ask.checking} />}
          {aiUnavailable && <Note>{t.ask.aiUnavailable}</Note>}
          <FormError message={submit.error?.message} />
        </div>
      </AskStep>
    );
  }

  if (step === "check" && parsed) {
    const update = (patch: Partial<ParsedReport>) => setParsed({ ...parsed, ...patch });
    return (
      <AskStep
        title={t.ask.stepCheck}
        hint={t.ask.stepCheckHint}
        actions={
          <>
            <Button block disabled={submit.isPending || parsed.title.trim().length < 3} onClick={() => send(parsed)}>
              {submit.isPending ? t.ask.sending : t.ask.send}
            </Button>
            <Button variant="ghost" block onClick={() => setStep("what")}>
              {t.ask.back}
            </Button>
          </>
        }
      >
        <div className={styles.form}>
          <Field label={t.ask.title}>
            {(control) => (
              <input
                {...control}
                className={formStyles.input}
                value={parsed.title}
                onChange={(event) => update({ title: event.target.value })}
              />
            )}
          </Field>
          <Choices
            label={t.ask.needType}
            options={NEED_TYPES.map((value) => ({ value, label: t.needType[value] }))}
            selected={parsed.need_type ? [parsed.need_type] : []}
            onChange={([need_type]) => update({ need_type })}
          />
          <Choices
            label={t.ask.urgency}
            options={URGENCIES.map((value) => ({ value, label: t.urgency[value] }))}
            selected={parsed.urgency ? [parsed.urgency] : []}
            onChange={([urgency]) => update({ urgency })}
          />
          <Field label={t.ask.people}>
            {(control) => (
              <input
                {...control}
                className={formStyles.input}
                type="number"
                inputMode="numeric"
                min={0}
                value={parsed.people_affected ?? ""}
                onChange={(event) =>
                  update({ people_affected: event.target.value === "" ? null : Number(event.target.value) })
                }
              />
            )}
          </Field>
          <Field label={t.ask.summary}>
            {(control) => (
              <textarea
                {...control}
                className={formStyles.input}
                value={parsed.summary ?? ""}
                onChange={(event) => update({ summary: event.target.value })}
              />
            )}
          </Field>
          {parsed.tasks && parsed.tasks.length > 0 && (
            <div className={formStyles.field}>
              <span className={formStyles.label}>{t.ask.tasks}</span>
              <ul className={styles.tasks}>
                {parsed.tasks.map((task, index) => (
                  <li key={index} className={styles.task}>
                    {task.title} ({t.role[task.role ?? "general"]}, {task.needed_count ?? 1})
                  </li>
                ))}
              </ul>
            </div>
          )}
          <FormError message={submit.error?.message} />
        </div>
      </AskStep>
    );
  }

  const startAgain = () => {
    setText("");
    setParsed(null);
    setResult(null);
    setAiUnavailable(false);
    preview.reset();
    submit.reset();
    setStep("where");
  };

  return <ReportDone result={result} onAgain={startAgain} />;
}

function ReportDone({ result, onAgain }: { result: ReportResult | null; onAgain: () => void }) {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  if (!result) return null;
  const rejected = result.status === "rejected";
  const message = rejected
    ? t.ask.doneRejected
    : result.was_merged
      ? t.ask.doneMerged
      : result.status === "failed"
        ? t.ask.doneFailed
        : null;

  return (
    <AskStep
      title={rejected ? t.ask.stepWhat : t.ask.doneTitle}
      actions={
        <>
          {result.incident && (
            <Button block icon="map" onClick={() => navigate(`/incidents/${result.incident!.id}`)}>
              {t.ask.seeOnMap}
            </Button>
          )}
          <Button variant="ghost" block onClick={onAgain}>
            {t.ask.askAgain}
          </Button>
        </>
      }
    >
      <div className={styles.result}>
        <span className={styles.resultEmoji} aria-hidden="true">
          {rejected ? "🤔" : "💚"}
        </span>
        {result.incident && <h2 className={styles.resultTitle}>{result.incident.title}</h2>}
        {message && <p>{message}</p>}
        {!isLoggedIn && !rejected && <Note>{t.ask.loginNote}</Note>}
      </div>
    </AskStep>
  );
}
