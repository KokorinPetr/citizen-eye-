import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "../../api/client";
import { writeTokens } from "../../api/tokens";
import type { AuthResponse } from "../../api/types";

function useSaveSession() {
  const queryClient = useQueryClient();
  return (session: AuthResponse) => {
    writeTokens({ access_token: session.tokens.access_token, refresh_token: session.tokens.refresh_token });
    queryClient.setQueryData(["me"], session.user);
    void queryClient.invalidateQueries(); // reload data that depends on being logged in (phones…)
  };
}

export function useLogin() {
  const saveSession = useSaveSession();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) => unwrap(api.POST("/auth/login", { body })),
    onSuccess: saveSession,
  });
}

export function useRegister() {
  const saveSession = useSaveSession();
  return useMutation({
    mutationFn: (body: { email: string; password: string; full_name: string; has_vehicle: boolean }) =>
      unwrap(api.POST("/auth/register", { body })),
    onSuccess: saveSession,
  });
}
