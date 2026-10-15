import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../../api/client";

/** Urgent incidents near a point (the map centre). Polled while the Community mode is open. */
export function useAreaAlert(center: [number, number], enabled: boolean) {
  const [lat, lng] = center.map((value) => Number(value.toFixed(3)));
  return useQuery({
    queryKey: ["alert", lat, lng],
    queryFn: () => unwrap(api.GET("/alerts", { params: { query: { lat, lng } } })),
    enabled,
    refetchInterval: 30_000,
  });
}
