import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { ApiError, USE_MOCK } from "../lib/api";
import { markGuest } from "../lib/guest";
import { useAuth, type AuthMode } from "../state";
import { Banner, Button, Field } from "../ui";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function strength(pw: string): 0 | 1 | 2 | 3 {
  if (pw.length < 8) return pw ? 1 : 0;
  let s = 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(3, s) as 1 | 2 | 3;
}
const STRENGTH_LABEL = ["", "Weak", "Good", "Strong"];

/**
 * Email + password form for POST /auth/login and POST /auth/register.
 * The API has no display name, avatar or social login, so none are offered.
 */
export default function AuthForm({
  mode,
  onModeChange,
  onSuccess,
  compact,
}: {
  mode: AuthMode;
  onModeChange: (m: AuthMode) => void;
  onSuccess: () => void;
  /** Tighter layout for the welcome screen: placeholder-led fields with screen-reader labels. */
  compact?: boolean;
}) {
  const { login, register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const isLogin = mode === "login";

  const errors = {
    email: !email.trim() ? "Enter your email" : !EMAIL_RE.test(email.trim()) ? "Enter a valid email address" : null,
    password: !password
      ? "Enter your password"
      : !isLogin && password.length < 8
        ? "Use at least 8 characters"
        : null,
    confirm: !isLogin && confirm !== password ? "Passwords don't match" : null,
  };
  const show_ = (k: keyof typeof errors) => (submitted || touched[k] ? errors[k] : null);
  const blur = (k: string) => () => setTouched((t) => ({ ...t, [k]: true }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setServerError(null);
    if (errors.email || errors.password || errors.confirm) return;
    setBusy(true);
    try {
      if (isLogin) await login(email.trim(), password);
      else await register(email.trim(), password);
      markGuest();
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setServerError("Wrong email or password.");
      else if (err instanceof ApiError && err.status === 409)
        setServerError("This email is already registered. Sign in instead.");
      else setServerError((err as Error).message);
      setBusy(false);
    }
  };

  const switchMode = (m: AuthMode) => {
    setServerError(null);
    setSubmitted(false);
    setTouched({});
    onModeChange(m);
  };

  const s = strength(password);

  return (
    <form className={`auth-form ${compact ? "compact" : ""}`} onSubmit={submit} noValidate>
      <Field label="Email" hideLabel={compact} error={show_("email")}>
        {(id, invalid) => (
          <div className="input-wrap">
            <Mail size={17} className="input-ico" />
            <input
              id={id}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={compact ? "Email" : "you@example.com"}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={blur("email")}
              aria-invalid={invalid}
              className="input with-ico"
            />
          </div>
        )}
      </Field>

      <Field
        label="Password"
        hideLabel={compact}
        error={show_("password")}
        hint={
          !isLogin &&
          password && (
            <span className={`strength s${s}`}>
              <span className="strength-bar">
                <i />
                <i />
                <i />
              </span>
              {STRENGTH_LABEL[s]}
            </span>
          )
        }
      >
        {(id, invalid) => (
          <div className="input-wrap">
            <Lock size={17} className="input-ico" />
            <input
              id={id}
              type={show ? "text" : "password"}
              autoComplete={isLogin ? "current-password" : "new-password"}
              placeholder={isLogin ? (compact ? "Password" : "Your password") : "Password (8+ characters)"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={blur("password")}
              aria-invalid={invalid}
              className="input with-ico with-action"
            />
            <button
              type="button"
              className="input-action"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        )}
      </Field>

      {!isLogin && (
        <Field label="Confirm password" hideLabel={compact} error={show_("confirm")}>
          {(id, invalid) => (
            <div className="input-wrap">
              <Lock size={17} className="input-ico" />
              <input
                id={id}
                type={show ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Repeat password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onBlur={blur("confirm")}
                aria-invalid={invalid}
                className="input with-ico"
              />
            </div>
          )}
        </Field>
      )}

      {serverError && <Banner kind="error">{serverError}</Banner>}

      <Button type="submit" block size={compact ? "md" : "lg"} variant={compact ? "dark" : "primary"} loading={busy}>
        {busy ? (isLogin ? "Signing in…" : "Creating account…") : isLogin ? "Sign in" : "Create Account"}
      </Button>

      <p className="auth-switch">
        {isLogin ? "New to Citizens Eye?" : "Already have an account?"}{" "}
        <button type="button" className="link" onClick={() => switchMode(isLogin ? "register" : "login")}>
          {isLogin ? "Create an account" : "Sign in"}
        </button>
      </p>

      {!isLogin && !compact && (
        <p className="fine-print">
          There is no email confirmation. Your email is never shown to other users.
        </p>
      )}
      {USE_MOCK && isLogin && (
        <p className="fine-print">
          Mock mode · <strong>demo@civiceye.dev</strong> / <strong>demo1234</strong>
        </p>
      )}
    </form>
  );
}
