import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useMode } from "../../app/ModeContext";
import { Icon } from "../../components/Icon";
import { format, t } from "../../i18n";
import { loadJson, saveJson } from "../../utils/storage";
import { useMapView } from "../map/MapViewContext";
import { useAreaAlert } from "./api";
import styles from "./AlertBanner.module.css";

const SNOOZE_MINUTES = 30;
const SNOOZE_KEY = "civic_eye_alerts_snoozed_until";

/**
 * In Community mode: red banner when something urgent is near the map centre.
 * ✕ snoozes all alerts for SNOOZE_MINUTES (wherever the map moves, also after reload).
 */
export function AlertBanner() {
  const { mode, setMode } = useMode();
  const { view } = useMapView();
  const navigate = useNavigate();
  const [snoozedUntil, setSnoozedUntil] = useState<number>(() => loadJson(SNOOZE_KEY, 0));
  const [now, setNow] = useState(() => Date.now());
  const snoozed = now < snoozedUntil;
  const { data: alert } = useAreaAlert(view.center, mode === "community" && !snoozed);

  // Wake up when the snooze ends, so the banner can come back without a reload.
  useEffect(() => {
    if (!snoozed) return;
    const timer = window.setTimeout(() => setNow(Date.now()), snoozedUntil - Date.now() + 100);
    return () => window.clearTimeout(timer);
  }, [snoozed, snoozedUntil]);

  if (mode !== "community" || snoozed || !alert?.active || !alert.message) return null;
  const closest = alert.incidents[0];

  const snooze = () => {
    const until = Date.now() + SNOOZE_MINUTES * 60_000;
    setSnoozedUntil(until);
    setNow(Date.now());
    saveJson(SNOOZE_KEY, until);
  };

  return (
    <div className={styles.banner} role="alert">
      <button
        type="button"
        className={styles.main}
        onClick={() => {
          setMode("emergency");
          navigate(closest ? `/incidents/${closest.id}` : "/");
        }}
      >
        <Icon name="alert" />
        <span className={styles.text}>{alert.message}</span>
        <span className={styles.action}>{t.alert.open}</span>
      </button>
      <button
        type="button"
        className={styles.close}
        aria-label={format(t.alert.dismiss, { minutes: SNOOZE_MINUTES })}
        title={format(t.alert.dismiss, { minutes: SNOOZE_MINUTES })}
        onClick={snooze}
      >
        <Icon name="close" size={20} />
      </button>
    </div>
  );
}
