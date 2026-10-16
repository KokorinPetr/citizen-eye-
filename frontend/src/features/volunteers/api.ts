import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, unwrapEmpty } from "../../api/client";

/** After any volunteer action: the incident, its volunteers, the map and "Me" change. */
function useRefreshAfterHelp(incidentId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["incident", incidentId] });
    void queryClient.invalidateQueries({ queryKey: ["incidents"] });
    void queryClient.invalidateQueries({ queryKey: ["signups"] });
  };
}

export function useSignUp(incidentId: string) {
  return useMutation({
    mutationFn: (taskId: string) =>
      unwrap(
        api.POST("/incidents/{incident_id}/volunteers", {
          params: { path: { incident_id: incidentId } },
          body: { task_id: taskId },
        }),
      ),
    onSuccess: useRefreshAfterHelp(incidentId),
  });
}

export function useCancelSignup(incidentId: string) {
  return useMutation({
    mutationFn: (signupId: string) =>
      unwrapEmpty(
        api.DELETE("/incidents/{incident_id}/volunteers/{signup_id}", {
          params: { path: { incident_id: incidentId, signup_id: signupId } },
        }),
      ),
    onSuccess: useRefreshAfterHelp(incidentId),
  });
}

export function useCompleteTask(incidentId: string) {
  return useMutation({
    mutationFn: (taskId: string) =>
      unwrap(
        api.POST("/incidents/{incident_id}/tasks/{task_id}/done", {
          params: { path: { incident_id: incidentId, task_id: taskId } },
        }),
      ),
    onSuccess: useRefreshAfterHelp(incidentId),
  });
}
