import { Link } from "react-router";
import { Button } from "../../components/Button";
import { Screen } from "../../components/Screen";
import { LoadingState } from "../../components/States";
import { format, t } from "../../i18n";
import { AuthForm } from "../auth/AuthForm";
import { useAuth } from "../auth/AuthProvider";
import { useMySignups } from "./api";
import styles from "./MeScreen.module.css";

export function MeScreen() {
  const { user, isLoggedIn, logout } = useAuth();

  if (!isLoggedIn) {
    return (
      <Screen lead={t.auth.why}>
        <AuthForm />
      </Screen>
    );
  }
  if (!user) return <LoadingState />;

  return (
    <Screen title={format(t.me.hello, { name: user.full_name })}>
      <div className={styles.card}>
        <p className={styles.meta}>{format(t.auth.loggedInAs, { email: user.email })}</p>
        {user.has_vehicle && <p className={styles.meta}>🚗 {t.auth.vehicleYes}</p>}
        <Button variant="secondary" onClick={logout}>
          {t.auth.logout}
        </Button>
      </div>
      <MyHelp userId={user.id} />
    </Screen>
  );
}

function MyHelp({ userId }: { userId: string }) {
  const { data: signups = [] } = useMySignups(userId);
  return (
    <section className={styles.section}>
      <h2>{t.me.myHelp}</h2>
      {signups.length === 0 ? (
        <p className={styles.meta}>{t.me.myHelpEmpty}</p>
      ) : (
        <ul className={styles.list}>
          {signups.map((signup) => (
            <li key={signup.id}>
              <Link to={`/incidents/${signup.incident.id}`} className={styles.item}>
                <span className={styles.itemTitle}>{signup.incident.title}</span>
                <span className={styles.meta}>
                  {signup.task.title}, {signup.status === "completed" ? t.me.statusCompleted : t.me.statusGoing}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
