import { Outlet } from "react-router";
import styles from "./AppLayout.module.css";
import { BottomNav } from "./BottomNav";

/** App shell: the current screen + navigation (bottom on phones, top on desktop). */
export function AppLayout() {
  return (
    <div className={styles.app}>
      <main className={styles.main}>
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
