import { Link } from "react-router";
import type { CenterNearby, GeoPoint } from "../../api/types";
import { Icon } from "../../components/Icon";
import { format, t } from "../../i18n";
import { formatDistance } from "../../utils/format";
import { CENTER_EMOJI } from "../map/meta";
import { useNearestCenter } from "./api";
import styles from "./NearestHelp.module.css";

/** Closest hospital and shelter for a point, with distance and a call button. */
export function NearestHelp({ point }: { point: GeoPoint }) {
  const { data: hospital } = useNearestCenter(point, ["hospital"]);
  const { data: shelter } = useNearestCenter(point, ["shelter", "supply_point"]);
  const places = [hospital, shelter].filter((place): place is CenterNearby => Boolean(place));
  if (!places.length) return null;

  return (
    <ul className={styles.list}>
      {places.map((place) => (
        <li key={place.id} className={styles.item}>
          <span className={styles.emoji} aria-hidden="true">
            {CENTER_EMOJI[place.center_type]}
          </span>
          <span className={styles.text}>
            <Link to={`/places/${place.id}`} className={styles.name}>
              {place.name}
            </Link>
            <span className={styles.distance}>
              {t.center.type[place.center_type]}, {format(t.common.away, { distance: formatDistance(place.distance_m) })}
            </span>
          </span>
          {place.phone && (
            <a className={styles.call} href={`tel:${place.phone}`} aria-label={`${t.center.call} ${place.name}`}>
              <Icon name="phone" />
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
