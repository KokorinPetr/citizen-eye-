import { HashRouter, Navigate, NavigationType, Route, Routes, useLocation, useNavigationType, type Location } from "react-router-dom";
import { useEffect, useState } from "react";
import { AuthProvider, ConnectionProvider, GeoProvider, IncidentsProvider, ToastProvider, useAuth } from "./state";
import { BottomNav, ToastHost } from "./ui";
import { isGuest } from "./lib/guest";
import { ServerStatus } from "./components/ServerStatus";
import AuthSheetHost from "./components/AuthSheetHost";
import MapScreen from "./screens/MapScreen";
import IncidentScreen from "./screens/IncidentScreen";
import ReportScreen from "./screens/ReportScreen";
import AlertsScreen from "./screens/AlertsScreen";
import HelpScreen from "./screens/HelpScreen";
import FeedScreen from "./screens/FeedScreen";
import CentersScreen from "./screens/CentersScreen";
import ProfileScreen, { AboutScreen } from "./screens/ProfileScreen";
import { LoginScreen, RegisterScreen, WelcomeScreen } from "./screens/AuthScreens";

const NAV_ROUTES = ["/map", "/alerts", "/feed", "/help", "/profile"];

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * iOS-like transition between two paths: tabs slide toward the tab you picked,
 * pushes slide in from the right, back slides the other way, and the report
 * flow rises from the bottom and sinks back down.
 */
function pickAnim(from: string, to: string, navType: NavigationType, state: unknown) {
  const st = state as { back?: boolean; fromIntro?: boolean } | null;
  // After a successful sign-in on the welcome screen, which already played its own exit.
  if (st?.fromIntro) return "intro";
  const back = navType === NavigationType.Pop || st?.back === true;
  const fromTab = NAV_ROUTES.indexOf(from);
  const toTab = NAV_ROUTES.indexOf(to);
  if (fromTab !== -1 && toTab !== -1) return toTab > fromTab ? "tab-fwd" : "tab-back";
  if (to === "/report" && !back) return "rise";
  if (from === "/report") return "sink";
  return back ? "pop" : "push";
}

const TRANSITION_MS = 360;

/**
 * Keeps the outgoing page mounted for one transition so it can animate out
 * while the incoming page animates in. Pages are keyed by pathname, so the
 * outgoing screen keeps its state (no remount, no refetch flash).
 */
function usePageTransition(location: Location) {
  const navType = useNavigationType();
  const [st, setSt] = useState({ cur: location, prev: null as Location | null, anim: "fade", n: 0 });

  if (location !== st.cur) {
    if (location.pathname === st.cur.pathname) setSt({ ...st, cur: location });
    else
      setSt({
        cur: location,
        prev: prefersReducedMotion() ? null : st.cur,
        anim: pickAnim(st.cur.pathname, location.pathname, navType, location.state),
        n: st.n + 1,
      });
  }

  useEffect(() => {
    if (!st.prev) return;
    const n = st.n;
    const t = setTimeout(() => setSt((s) => (s.n === n ? { ...s, prev: null } : s)), TRANSITION_MS);
    return () => clearTimeout(t);
  }, [st.n, st.prev]);

  return st;
}

function AppRoutes({ location }: { location: Location }) {
  const { user, ready } = useAuth();
  return (
    <Routes location={location}>
      <Route path="/" element={!ready ? null : <Navigate to={user || isGuest() ? "/map" : "/welcome"} replace />} />
      <Route path="/welcome" element={<WelcomeScreen />} />
      <Route path="/login" element={<LoginScreen />} />
      <Route path="/register" element={<RegisterScreen />} />
      <Route path="/map" element={<MapScreen />} />
      <Route path="/incident/:id" element={<IncidentScreen />} />
      <Route path="/report" element={<ReportScreen />} />
      <Route path="/alerts" element={<AlertsScreen />} />
      <Route path="/feed" element={<FeedScreen />} />
      <Route path="/help" element={<HelpScreen />} />
      <Route path="/centers" element={<CentersScreen />} />
      <Route path="/profile" element={<ProfileScreen />} />
      <Route path="/about" element={<AboutScreen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function Shell() {
  const location = useLocation();
  const showNav = NAV_ROUTES.includes(location.pathname);
  const { cur, prev, anim, n } = usePageTransition(location);
  // Only the first page fades in; afterwards the class is dropped once settled
  // so the incoming page's animation never replays.
  const enterAnim = prev ? anim : n === 0 ? "fade" : "";

  const pages = [
    prev && (
      <div className={`page exit ${anim}`} key={prev.pathname} aria-hidden="true">
        <AppRoutes location={prev} />
      </div>
    ),
    <div className={`page enter ${enterAnim}`} key={cur.pathname}>
      <AppRoutes location={cur} />
    </div>,
  ];

  return (
    <div className={`app ${showNav ? "with-nav" : ""} ${prev ? "is-transitioning" : ""}`}>
      {pages}
      {showNav && <BottomNav intro={(cur.state as { fromIntro?: boolean } | null)?.fromIntro === true} />}
      <ServerStatus visible={showNav} pathname={location.pathname} />
      <div id="overlay-root" className="overlay-root" />
      <AuthSheetHost />
      <ToastHost />
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <AuthProvider>
          <GeoProvider>
            <ConnectionProvider>
              <IncidentsProvider>
                <Shell />
              </IncidentsProvider>
            </ConnectionProvider>
          </GeoProvider>
        </AuthProvider>
      </ToastProvider>
    </HashRouter>
  );
}
