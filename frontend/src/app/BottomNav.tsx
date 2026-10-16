import { NavLink, useLocation } from "react-router";
import { Icon, type IconName } from "../components/Icon";
import { t } from "../i18n";
import styles from "./BottomNav.module.css";
import { useMode } from "./ModeContext";

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
}

const BEFORE_ASK: NavItem[] = [
  { to: "/", label: t.nav.map, icon: "map" },
  { to: "/list", label: t.nav.list, icon: "list" },
];
const AFTER_ASK: NavItem[] = [
  { to: "/feed", label: t.nav.feed, icon: "chat" },
  { to: "/me", label: t.nav.me, icon: "user" },
];

/** The big + does what fits the screen: on the Feed it writes a post, elsewhere it asks for help. */
function useMainAction(): { to: string; label: string } {
  const { pathname } = useLocation();
  return pathname.startsWith("/feed") ? { to: "/feed/new", label: t.nav.createPost } : { to: "/ask", label: t.nav.ask };
}

/** Main navigation: bottom bar on phones, top bar on desktop. Every screen is one tap away. */
export function BottomNav() {
  const { mode } = useMode();
  const mainAction = useMainAction();
  const linkProps = (to: string) => ({ to, end: to === "/" });

  return (
    <nav className={[styles.nav, mode === "community" && styles.community].filter(Boolean).join(" ")}>
      {BEFORE_ASK.map((item) => (
        <NavLink key={item.to} {...linkProps(item.to)} className={styles.item}>
          <Icon name={item.icon} size={24} />
          {item.label}
        </NavLink>
      ))}
      <NavLink {...linkProps(mainAction.to)} className={styles.ask}>
        <span className={styles.askCircle}>
          <Icon name="plus" size={26} />
        </span>
        {mainAction.label}
      </NavLink>
      {AFTER_ASK.map((item) => (
        <NavLink key={item.to} {...linkProps(item.to)} className={styles.item}>
          <Icon name={item.icon} size={24} />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
