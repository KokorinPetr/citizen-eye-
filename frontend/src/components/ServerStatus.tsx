import { useEffect, useRef, useState } from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import { useConnection, useIncidents } from "../state";
import { SignalLoader } from "../ui";

const SLOW_MS = 900;
const WAKING_MS = 6000;
// Screens whose content depends on the incident list.
const INCIDENT_SCREENS = ["/map", "/alerts", "/help"];

/**
 * Connection status for the main tabs, shown just above the tab bar so it never
 * covers a logo, title or form. Nothing appears on the welcome/sign-in screens.
 * There, a failed sign-in shows its own error in the form.
 *
 * It reflects real work only: the one-off GET /health check and the existing
 * incident polling. It never makes extra requests to keep itself animated.
 */
export function ServerStatus({ visible, pathname }: { visible: boolean; pathname: string }) {
  const { online, server, check } = useConnection();
  const { loaded, error, refresh } = useIncidents();
  const [slow, setSlow] = useState(false);
  const [waking, setWaking] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Only mention "connecting" if the check takes noticeably long.
  useEffect(() => {
    if (server !== "checking") {
      setSlow(false);
      setWaking(false);
      return;
    }
    const a = setTimeout(() => setSlow(true), SLOW_MS);
    const b = setTimeout(() => setWaking(true), WAKING_MS);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [server]);

  const needsIncidents = INCIDENT_SCREENS.includes(pathname);
  let state: "offline" | "error" | "connecting" | "loading" | null = null;
  if (!online) state = "offline";
  else if (retrying) state = null; // the Retry button shows progress itself
  // An active check outranks a stale error from before (e.g. just back online).
  else if (server === "checking" && slow) state = "connecting";
  else if (server === "down" || (needsIncidents && error)) state = "error";
  else if (needsIncidents && !loaded) state = "loading";

  const show = visible && (state !== null || retrying);

  // Lets other UI (e.g. the map preview card) make room for the pill.
  useEffect(() => {
    const app = ref.current?.parentElement;
    app?.classList.toggle("has-conn-status", show);
    return () => app?.classList.remove("has-conn-status");
  });

  const retry = async () => {
    setRetrying(true);
    try {
      await Promise.all([check(), refresh()]);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div ref={ref} className="conn-anchor">
      {show && (
        <div className={`conn-pill ${state ?? "retrying"}`} key={state ?? "retrying"}>
          {state === "offline" && (
            <>
              <WifiOff size={16} />
              <span className="grow">You're offline. Showing the last data loaded.</span>
            </>
          )}
          {(state === "error" || retrying) && (
            <>
              <span className="conn-dot" aria-hidden />
              <span className="grow" role="alert">
                {retrying ? "Retrying…" : "Can't reach the server"}
              </span>
              <button className="conn-retry" onClick={retry} disabled={retrying} aria-label="Retry connection">
                <RefreshCw size={14} className={retrying ? "spin" : ""} /> Retry
              </button>
            </>
          )}
          {state === "connecting" && (
            <SignalLoader inline label={waking ? "Waking up the server. This can take up to a minute…" : "Connecting to server…"} />
          )}
          {state === "loading" && <SignalLoader inline label="Loading incidents…" />}
        </div>
      )}
    </div>
  );
}
