import { useEffect, useState } from "react";
import { useAuth, useToast, type AuthMode } from "../state";
import { Logo, Sheet } from "../ui";
import AuthForm from "./AuthForm";

/**
 * Sign-in / create-account sheet shown over the current screen whenever a guest
 * tries a protected action. After success the pending action (`prompt.then`)
 * runs, so the user lands exactly where they intended — no redirect loops.
 */
export default function AuthSheetHost() {
  const { prompt, closeAuth } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState<AuthMode>("login");

  useEffect(() => {
    if (prompt) setMode(prompt.mode);
  }, [prompt]);

  return (
    <Sheet open={!!prompt} onClose={closeAuth} tall>
      <div className="auth-sheet">
        <div className="auth-head compact">
          <span className="auth-logo">
            <Logo size={34} />
          </span>
          <h2 key={mode} className="fade-up">
            {mode === "login" ? "Sign in to continue" : "Create your account"}
          </h2>
          <p>{prompt?.reason ?? "Reporting and volunteering need an account. Browsing is open to everyone."}</p>
        </div>
        <AuthForm
          key={mode}
          mode={mode}
          onModeChange={setMode}
          onSuccess={() => {
            const then = prompt?.then;
            closeAuth();
            toast(mode === "login" ? "Signed in" : "Account created. Welcome!", "success");
            then?.();
          }}
        />
      </div>
    </Sheet>
  );
}
