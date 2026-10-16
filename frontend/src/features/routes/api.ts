import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../../api/client";
import type { CenterType, GeoPoint } from "../../api/types";

/** Places people can go to for help. */
export const ROUTE_DESTINATIONS: CenterType[] = ["shelter", "supply_point", "hospital"];

/** Road routes to the nearest places. Only runs when `enabled` (the user pressed the button). */
export function useRoutesToNearest(point: GeoPoint, enabled: boolean) {
  return useQuery({
    queryKey: ["routes", point.lat, point.lng],
    queryFn: () =>
      unwrap(
        api.GET("/centers/nearest/routes", {
          params: {
            query: { lat: point.lat, lng: point.lng, center_type: ROUTE_DESTINATIONS, limit: 3 },
          },
        }),
      ),
    enabled,
    staleTime: 5 * 60_000,
  });
}
