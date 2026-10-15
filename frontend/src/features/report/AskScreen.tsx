import { Link } from "react-router";
import { useMode } from "../../app/ModeContext";
import { Placeholder } from "../../components/Placeholder";
import { Screen } from "../../components/Screen";
import { t } from "../../i18n";
import styles from "./AskScreen.module.css";

/** "Ask for help" tab: choose what to create. */
export function AskScreen() {
  const { mode } = useMode();
  if (mode === "community") {
    return <Placeholder emoji="📝" title={t.mode.community} body={t.ask.communitySoon} />;
  }

  return (
    <Screen title={t.ask.chooseTitle}>
      <div className={styles.options}>
        <Link to="/ask/help" className={[styles.option, styles.primary].join(" ")}>
          <span className={styles.emoji} aria-hidden="true">
            🙋
          </span>
          <span className={styles.text}>
            <span className={styles.title}>{t.ask.needHelp}</span>
            <span className={styles.hint}>{t.ask.needHelpHint}</span>
          </span>
        </Link>
        <Link to="/ask/place" className={styles.option}>
          <span className={styles.emoji} aria-hidden="true">
            🏠
          </span>
          <span className={styles.text}>
            <span className={styles.title}>{t.ask.addPlace}</span>
            <span className={styles.hint}>{t.ask.addPlaceHint}</span>
          </span>
        </Link>
      </div>
    </Screen>
  );
}
