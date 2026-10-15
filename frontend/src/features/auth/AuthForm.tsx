import { useState, type FormEvent } from "react";
import { Button } from "../../components/Button";
import { Field, FormError } from "../../components/Form";
import formStyles from "../../components/Form.module.css";
import { t } from "../../i18n";
import { useLogin, useRegister } from "./api";

/** Log in or create an account (one form, switchable). Used on "Me" and wherever login is needed. */
export function AuthForm() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [hasVehicle, setHasVehicle] = useState(false);
  const login = useLogin();
  const register = useRegister();
  const mutation = mode === "login" ? login : register;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mode === "login") login.mutate({ email, password });
    else register.mutate({ email, password, full_name: fullName, has_vehicle: hasVehicle });
  };

  return (
    <form className={`${formStyles.form} ${formStyles.card}`} onSubmit={submit} noValidate>
      <h2>{mode === "login" ? t.auth.loginTitle : t.auth.registerTitle}</h2>
      {mode === "register" && (
        <Field label={t.auth.fullName} hint={t.auth.fullNameHint}>
          {(control) => (
            <input
              {...control}
              className={formStyles.input}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="name"
              required
            />
          )}
        </Field>
      )}
      <Field label={t.auth.email}>
        {(control) => (
          <input
            {...control}
            className={formStyles.input}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        )}
      </Field>
      <Field label={t.auth.password} hint={mode === "register" ? t.auth.passwordHint : undefined}>
        {(control) => (
          <input
            {...control}
            className={formStyles.input}
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        )}
      </Field>
      {mode === "register" && (
        <label className={formStyles.checkbox}>
          <input type="checkbox" checked={hasVehicle} onChange={(event) => setHasVehicle(event.target.checked)} />
          {t.auth.hasVehicle}
        </label>
      )}
      <FormError message={mutation.error?.message} />
      <Button type="submit" block disabled={mutation.isPending}>
        {mode === "login" ? t.auth.login : t.auth.register}
      </Button>
      <Button
        variant="ghost"
        block
        onClick={() => {
          setMode(mode === "login" ? "register" : "login");
          login.reset();
          register.reset();
        }}
      >
        {mode === "login" ? t.auth.switchToRegister : t.auth.switchToLogin}
      </Button>
    </form>
  );
}
