import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../../api/client";
import { keepWhileMapMoves } from "../../api/placeholder";
import type { Urgency } from "../../api/types";

const LIVE_REFRESH_MS = 5_000;
const URGENT: Urgency[] = ["high", "critical"];

export function useIncidents(bbox: string | null, urgentOnly: boolean, enabled = true) {
  const queryKey = ["incidents", bbox, urgentOnly] as const;
  return useQuery({
    queryKey,
    queryFn: () =>
      unwrap(
        api.GET("/incidents", {
          params: { query: { bbox: bbox ?? undefined, urgency: urgentOnly ? URGENT : undefined } },
        }),
      ),
    enabled: enabled && bbox !== null,
    refetchInterval: LIVE_REFRESH_MS,
    placeholderData: keepWhileMapMoves(queryKey),
  });
}

export function useIncident(id: string) {
  return useQuery({
    queryKey: ["incident", id],
    queryFn: () => unwrap(api.GET("/incidents/{incident_id}", { params: { path: { incident_id: id } } })),
    refetchInterval: LIVE_REFRESH_MS,
  });
}

export function useIncidentVolunteers(id: string) {
  return useQuery({
    queryKey: ["incident", id, "volunteers"],
    queryFn: () =>
      unwrap(api.GET("/incidents/{incident_id}/volunteers", { params: { path: { incident_id: id } } })),
    refetchInterval: LIVE_REFRESH_MS,
  });
}

export function useIncidentReports(id: string) {
  return useQuery({
    queryKey: ["incident", id, "reports"],
    queryFn: () =>
      unwrap(api.GET("/incidents/{incident_id}/reports", { params: { path: { incident_id: id } } })),
  });
}
