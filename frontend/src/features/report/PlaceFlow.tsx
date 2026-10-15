import { useState } from "react";
import { useNavigate } from "react-router";
import type { CenterType, GeoPoint, NeedType } from "../../api/types";
import { Button } from "../../components/Button";
import { Choices, Field, FormError } from "../../components/Form";
import formStyles from "../../components/Form.module.css";
import { Screen } from "../../components/Screen";
import { t } from "../../i18n";
import { AuthForm } from "../auth/AuthForm";
import { useAuth } from "../auth/AuthProvider";
import { useCreateCenter } from "../centers/api";
import { CENTER_EMOJI } from "../map/meta";
import { PinPicker } from "../map/PinPicker";
import { AskStep } from "./AskLayout";
import styles from "./ReportFlow.module.css";

const PLACE_TYPES: CenterType[] = ["shelter", "supply_point"];
const SUPPLIES = Object.keys(t.needType) as NeedType[];

/** "Add a shelter or supply point": login → pin → details. */
export function PlaceFlow() {
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<"where" | "details">("where");
  const [location, setLocation] = useState<GeoPoint | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<CenterType>("shelter");
  const [supplies, setSupplies] = useState<NeedType[]>(["shelter", "water"]);
  const [capacity, setCapacity] = useState("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const create = useCreateCenter();

  if (!isLoggedIn) {
    return (
      <Screen title={t.ask.addPlace} lead={t.auth.loginToContinue}>
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
          <Button block disabled={!location} onClick={() => setStep("details")}>
            {t.ask.confirmPlace}
          </Button>
        }
      >
        <PinPicker onChange={setLocation} />
      </AskStep>
    );
  }

  const submit = () => {
    if (!location) return;
    create.mutate(
      {
        name: name.trim(),
        center_type: type,
        location,
        supplies,
        capacity: capacity ? Number(capacity) : null,
        phone: phone.trim() || null,
        description: description.trim(),
      },
      { onSuccess: (center) => navigate(`/places/${center.id}`) },
    );
  };

  return (
    <AskStep
      title={t.ask.addPlace}
      actions={
        <>
          <Button block disabled={name.trim().length < 2 || create.isPending} onClick={submit}>
            {t.ask.createPlace}
          </Button>
          <Button variant="ghost" block onClick={() => setStep("where")}>
            {t.ask.back}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <Field label={t.ask.placeName}>
          {(control) => (
            <input
              {...control}
              className={formStyles.input}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t.ask.placeNamePlaceholder}
              maxLength={200}
            />
          )}
        </Field>
        <Choices
          label={t.ask.placeType}
          options={PLACE_TYPES.map((value) => ({ value, label: t.center.type[value], emoji: CENTER_EMOJI[value] }))}
          selected={[type]}
          onChange={([value]) => setType(value)}
        />
        <Choices
          label={t.ask.placeOffers}
          multiple
          options={SUPPLIES.map((value) => ({ value, label: t.needType[value] }))}
          selected={supplies}
          onChange={setSupplies}
        />
        {type === "shelter" && (
          <Field label={t.ask.capacity}>
            {(control) => (
              <input
                {...control}
                className={formStyles.input}
                type="number"
                inputMode="numeric"
                min={0}
                value={capacity}
                onChange={(event) => setCapacity(event.target.value)}
              />
            )}
          </Field>
        )}
        <Field label={t.ask.phone}>
          {(control) => (
            <input
              {...control}
              className={formStyles.input}
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          )}
        </Field>
        <Field label={t.ask.description}>
          {(control) => (
            <textarea
              {...control}
              className={formStyles.input}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={2000}
            />
          )}
        </Field>
        <FormError message={create.error?.message} />
      </div>
    </AskStep>
  );
}
