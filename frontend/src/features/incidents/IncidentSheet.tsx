import { useNavigate, useParams } from "react-router";
import { useFocusOnMap } from "../map/useFocusOnMap";
import type { Incident, Task } from "../../api/types";
import { ButtonLink } from "../../components/Button";
import { Actions, DetailHeader, Meta, Note, Progress, Section } from "../../components/Detail";
import { Pill } from "../../components/Pill";
import { Sheet } from "../../components/Sheet";
import { ErrorState, LoadingState } from "../../components/States";
import { format, t } from "../../i18n";
import { timeAgo } from "../../utils/format";
import { useAuth } from "../auth/AuthProvider";
import { NearestHelp } from "../centers/NearestHelp";
import { URGENCY_COLOR } from "../map/meta";
import { useIncident, useIncidentReports, useIncidentVolunteers } from "./api";
import styles from "./IncidentSheet.module.css";

export function IncidentSheet() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: incident, isPending, error, refetch } = useIncident(id);
  useFocusOnMap(incident?.location, id);

  return (
    <Sheet label={incident?.title ?? t.app.loading} onClose={() => navigate("/")}>
      {isPending && <LoadingState />}
      {error && <ErrorState message={error.message} onRetry={() => void refetch()} />}
      {incident && <IncidentDetails incident={incident} />}
    </Sheet>
  );
}

function IncidentDetails({ incident }: { incident: Incident }) {
  const { isLoggedIn } = useAuth();
  const sources = incident.source_count;

  return (
    <>
      <DetailHeader
        pills={
          <>
            <Pill dotColor={URGENCY_COLOR[incident.urgency]}>{t.urgency[incident.urgency]}</Pill>
            <Pill>{t.needType[incident.need_type]}</Pill>
            {incident.is_verified && <Pill>✔ {t.incident.verified}</Pill>}
          </>
        }
        title={incident.title}
        meta={format(t.incident.reportedAgo, { ago: timeAgo(incident.last_report_at) })}
      />

      {incident.status !== "resolved" && (
        <Progress
          label={
            incident.helpers_signed_up >= incident.helpers_needed
              ? t.incident.allCovered
              : format(t.incident.peopleGoing, {
                  going: incident.helpers_signed_up,
                  needed: incident.helpers_needed,
                })
          }
          value={incident.helpers_signed_up}
          max={incident.helpers_needed}
        />
      )}

      <Actions>
        {incident.contact_phone ? (
          <ButtonLink variant="secondary" icon="phone" href={`tel:${incident.contact_phone}`}>
            {t.incident.contact}
          </ButtonLink>
        ) : (
          !isLoggedIn && <Meta>{t.incident.loginToSeeContact}</Meta>
        )}
      </Actions>

      <Section>
        {incident.summary && <p className={styles.summary}>{incident.summary}</p>}
        {incident.people_affected ? (
          <Meta>{format(t.incident.peopleAffected, { n: incident.people_affected })}</Meta>
        ) : null}
        {incident.location_text && <Meta>📍 {incident.location_text}</Meta>}
        <Meta>
          {sources === 1 ? t.incident.reportsOne : format(t.incident.reports, { people: sources })}
        </Meta>
      </Section>

      <Section title={t.incident.whatCanIDo}>
        <ul className={styles.tasks}>
          {incident.tasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </ul>
        <Note>{t.incident.joinSoon}</Note>
      </Section>

      <Volunteers incidentId={incident.id} />

      <Section title={t.incident.nearestHelp}>
        <NearestHelp point={incident.location} />
      </Section>

      <ReportHistory incidentId={incident.id} />
    </>
  );
}

function TaskRow({ task }: { task: Task }) {
  const done = task.status === "done";
  const status = done
    ? t.incident.done
    : task.spots_left > 0
      ? format(t.incident.spotsLeft, { n: task.spots_left })
      : t.incident.full;
  return (
    <li className={[styles.task, done && styles.taskDone].filter(Boolean).join(" ")}>
      <span className={styles.taskText}>
        <span className={styles.taskTitle}>{task.title}</span>
        <span className={styles.taskMeta}>
          {t.role[task.role]}, {status}
        </span>
      </span>
    </li>
  );
}

function Volunteers({ incidentId }: { incidentId: string }) {
  const { data: volunteers = [] } = useIncidentVolunteers(incidentId);
  return (
    <Section title={t.incident.whoIsGoing}>
      {volunteers.length === 0 ? (
        <Meta>{t.incident.nobodyYet}</Meta>
      ) : (
        <ul className={styles.people}>
          {volunteers.map((volunteer) => (
            <li key={volunteer.id} className={styles.person}>
              {volunteer.user.full_name}
              {volunteer.status === "completed" && " ✓"}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function ReportHistory({ incidentId }: { incidentId: string }) {
  const { data: reports = [] } = useIncidentReports(incidentId);
  if (reports.length === 0) return null;
  return (
    <Section title={t.incident.history}>
      <ol className={styles.history}>
        {reports.map((report) => (
          <li key={report.id} className={styles.historyItem}>
            <span>{report.summary ?? t.incident.notParsed}</span>
            <span className={styles.historyMeta}>
              {timeAgo(report.created_at)}, {t.urgency[report.urgency].toLowerCase()}
            </span>
          </li>
        ))}
      </ol>
    </Section>
  );
}
