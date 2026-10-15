import { useState } from "react";
import type { Incident, Task, Volunteer } from "../../api/types";
import { Button, ButtonLink } from "../../components/Button";
import { ConfirmButton } from "../../components/ConfirmButton";
import { Meta, Note } from "../../components/Detail";
import { FormError } from "../../components/Form";
import { format, t } from "../../i18n";
import { useAuth } from "../auth/AuthProvider";
import { useCancelSignup, useCompleteTask, useSignUp } from "../volunteers/api";
import { useIncidentVolunteers } from "./api";
import styles from "./IncidentSheet.module.css";

const MANAGER_ROLES = ["coordinator", "admin"];

/** "What you can do": tasks with I'm going / Cancel / Mark as done. */
export function TaskList({ incident }: { incident: Incident }) {
  const { user, isLoggedIn } = useAuth();
  const { data: volunteers = [] } = useIncidentVolunteers(incident.id);
  const signUp = useSignUp(incident.id);
  const cancel = useCancelSignup(incident.id);
  const complete = useCompleteTask(incident.id);
  const [feedback, setFeedback] = useState<string | null>(null);

  const mySignup: Volunteer | undefined = volunteers.find(
    (volunteer) => volunteer.user.id === user?.id && volunteer.status === "going",
  );
  const canManage = Boolean(user && (incident.owner_id === user.id || MANAGER_ROLES.includes(user.role)));
  const resolved = incident.status === "resolved";
  const busy = signUp.isPending || cancel.isPending || complete.isPending;
  const error = signUp.error ?? cancel.error ?? complete.error;

  const resetMessages = () => {
    setFeedback(null);
    signUp.reset();
    cancel.reset();
    complete.reset();
  };

  const actions = {
    join: (task: Task) => {
      resetMessages();
      signUp.mutate(task.id, { onSuccess: () => setFeedback(t.incident.joined) });
    },
    cancel: (signupId: string) => {
      resetMessages();
      cancel.mutate(signupId);
    },
    complete: (task: Task) => {
      resetMessages();
      complete.mutate(task.id, {
        onSuccess: (updated) =>
          setFeedback(updated.status === "resolved" ? t.incident.resolved : t.incident.taskDone),
      });
    },
  };

  return (
    <>
      {canManage && !resolved && <Meta>{t.incident.youAreOwner}</Meta>}
      <ul className={styles.tasks}>
        {incident.tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            mine={mySignup?.task.id === task.id ? mySignup : undefined}
            helpingElsewhere={Boolean(mySignup) && mySignup?.task.id !== task.id}
            canJoin={isLoggedIn && !resolved}
            canManage={canManage && !resolved}
            busy={busy}
            actions={actions}
          />
        ))}
      </ul>
      {mySignup && incident.tasks.length > 1 && <Meta>{t.incident.alreadyHelpingHere}</Meta>}
      {!isLoggedIn && !resolved && (
        <ButtonLink to="/me" variant="secondary" icon="user">
          {t.incident.loginToHelp}
        </ButtonLink>
      )}
      {feedback && <Note>{feedback}</Note>}
      <FormError message={error?.message} />
    </>
  );
}

interface TaskRowProps {
  task: Task;
  mine?: Volunteer;
  helpingElsewhere: boolean;
  canJoin: boolean;
  canManage: boolean;
  busy: boolean;
  actions: {
    join: (task: Task) => void;
    cancel: (signupId: string) => void;
    complete: (task: Task) => void;
  };
}

function TaskRow({ task, mine, helpingElsewhere, canJoin, canManage, busy, actions }: TaskRowProps) {
  const done = task.status === "done";
  const status = done
    ? t.incident.done
    : task.spots_left > 0
      ? format(t.incident.spotsLeft, { n: task.spots_left })
      : t.incident.full;
  const showJoin = canJoin && !done && !mine && !helpingElsewhere && task.spots_left > 0;
  const showComplete = !done && (Boolean(mine) || canManage);

  return (
    <li className={[styles.task, done && styles.taskDone, mine && styles.taskMine].filter(Boolean).join(" ")}>
      <span className={styles.taskText}>
        <span className={styles.taskTitle}>
          {done && "✓ "}
          {task.title}
        </span>
        <span className={styles.taskMeta}>
          {t.role[task.role]}, {status}
        </span>
        {mine && <span className={styles.badge}>{t.incident.youreGoing}</span>}
      </span>
      {(showJoin || showComplete || mine) && (
        <span className={styles.taskActions}>
          {showJoin && (
            <Button disabled={busy} onClick={() => actions.join(task)}>
              {t.incident.imGoing}
            </Button>
          )}
          {showComplete && (
            <ConfirmButton
              variant={mine ? "primary" : "secondary"}
              icon="check"
              disabled={busy}
              confirmLabel={t.incident.confirmDone}
              onConfirm={() => actions.complete(task)}
            >
              {t.incident.markDone}
            </ConfirmButton>
          )}
          {mine && (
            <Button variant="ghost" disabled={busy} onClick={() => actions.cancel(mine.id)}>
              {t.incident.cancelGoing}
            </Button>
          )}
        </span>
      )}
    </li>
  );
}
