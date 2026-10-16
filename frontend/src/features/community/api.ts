import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, unwrapEmpty } from "../../api/client";
import { keepWhileMapMoves } from "../../api/placeholder";
import type { PostCategory, PostCreate } from "../../api/types";

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

/** "My posts" on Me: every status, expired ones too. */
export function useMyPosts(userId: string | undefined) {
  return useQuery({
    queryKey: ["posts", "mine", userId],
    queryFn: () =>
      unwrap(
        api.GET("/community/posts", {
          params: {
            query: { owner_id: userId!, status: ["open", "matched", "closed"], include_expired: true },
          },
        }),
      ),
    enabled: userId !== undefined,
  });
}

/** Author and coordinators get every response; anyone else only their own. */
export function useResponses(postId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["responses", postId],
    queryFn: () =>
      unwrap(api.GET("/community/posts/{post_id}/responses", { params: { path: { post_id: postId } } })),
    enabled,
    refetchInterval: 15_000,
  });
}

export function usePreviewPost() {
  return useMutation({
    mutationFn: (text: string) => unwrap(api.POST("/community/posts/preview", { body: { text } })),
  });
}

/** After any post action: the post, its responses, the map and "My posts" change. */
function useRefreshPosts(postId?: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["posts"] });
    if (postId) {
      void queryClient.invalidateQueries({ queryKey: ["post", postId] });
      void queryClient.invalidateQueries({ queryKey: ["responses", postId] });
    }
  };
}

export function useCreatePost() {
  return useMutation({
    mutationFn: (body: PostCreate) => unwrap(api.POST("/community/posts", { body })),
    onSuccess: useRefreshPosts(),
  });
}

export function useClosePost(postId: string) {
  return useMutation({
    mutationFn: () =>
      unwrap(api.POST("/community/posts/{post_id}/close", { params: { path: { post_id: postId } } })),
    onSuccess: useRefreshPosts(postId),
  });
}

export function useDeletePost(postId: string) {
  return useMutation({
    mutationFn: () =>
      unwrapEmpty(api.DELETE("/community/posts/{post_id}", { params: { path: { post_id: postId } } })),
    onSuccess: useRefreshPosts(),
  });
}

export function useRespond(postId: string) {
  return useMutation({
    mutationFn: (message: string) =>
      unwrap(
        api.POST("/community/posts/{post_id}/responses", {
          params: { path: { post_id: postId } },
          body: { message },
        }),
      ),
    onSuccess: useRefreshPosts(postId),
  });
}

export function useAcceptResponse(postId: string) {
  return useMutation({
    mutationFn: (responseId: string) =>
      unwrap(
        api.POST("/community/posts/{post_id}/responses/{response_id}/accept", {
          params: { path: { post_id: postId, response_id: responseId } },
        }),
      ),
    onSuccess: useRefreshPosts(postId),
  });
}

export function useWithdrawResponse(postId: string) {
  return useMutation({
    mutationFn: (responseId: string) =>
      unwrapEmpty(
        api.DELETE("/community/posts/{post_id}/responses/{response_id}", {
          params: { path: { post_id: postId, response_id: responseId } },
        }),
      ),
    onSuccess: useRefreshPosts(postId),
  });
}
