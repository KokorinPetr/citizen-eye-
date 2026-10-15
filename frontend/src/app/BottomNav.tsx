import { NavLink } from "react-router";
import { Icon, type IconName } from "../components/Icon";
import { t } from "../i18n";
import styles from "./BottomNav.module.css";
import { useMode } from "./ModeContext";

const ITEMS: { to: string; label: string; icon: IconName }[] = [
  { to: "/", label: t.nav.map, icon: "map" },
  { to: "/list", label: t.nav.list, icon: "list" },
];

/** Main navigation: bottom bar on phones, top bar on desktop. Every screen is one tap away. */
export function BottomNav() {
  const { mode } = useMode();
  const linkProps = (to: string) => ({ to, end: to === "/" });

  return (
    <nav className={[styles.nav, mode === "community" && styles.community].filter(Boolean).join(" ")}>
      {ITEMS.map((item) => (
        <NavLink key={item.to} {...linkProps(item.to)} className={styles.item}>
          <Icon name={item.icon} size={24} />
          {item.label}
        </NavLink>
      ))}
      <NavLink {...linkProps("/ask")} className={styles.ask}>
        <span className={styles.askCircle}>
          <Icon name="plus" size={26} />
        </span>
        {t.nav.ask}
      </NavLink>
      <NavLink {...linkProps("/me")} className={styles.item}>
        <Icon name="user" size={24} />
        {t.nav.me}
      </NavLink>
    </nav>
  );
}
