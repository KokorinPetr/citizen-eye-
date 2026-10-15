import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../../api/client";
import { keepWhileMapMoves } from "../../api/placeholder";
import type { PostCategory } from "../../api/types";

export function usePosts(bbox: string | null, categories: PostCategory[], withReward: boolean, enabled = true) {
  const queryKey = ["posts", bbox, [...categories].sort(), withReward] as const;
  return useQuery({
    queryKey,
    queryFn: () =>
      unwrap(
        api.GET("/community/posts", {
          params: {
            query: {
              bbox: bbox ?? undefined,
              category: categories.length ? categories : undefined,
              has_reward: withReward ? true : undefined,
            },
          },
        }),
      ),
    enabled: enabled && bbox !== null,
    refetchInterval: 15_000,
    placeholderData: keepWhileMapMoves(queryKey),
  });
}

export function usePost(id: string) {
  return useQuery({
    queryKey: ["post", id],
    queryFn: () => unwrap(api.GET("/community/posts/{post_id}", { params: { path: { post_id: id } } })),
  });
}
