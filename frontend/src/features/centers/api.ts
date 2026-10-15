import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "../../api/client";
import { keepWhileMapMoves } from "../../api/placeholder";
import type { CenterCreate, CenterType, GeoPoint } from "../../api/types";

export function useCenters(bbox: string | null, types: CenterType[]) {
  const queryKey = ["centers", bbox, [...types].sort()] as const;
  return useQuery({
    queryKey,
    queryFn: () =>
      unwrap(api.GET("/centers", { params: { query: { bbox: bbox ?? undefined, center_type: types } } })),
    enabled: bbox !== null && types.length > 0,
    refetchInterval: 60_000,
    placeholderData: keepWhileMapMoves(queryKey),
  });
}

export function useCenter(id: string) {
  return useQuery({
    queryKey: ["center", id],
    queryFn: () => unwrap(api.GET("/centers/{center_id}", { params: { path: { center_id: id } } })),
  });
}

/** The single closest open place of these types (e.g. hospital) to a point. */
export function useNearestCenter(point: GeoPoint | undefined, types: CenterType[]) {
  return useQuery({
    queryKey: ["nearest", point?.lat, point?.lng, types],
    queryFn: async () => {
      const results = await unwrap(
        api.GET("/centers/nearest", {
          params: { query: { lat: point!.lat, lng: point!.lng, center_type: types, limit: 1 } },
        }),
      );
      return results[0] ?? null;
    },
    enabled: point !== undefined,
    staleTime: 5 * 60_000,
  });
}

export function useCreateCenter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CenterCreate) => unwrap(api.POST("/centers", { body })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["centers"] }),
  });
}
