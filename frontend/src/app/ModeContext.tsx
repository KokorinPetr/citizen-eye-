import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { loadJson, saveJson } from "../utils/storage";

export type AppMode = "emergency" | "community";

interface ModeContextValue {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
}

const ModeContext = createContext<ModeContextValue | null>(null);
const KEY = "civic_eye_mode";

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AppMode>(() => loadJson<AppMode>(KEY, "emergency"));
  useEffect(() => saveJson(KEY, mode), [mode]);
  return <ModeContext.Provider value={{ mode, setMode }}>{children}</ModeContext.Provider>;
}

// Hook lives next to its provider on purpose.
// eslint-disable-next-line react-refresh/only-export-components
export function useMode(): ModeContextValue {
  const value = useContext(ModeContext);
  if (!value) throw new Error("useMode must be used inside ModeProvider");
  return value;
}
