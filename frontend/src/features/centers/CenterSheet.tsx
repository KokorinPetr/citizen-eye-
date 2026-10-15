import { useNavigate, useParams } from "react-router";
import { useFocusOnMap } from "../map/useFocusOnMap";
import type { Center } from "../../api/types";
import { ButtonLink } from "../../components/Button";
import { Actions, DetailHeader, Meta, Section } from "../../components/Detail";
import { Pill } from "../../components/Pill";
import { Sheet } from "../../components/Sheet";
import { ErrorState, LoadingState } from "../../components/States";
import { format, t } from "../../i18n";
import { CENTER_EMOJI } from "../map/meta";
import { useCenter } from "./api";
import styles from "./CenterSheet.module.css";

export function CenterSheet() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: center, isPending, error, refetch } = useCenter(id);
  useFocusOnMap(center?.location, id);

  return (
    <Sheet label={center?.name ?? t.app.loading} onClose={() => navigate("/")}>
      {isPending && <LoadingState />}
      {error && <ErrorState message={error.message} onRetry={() => void refetch()} />}
      {center && <CenterDetails center={center} />}
    </Sheet>
  );
}

function CenterDetails({ center }: { center: Center }) {
  return (
    <>
      <DetailHeader
        pills={
          <>
            <Pill>
              {CENTER_EMOJI[center.center_type]} {t.center.type[center.center_type]}
            </Pill>
            <Pill>{t.center.status[center.status]}</Pill>
          </>
        }
        title={center.name}
        meta={center.is_official ? t.center.official : t.center.community}
      />

      {center.phone && (
        <Actions>
          <ButtonLink icon="phone" href={`tel:${center.phone}`}>
            {t.center.call} {center.phone}
          </ButtonLink>
        </Actions>
      )}

      <Section>
        {center.description && <p className={styles.description}>{center.description}</p>}
        {center.address && <Meta>📍 {center.address}</Meta>}
        {center.capacity ? <Meta>{format(t.center.capacity, { n: center.capacity })}</Meta> : null}
      </Section>

      {center.supplies.length > 0 && (
        <Section title={t.center.offers}>
          <div className={styles.supplies}>
            {center.supplies.map((supply) => (
              <Pill key={supply}>{t.needType[supply]}</Pill>
            ))}
          </div>
        </Section>
      )}

      {center.source_url && (
        <Section>
          <Meta>
            {t.center.source}:{" "}
            <a href={center.source_url} target="_blank" rel="noreferrer">
              OpenStreetMap
            </a>
          </Meta>
        </Section>
      )}
    </>
  );
}
