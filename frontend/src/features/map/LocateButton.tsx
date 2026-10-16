import { useEffect } from "react";
import { Icon } from "../../components/Icon";
import { isLocationAllowed, useGeolocation, type Position } from "../../hooks/useGeolocation";
import { t } from "../../i18n";
import styles from "./LocateButton.module.css";
import { useMapView } from "./MapViewContext";

const LOCATE_ZOOM = 15;
/** Zoomed out this far = the person hasn't picked an area yet, so moving to them is welcome. */
const OVERVIEW_ZOOM = 7;

/**
 * "Where am I?": shows the blue dot and flies there. If location was allowed before, it finds the
 * person on its own when the map opens (no pop-up); otherwise it waits for a tap.
 */
export function LocateButton() {
  const { view, focusOn, myLocation, setMyLocation } = useMapView();
  const { locate, locating, error } = useGeolocation();

  const flyTo = (position: Position) => focusOn(position.lat, position.lng, { besideSheet: false, zoom: LOCATE_ZOOM });

  useEffect(() => {
    if (myLocation) return;
    let cancelled = false;
    void isLocationAllowed().then((allowed) => {
      if (!allowed || cancelled) return;
      locate((position) => {
        setMyLocation(position);
        if (view.zoom <= OVERVIEW_ZOOM) flyTo(position);
      });
    });
    return () => {
      cancelled = true;
    };
    // Only when the map opens; later the button does it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.wrap}>
      {error && (
        <p className={styles.error} role="status">
          {t.map.locationError}
        </p>
      )}
      <button
        type="button"
        className={[styles.button, locating && styles.locating].filter(Boolean).join(" ")}
        aria-label={t.map.locateMe}
        title={t.map.locateMe}
        disabled={locating}
        onClick={() =>
          locate((position) => {
            setMyLocation(position);
            flyTo(position);
          })
        }
      >
        <Icon name="locate" size={24} />
      </button>
    </div>
  );
}
