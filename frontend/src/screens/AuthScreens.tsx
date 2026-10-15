import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { markGuest } from "../lib/guest";
import { ASSETS } from "../lib/assets";
import { useAuth, useToast, type AuthMode } from "../state";
import AssetImage from "../components/AssetImage";
import Radar from "../components/Radar";
import { Button, Logo, TopBar } from "../ui";
import AuthForm from "../components/AuthForm";

interface FromState {
  from?: string;
}

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const EXIT_MS = 640;

/**
 * Welcome + sign-in. The radar, mascot and brand animate in while the form is
 * usable straight away. Only after authentication actually succeeds does the
 * screen play its exit (form and mascot sink, radar expands) and hand over to
 * the map. Already signed-in users skip it entirely.
 */
export function WelcomeScreen() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, ready } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [leaving, setLeaving] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // A restored session goes straight to the app, without the intro.
  useEffect(() => {
    if (ready && user) navigate("/map", { replace: true });
    // Only on the initial auth check: a fresh sign-in plays the exit instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Pause the decorative loops while the tab is hidden.
  useEffect(() => {
    const sync = () => rootRef.current?.classList.toggle("paused", document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const onSuccess = () => {
    toast(mode === "login" ? "Signed in" : "Account created. Welcome!", "success");
    if (reducedMotion()) {
      navigate("/map", { replace: true });
      return;
    }
    setLeaving(true);
    setTimeout(() => navigate("/map", { replace: true, state: { fromIntro: true } }), EXIT_MS);
  };

  const continueAsGuest = () => {
    markGuest();
    navigate("/map", { replace: true });
  };

  return (
    <div ref={rootRef} className={`screen intro ${leaving ? "leaving" : ""}`}>
      <div className="intro-stage">
        <Radar />
        <BangkokSkyline />
        {/* Large decorative mascot behind the sign-in card; never covers the logo or controls. */}
        <div className="mascot-layer" aria-hidden={false}>
          <span className="mascot-glow" />
          <span className="mascot-spark s1" />
          <span className="mascot-spark s2" />
          <span className="mascot-spark s3" />
          <div className="mascot-float">
            <AssetImage src={ASSETS.appCharacter} alt="Citizens Eye mascot" className="mascot" fallback={<MascotFallback />} />
          </div>
        </div>
        <div className="intro-brand">
          <AssetImage
            src={ASSETS.appIcon}
            alt="Citizens Eye logo"
            className="brand-icon"
            fallback={
              <span className="brand-icon brand-fallback" role="img" aria-label="Citizens Eye logo">
                <Logo size={24} />
              </span>
            }
          />
          <div>
            <h1>Citizens Eye</h1>
            <p className="intro-tagline">A safer community through shared awareness</p>
          </div>
        </div>
        <span className="intro-burst" aria-hidden />
      </div>

      <div className="intro-card">
        <Button block size="lg" className="guest-btn" disabled={leaving} onClick={continueAsGuest}>
          Continue as Guest <ArrowRight size={18} />
        </Button>
        <div className="or-divider">
          <span key={`div-${mode}`}>{mode === "login" ? "or sign in" : "or create an account"}</span>
        </div>
        <AuthForm key={`form-${mode}`} mode={mode} onModeChange={setMode} onSuccess={onSuccess} compact />
      </div>
    </div>
  );
}

/** Shown until public/assets/app_character.png is added. */
function MascotFallback() {
  return (
    <div className="mascot mascot-fallback" role="img" aria-label="Citizens Eye mascot (image missing)">
      <span className="mf-orb">
        <Logo size={64} />
      </span>
      {import.meta.env.DEV && <code>public/assets/app_character.png</code>}
    </div>
  );
}

function AuthPage({ mode }: { mode: AuthMode }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { from } = (useLocation().state ?? {}) as FromState;
  const isLogin = mode === "login";

  return (
    <div className="screen auth-screen">
      <TopBar backFallback="/welcome" title={isLogin ? "Sign In" : "Create Account"} />
      <div className="auth-body">
        <div className="auth-head">
          <span className="auth-avatar">
            <Logo size={40} />
          </span>
          <p>{isLogin ? "Welcome back. Sign in to report and volunteer." : "Join Citizens Eye and help build a safer community."}</p>
        </div>
        <AuthForm
          key={mode}
          mode={mode}
          // Swap screens without growing history, so Back always leaves auth.
          onModeChange={(m) => navigate(m === "login" ? "/login" : "/register", { replace: true, state: { from } })}
          onSuccess={() => {
            toast(isLogin ? "Signed in" : "Account created. Welcome!", "success");
            navigate(from && !["/login", "/register", "/welcome"].includes(from) ? from : "/map", { replace: true });
          }}
        />
      </div>
    </div>
  );
}

export const LoginScreen = () => <AuthPage mode="login" />;
export const RegisterScreen = () => <AuthPage mode="register" />;

/** Stylised Bangkok skyline: towers plus temple (prang) silhouettes. */
function BangkokSkyline() {
  return (
    <svg className="skyline" viewBox="0 0 400 140" preserveAspectRatio="xMidYMax slice" aria-hidden>
      <g className="sky-back">
        <path d="M0 140V96h22V70h16v26h12V52h10v44h14V78h18V40h8V22h4v18h8v56h16V66h22v30h12V34l7-14 7 14v62h14V74h20V50h12v46h10V82h16V44h6l3-12 3 12h6v52h18V70h24v26h12V58h16v38h14V76h20v64z" />
      </g>
      <g className="sky-front">
        <path d="M0 140v-22h30l6-14 6 14h20l8-30 4-8 4 8 8 30h18v-12h24v12h10l10-40 3-10 3 10 10 40h22v-16h30v16h16l5-12 5 12h26l9-34 3-14 3 14 9 34h20v-10h22v10h20l6-16 6 16h18v22z" />
      </g>
      <g className="sky-water">
        <rect x="0" y="132" width="400" height="8" />
      </g>
    </svg>
  );
}
