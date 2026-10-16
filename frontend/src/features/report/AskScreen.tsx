import { Link } from "react-router";
import { useMode, type AppMode } from "../../app/ModeContext";
import { Screen } from "../../components/Screen";
import { t } from "../../i18n";
import styles from "./AskScreen.module.css";

interface AskOption {
  to: string;
  emoji: string;
  title: string;
  hint: string;
}

interface AskGroup {
  mode: AppMode;
  emoji: string;
  title: string;
  hint: string;
  options: AskOption[];
}

const GROUPS: AskGroup[] = [
  {
    mode: "emergency",
    emoji: "🆘",
    title: t.mode.emergency,
    hint: t.ask.emergencyGroupHint,
    options: [
      { to: "/ask/help", emoji: "🙋", title: t.ask.needHelp, hint: t.ask.needHelpHint },
      { to: "/ask/place", emoji: "🏠", title: t.ask.addPlace, hint: t.ask.addPlaceHint },
    ],
  },
  {
    mode: "community",
    emoji: "🏘",
    title: t.mode.community,
    hint: t.ask.communityGroupHint,
    options: [
      { to: "/ask/post?kind=lost", emoji: "🐾", title: t.ask.lostFound, hint: t.ask.lostFoundHint },
      { to: "/ask/post?kind=help_wanted", emoji: "🙋", title: t.ask.helpWanted, hint: t.ask.helpWantedHint },
      { to: "/ask/post?kind=help_offered", emoji: "🤝", title: t.ask.helpOffered, hint: t.ask.helpOfferedHint },
    ],
  },
];

/**
 * "Ask for help" tab: everything you can add, in both modes, current mode first.
 * Choosing an option switches the map to its mode, so the new item is visible afterwards.
 */
export function AskScreen() {
  const { mode, setMode } = useMode();
  const groups = [...GROUPS].sort((a, b) => Number(b.mode === mode) - Number(a.mode === mode));

  return (
    <Screen title={t.ask.chooseTitle}>
      {groups.map((group) => (
        <section key={group.mode} className={styles.group}>
          <header className={styles.groupHeader}>
            <h2 className={styles.groupTitle}>
              <span aria-hidden="true">{group.emoji}</span> {group.title}
            </h2>
            <p className={styles.hint}>{group.hint}</p>
          </header>
          <div className={styles.options}>
            {group.options.map((option, index) => (
              <Link
                key={option.to}
                to={option.to}
                onClick={() => setMode(group.mode)}
                className={[
                  styles.option,
                  group.mode === "community" && styles.community,
                  group.mode === mode && index === 0 && styles.primary,
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className={styles.emoji} aria-hidden="true">
                  {option.emoji}
                </span>
                <span className={styles.text}>
                  <span className={styles.title}>{option.title}</span>
                  <span className={styles.hint}>{option.hint}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </Screen>
  );
}
