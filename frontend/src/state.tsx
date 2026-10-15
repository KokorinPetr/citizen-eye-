import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError, getToken, onUnauthorized, setToken } from "./lib/api";
import type { Incident, User } from "./lib/types";
import { BANGKOK, type LatLng } from "./lib/geo";

/* ---------------- Auth ---------------- */

export type AuthMode = "login" | "register";

/** A pending sign-in request: the sheet is open, and `then` runs after success. */
export interface AuthPrompt {
  mode: AuthMode;
  reason?: string;
  then?: () => void;
}

interface AuthState {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /**
   * If signed in, runs `then` right away and returns true. Otherwise opens the
   * sign-in sheet and runs `then` after a successful sign-in, so the user
   * continues exactly where they were.
   */
  requireAuth: (reason?: string, then?: () => void) => boolean;
  prompt: AuthPrompt | null;
  openAuth: (p: AuthPrompt) => void;
  closeAuth: () => void;
}

const AuthCtx = createContext<AuthState>(null!);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!getToken());
  const [prompt, setPrompt] = useState<AuthPrompt | null>(null);

  useEffect(() => {
    onUnauthorized(() => {
      setUser(null);
      setPrompt({ mode: "login", reason: "Your session expired. Please sign in again." });
    });
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    api
      .me()
      .then(setUser)
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const t = await api.login(email, password);
    setToken(t.access_token);
    setUser(await api.me());
  }, []);

  const register = useCallback(
    async (email: string, password: string) => {
      await api.register(email, password);
      await login(email, password);
    },
    [login],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const requireAuth = useCallback(
    (reason?: string, then?: () => void) => {
      if (user) {
        then?.();
        return true;
      }
      setPrompt({ mode: "login", reason, then });
      return false;
    },
    [user],
  );

  const openAuth = useCallback((p: AuthPrompt) => setPrompt(p), []);
  const closeAuth = useCallback(() => setPrompt(null), []);

  const value = useMemo(
    () => ({ user, ready, login, register, logout, requireAuth, prompt, openAuth, closeAuth }),
    [user, ready, login, register, logout, requireAuth, prompt, openAuth, closeAuth],
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

/* ---------------- Incidents (polled) ---------------- */

interface IncidentsState {
  incidents: Incident[];
  loaded: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  upsert: (i: Incident) => void;
  remove: (id: number) => void;
}

const IncidentsCtx = createContext<IncidentsState>(null!);
export const useIncidents = () => useContext(IncidentsCtx);

const POLL_MS = 3000;

export function IncidentsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      setIncidents(await api.listIncidents());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load incidents");
    } finally {
      inFlight.current = false;
      setLoaded(true);
    }
  }, []);

  // Poll every 3 s while the tab is visible; refetch when the viewer changes
  // so viewer_is_volunteering is correct.
  useEffect(() => {
    let timer: number | undefined;
    const tick = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const start = () => {
      clearInterval(timer);
      tick();
      timer = window.setInterval(tick, POLL_MS);
    };
    const onVis = () => (document.visibilityState === "visible" ? start() : clearInterval(timer));
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh, user?.id]);

  const upsert = useCallback((i: Incident) => {
    setIncidents((list) => {
      const idx = list.findIndex((x) => x.id === i.id);
      if (idx === -1) return [i, ...list];
      const copy = list.slice();
      copy[idx] = i;
      return copy;
    });
  }, []);
  const remove = useCallback((id: number) => setIncidents((l) => l.filter((x) => x.id !== id)), []);

  const value = useMemo(
    () => ({ incidents, loaded, error, refresh, upsert, remove }),
    [incidents, loaded, error, refresh, upsert, remove],
  );
  return <IncidentsCtx.Provider value={value}>{children}</IncidentsCtx.Provider>;
}

/* ---------------- Geolocation ---------------- */

interface GeoState {
  pos: LatLng | null;
  /** Best known point: the user's position, else central Bangkok. */
  origin: LatLng;
  locate: () => Promise<LatLng | null>;
}

const GeoCtx = createContext<GeoState>(null!);
export const useGeo = () => useContext(GeoCtx);

export function GeoProvider({ children }: { children: ReactNode }) {
  const [pos, setPos] = useState<LatLng | null>(null);

  const locate = useCallback(
    () =>
      new Promise<LatLng | null>((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
          (p) => {
            const v = { lat: p.coords.latitude, lng: p.coords.longitude };
            setPos(v);
            resolve(v);
          },
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
        );
      }),
    [],
  );

  useEffect(() => {
    locate();
  }, [locate]);

  const value = useMemo(() => ({ pos, origin: pos ?? BANGKOK, locate }), [pos, locate]);
  return <GeoCtx.Provider value={value}>{children}</GeoCtx.Provider>;
}

/* ---------------- Connection ---------------- */

export type ServerState = "unknown" | "checking" | "ok" | "down";

interface ConnectionState {
  /** Browser connectivity (navigator.onLine + online/offline events). */
  online: boolean;
  server: ServerState;
  /** GET /health. Runs once on load, when the device comes back online, and on Retry; never on a timer. */
  check: () => Promise<void>;
}

const ConnCtx = createContext<ConnectionState>(null!);
export const useConnection = () => useContext(ConnCtx);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [server, setServer] = useState<ServerState>("unknown");
  const inFlight = useRef<Promise<void> | null>(null);

  const check = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    setServer("checking");
    const p = api
      .health()
      .then(() => setServer("ok"))
      .catch(() => setServer("down"))
      .finally(() => {
        inFlight.current = null;
      });
    inFlight.current = p;
    return p;
  }, []);

  useEffect(() => {
    check();
    const on = () => {
      setOnline(true);
      check();
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [check]);

  const value = useMemo(() => ({ online, server, check }), [online, server, check]);
  return <ConnCtx.Provider value={value}>{children}</ConnCtx.Provider>;
}

/* ---------------- Toasts ---------------- */

export type ToastKind = "success" | "error" | "info";
interface ToastMsg {
  id: number;
  text: string;
  kind: ToastKind;
}

const ToastCtx = createContext<(msg: string, kind?: ToastKind) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
const ToastStateCtx = createContext<ToastMsg | null>(null);
export const useToastState = () => useContext(ToastStateCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const timer = useRef<number>();
  const show = useCallback((text: string, kind: ToastKind = "info") => {
    setMsg({ id: Date.now(), text, kind });
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      <ToastStateCtx.Provider value={msg}>{children}</ToastStateCtx.Provider>
    </ToastCtx.Provider>
  );
}

/* ---------------- Alerts read marker ---------------- */

const SEEN_KEY = "ce_alerts_seen";
export function getAlertsSeen() {
  try {
    return localStorage.getItem(SEEN_KEY) ?? new Date(0).toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}
export function setAlertsSeen(iso: string) {
  try {
    localStorage.setItem(SEEN_KEY, iso);
  } catch {
    /* ignore */
  }
}
