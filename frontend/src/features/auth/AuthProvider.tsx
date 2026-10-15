import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, unwrap } from "../../api/client";
import { readTokens, TOKENS_CHANGED, writeTokens } from "../../api/tokens";
import type { User } from "../../api/types";

interface AuthContextValue {
  user: User | null;
  isLoggedIn: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [hasTokens, setHasTokens] = useState(() => readTokens() !== null);

  useEffect(() => {
    const sync = () => setHasTokens(readTokens() !== null);
    window.addEventListener(TOKENS_CHANGED, sync);
    window.addEventListener("storage", sync); // other tabs
    return () => {
      window.removeEventListener(TOKENS_CHANGED, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: () => unwrap(api.GET("/auth/me")),
    enabled: hasTokens,
    staleTime: 5 * 60_000,
  });

  const logout = useCallback(() => {
    const tokens = readTokens();
    if (tokens) void api.POST("/auth/logout", { body: { refresh_token: tokens.refresh_token } });
    writeTokens(null);
    queryClient.clear(); // contact phones etc. were loaded as this user
  }, [queryClient]);

  const value: AuthContextValue = {
    user: hasTokens ? (user ?? null) : null,
    isLoggedIn: hasTokens,
    logout,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Hook lives next to its provider on purpose.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
