import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { GeoPoint, ParsedPost, PostCategory } from "../../api/types";
import { Button } from "../../components/Button";
import { Note } from "../../components/Detail";
import { Choices, Field, FormError } from "../../components/Form";
import formStyles from "../../components/Form.module.css";
import { Screen } from "../../components/Screen";
import { LoadingState } from "../../components/States";
import { t } from "../../i18n";
import { AuthForm } from "../auth/AuthForm";
import { useAuth } from "../auth/AuthProvider";
import { POST_EMOJI } from "../map/meta";
import { PinPicker } from "../map/PinPicker";
import { AskStep } from "../report/AskLayout";
import flowStyles from "../report/ReportFlow.module.css";
import { useCreatePost, usePreviewPost } from "./api";

type Step = "where" | "what" | "check";
type Kind = keyof typeof t.ask.postPlaceholder;

const KIND_CATEGORY: Record<Kind, PostCategory> = {
  lost: "lost_pet",
  help_wanted: "help_wanted",
  help_offered: "help_offered",
};
const CATEGORIES = Object.keys(t.community.category) as PostCategory[];
const TITLE_MAX = 80;

function readKind(value: string | null): Kind {
  return value && value in KIND_CATEGORY ? (value as Kind) : "lost";
}

/** Without AI: start the form from the text itself, so nothing typed is lost. */
function draftFromText(text: string, category: PostCategory): ParsedPost {
  const clean = text.trim();
  return {
    category,
    title: clean.length > TITLE_MAX ? `${clean.slice(0, TITLE_MAX - 1)}…` : clean,
    description: clean,
    details: {},
    location_text: null,
    reward_amount: null,
    reward_note: null,
  };
}

/** New Community post: login → pin → describe → check the AI draft (editable) → posted. */
export function PostFlow() {
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const kind = readKind(searchParams.get("kind"));
  const [step, setStep] = useState<Step>("where");
  const [location, setLocation] = useState<GeoPoint | null>(null);
  const [text, setText] = useState("");
  const [phone, setPhone] = useState("");
  const [draft, setDraft] = useState<ParsedPost | null>(null);
  // Where the form came from: the AI draft, the text as is, or the text because the AI failed.
  const [draftSource, setDraftSource] = useState<"ai" | "text" | "aiFailed">("text");
  const preview = usePreviewPost();
  const create = useCreatePost();

  if (!isLoggedIn) {
    return (
      <Screen title={t.ask.postWhat} lead={t.auth.loginToContinue}>
        <AuthForm />
      </Screen>
    );
  }

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

  const fillByHand = (source: "text" | "aiFailed" = "text") => {
    setDraft(draftFromText(text, KIND_CATEGORY[kind]));
    setDraftSource(source);
    setStep("check");
  };

  if (step === "what") {
    const makeDraft = () => {
      preview.mutate(text, {
        onSuccess: (data) => {
          setDraft(data);
          setDraftSource("ai");
          setStep("check");
        },
        onError: () => fillByHand("aiFailed"),
      });
    };
    const tooShort = text.trim().length < 5;

    return (
      <AskStep
        title={t.ask.postWhat}
        actions={
          <>
            <Button block disabled={tooShort || preview.isPending} onClick={makeDraft}>
              {preview.isPending ? t.ask.checking : t.ask.makeDraft}
            </Button>
            <Button variant="ghost" block disabled={tooShort || preview.isPending} onClick={() => fillByHand()}>
              {t.ask.fillByHand}
            </Button>
            <Button variant="ghost" block onClick={() => setStep("where")}>
              {t.ask.back}
            </Button>
          </>
        }
      >
        <div className={flowStyles.form}>
          <Field label={t.ask.postWhat} hint={t.ask.postWhatHint}>
            {(control) => (
              <textarea
                {...control}
                className={formStyles.input}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={t.ask.postPlaceholder[kind]}
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
        </div>
      </AskStep>
    );
  }

  if (!draft || !location) return null;
  const update = (patch: Partial<ParsedPost>) => setDraft({ ...draft, ...patch });
  const publish = () =>
    create.mutate(
      {
        category: draft.category,
        title: draft.title.trim(),
        description: (draft.description ?? "").trim(),
        details: draft.details ?? {},
        location,
        location_text: draft.location_text?.trim() || null,
        reward_amount: draft.reward_amount || null,
        reward_note: draft.reward_amount ? draft.reward_note?.trim() || null : null,
        contact_phone: phone.trim() || null,
      },
      { onSuccess: (post) => navigate(`/posts/${post.id}`) },
    );

  return (
    <AskStep
      title={t.ask.stepCheck}
      hint={draftSource === "ai" ? t.ask.postCheckHint : undefined}
      actions={
        <>
          <Button block disabled={create.isPending || draft.title.trim().length < 3} onClick={publish}>
            {create.isPending ? t.ask.publishing : t.ask.publish}
          </Button>
          <Button variant="ghost" block onClick={() => setStep("what")}>
            {t.ask.back}
          </Button>
        </>
      }
    >
      <div className={flowStyles.form}>
        {draftSource === "aiFailed" && <Note>{t.ask.postAiUnavailable}</Note>}
        <Choices
          label={t.ask.category}
          options={CATEGORIES.map((value) => ({
            value,
            label: t.community.category[value],
            emoji: POST_EMOJI[value],
          }))}
          selected={[draft.category]}
          onChange={([category]) => update({ category })}
        />
        <Field label={t.ask.title}>
          {(control) => (
            <input
              {...control}
              className={formStyles.input}
              value={draft.title}
              onChange={(event) => update({ title: event.target.value })}
              maxLength={200}
            />
          )}
        </Field>
        <Field label={t.ask.postDescription}>
          {(control) => (
            <textarea
              {...control}
              className={formStyles.input}
              value={draft.description ?? ""}
              onChange={(event) => update({ description: event.target.value })}
              maxLength={2000}
            />
          )}
        </Field>
        <Field label={t.ask.locationText}>
          {(control) => (
            <input
              {...control}
              className={formStyles.input}
              value={draft.location_text ?? ""}
              onChange={(event) => update({ location_text: event.target.value })}
              placeholder={t.ask.locationTextPlaceholder}
              maxLength={300}
            />
          )}
        </Field>
        <Field label={t.ask.reward} hint={t.ask.rewardHint}>
          {(control) => (
            <input
              {...control}
              className={formStyles.input}
              type="number"
              inputMode="numeric"
              min={0}
              value={draft.reward_amount ?? ""}
              onChange={(event) =>
                update({ reward_amount: event.target.value === "" ? null : Number(event.target.value) })
              }
            />
          )}
        </Field>
        {Boolean(draft.reward_amount) && (
          <Field label={t.ask.rewardNote}>
            {(control) => (
              <input
                {...control}
                className={formStyles.input}
                value={draft.reward_note ?? ""}
                onChange={(event) => update({ reward_note: event.target.value })}
                placeholder={t.ask.rewardNotePlaceholder}
                maxLength={200}
              />
            )}
          </Field>
        )}
        <FormError message={create.error?.message} />
      </div>
    </AskStep>
  );
}
