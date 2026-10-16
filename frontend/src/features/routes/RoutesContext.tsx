import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { CenterWithRoute } from "../../api/types";

interface RoutesContextValue {
  /** Routes drawn on the map (empty = none). */
  routes: CenterWithRoute[];
  selected: number;
  show: (routes: CenterWithRoute[]) => void;
  select: (index: number) => void;
  clear: () => void;
}

const RoutesContext = createContext<RoutesContextValue | null>(null);

/** Shares routes between the incident sheet (list) and the map (lines). */
export function RoutesProvider({ children }: { children: ReactNode }) {
  const [routes, setRoutes] = useState<CenterWithRoute[]>([]);
  const [selected, setSelected] = useState(0);
  const show = useCallback((next: CenterWithRoute[]) => {
    setRoutes(next);
    setSelected(0);
  }, []);
  const clear = useCallback(() => setRoutes([]), []);
  const value = useMemo(
    () => ({ routes, selected, show, select: setSelected, clear }),
    [routes, selected, show, clear],
  );
  return <RoutesContext.Provider value={value}>{children}</RoutesContext.Provider>;
}

// Hook lives next to its provider on purpose.
// eslint-disable-next-line react-refresh/only-export-components
export function useRoutes(): RoutesContextValue {
  const value = useContext(RoutesContext);
  if (!value) throw new Error("useRoutes must be used inside RoutesProvider");
  return value;
}
