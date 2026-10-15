import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../../api/client";

export function useMySignups(userId: string | undefined) {
  return useQuery({
    queryKey: ["signups", userId],
    queryFn: () => unwrap(api.GET("/users/{user_id}/signups", { params: { path: { user_id: userId! } } })),
    enabled: userId !== undefined,
  });
}
