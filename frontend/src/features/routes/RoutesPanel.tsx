import { useEffect, useState } from "react";
import type { CenterWithRoute, GeoPoint } from "../../api/types";
import { Button, ButtonLink } from "../../components/Button";
import { Meta, Note } from "../../components/Detail";
import { FormError } from "../../components/Form";
import { LoadingState } from "../../components/States";
import { format, t } from "../../i18n";
import { formatDistance } from "../../utils/format";
import { CENTER_EMOJI } from "../map/meta";
import { useRoutesToNearest } from "./api";
import { useRoutes } from "./RoutesContext";
import styles from "./RoutesPanel.module.css";

/** Google Maps directions on the phone (turn-by-turn navigation we don't build ourselves). */
function navigationUrl(from: GeoPoint, to: GeoPoint): string {
  const params = new URLSearchParams({
    api: "1",
    origin: `${from.lat},${from.lng}`,
    destination: `${to.lat},${to.lng}`,
    travelmode: "driving",
  });
  return `https://www.google.com/maps/dir/?${params}`;
}

/** "Show routes" from a point (incident) to the nearest shelters / supply points / hospitals. */
export function RoutesPanel({ from }: { from: GeoPoint }) {
  const [requested, setRequested] = useState(false);
  const { data, isFetching, error } = useRoutesToNearest(from, requested);
  const { routes, selected, show, select, clear } = useRoutes();

  // Draw on the map when they arrive; remove when this panel closes (sheet closed / other incident).
  useEffect(() => {
    if (requested && data) show(data.routes);
  }, [requested, data, show]);
  useEffect(() => clear, [clear]);

  if (!requested) {
    return (
      <Button variant="secondary" icon="route" onClick={() => setRequested(true)}>
        {t.routes.show}
      </Button>
    );
  }

  return (
    <>
      {isFetching && !data && <LoadingState label={t.routes.loading} />}
      <FormError message={error?.message} />
      {data && data.routes.length === 0 && <Meta>{t.routes.none}</Meta>}
      {routes.length > 0 && (
        <>
          <Note>{data?.warning}</Note>
          <ul className={styles.list}>
            {routes.map((item, index) => (
              <RouteItem
                key={item.center.id}
                item={item}
                from={from}
                selected={index === selected}
                onSelect={() => select(index)}
              />
            ))}
          </ul>
        </>
      )}
      <Button
        variant="ghost"
        onClick={() => {
          setRequested(false);
          clear();
        }}
      >
        {t.routes.hide}
      </Button>
    </>
  );
}

interface RouteItemProps {
  item: CenterWithRoute;
  from: GeoPoint;
  selected: boolean;
  onSelect: () => void;
}

function RouteItem({ item, from, selected, onSelect }: RouteItemProps) {
  const { center, route } = item;
  const distance = formatDistance(route.distance_m);
  const description =
    route.kind === "road" && route.duration_s !== null
      ? format(t.routes.byRoad, { distance, minutes: Math.max(1, Math.round(route.duration_s / 60)) })
      : format(t.routes.straight, { distance });

  return (
    <li className={[styles.route, selected && styles.selected].filter(Boolean).join(" ")}>
      <button type="button" className={styles.head} onClick={onSelect} aria-pressed={selected}>
        <span className={styles.emoji} aria-hidden="true">
          {CENTER_EMOJI[center.center_type]}
        </span>
        <span className={styles.text}>
          <span className={styles.name}>{center.name}</span>
          <span className={styles.meta}>
            {t.center.type[center.center_type]}, {description}
          </span>
        </span>
      </button>
      <span className={styles.actions}>
        <ButtonLink variant="primary" icon="route" href={navigationUrl(from, center.location)} external>
          {t.routes.navigate}
        </ButtonLink>
        {center.phone && (
          <ButtonLink variant="secondary" icon="phone" href={`tel:${center.phone}`}>
            {t.center.call}
          </ButtonLink>
        )}
      </span>
    </li>
  );
}
