import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import { api, unwrap, unwrapEmpty } from "../../api/client";
import type { FeedComment, FeedPost, FeedPostCreate, FeedSort, FeedTopic } from "../../api/types";

const PAGE_SIZE = 20;

export interface FeedQuery {
  sort: FeedSort;
  topic: FeedTopic | null;
  /** "My posts": only this author's posts. */
  authorId?: string;
}

const keys = {
  lists: ["feed", "list"] as const,
  list: ({ sort, topic, authorId }: FeedQuery) => ["feed", "list", sort, topic, authorId ?? null] as const,
  post: (id: string) => ["feed", "post", id] as const,
  comments: (postId: string) => ["feed", "comments", postId] as const,
};

/** Endless feed: each page is PAGE_SIZE posts, the next page starts where the last ended. */
export function useFeed(query: FeedQuery, enabled = true) {
  const { sort, topic, authorId } = query;
  return useInfiniteQuery({
    queryKey: keys.list(query),
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/feed/posts", {
          params: {
            query: {
              sort,
              topic: topic ? [topic] : undefined,
              author_id: authorId,
              limit: PAGE_SIZE,
              offset: pageParam,
            },
          },
        }),
      ),
    enabled,
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => (lastPage.length < PAGE_SIZE ? undefined : pages.length * PAGE_SIZE),
    staleTime: 30_000,
  });
}

export function useFeedPost(id: string) {
  return useQuery({
    queryKey: keys.post(id),
    queryFn: () => unwrap(api.GET("/feed/posts/{post_id}", { params: { path: { post_id: id } } })),
  });
}

export function useComments(postId: string) {
  return useQuery({
    queryKey: keys.comments(postId),
    queryFn: () => unwrap(api.GET("/feed/posts/{post_id}/comments", { params: { path: { post_id: postId } } })),
    refetchInterval: 15_000,
  });
}

/** Change one post wherever it is cached: every feed list page and its own query. */
function patchPost(queryClient: QueryClient, id: string, patch: (post: FeedPost) => FeedPost) {
  queryClient.setQueriesData<InfiniteData<FeedPost[]>>(
    { queryKey: keys.lists },
    (data) =>
      data && { ...data, pages: data.pages.map((page) => page.map((post) => (post.id === id ? patch(post) : post))) },
  );
  queryClient.setQueryData<FeedPost>(keys.post(id), (post) => post && patch(post));
}

function patchComment(queryClient: QueryClient, postId: string, id: string, patch: (c: FeedComment) => FeedComment) {
  queryClient.setQueryData<FeedComment[]>(keys.comments(postId), (comments) =>
    comments?.map((comment) => (comment.id === id ? patch(comment) : comment)),
  );
}

interface LikeInput {
  id: string;
  liked: boolean;
}

/** Toggle shows at once; the server answer (or a refetch on error) settles the real count. */
export function useLikePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, liked }: LikeInput) => {
      const params = { params: { path: { post_id: id } } };
      return unwrap(
        liked ? api.POST("/feed/posts/{post_id}/like", params) : api.DELETE("/feed/posts/{post_id}/like", params),
      );
    },
    onMutate: ({ id, liked }) =>
      patchPost(queryClient, id, (post) => ({
        ...post,
        liked_by_me: liked,
        like_count: post.like_count + (liked ? 1 : -1),
      })),
    onSuccess: (state, { id }) =>
      patchPost(queryClient, id, (post) => ({ ...post, liked_by_me: state.liked, like_count: state.like_count })),
    onError: () => void queryClient.invalidateQueries({ queryKey: ["feed"] }),
  });
}

export function useLikeComment(postId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, liked }: LikeInput) => {
      const params = { params: { path: { comment_id: id } } };
      return unwrap(
        liked
          ? api.POST("/feed/comments/{comment_id}/like", params)
          : api.DELETE("/feed/comments/{comment_id}/like", params),
      );
    },
    onMutate: ({ id, liked }) =>
      patchComment(queryClient, postId, id, (c) => ({
        ...c,
        liked_by_me: liked,
        like_count: c.like_count + (liked ? 1 : -1),
      })),
    onSuccess: (state, { id }) =>
      patchComment(queryClient, postId, id, (c) => ({ ...c, liked_by_me: state.liked, like_count: state.like_count })),
    onError: () => void queryClient.invalidateQueries({ queryKey: keys.comments(postId) }),
  });
}

export function useCreateFeedPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: FeedPostCreate) => unwrap(api.POST("/feed/posts", { body })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.lists }),
  });
}

export function useDeleteFeedPost(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrapEmpty(api.DELETE("/feed/posts/{post_id}", { params: { path: { post_id: id } } })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.lists }),
  });
}

/** After adding or deleting a comment: the thread and the comment count on the post change. */
function useRefreshThread(postId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: keys.comments(postId) });
    void queryClient.invalidateQueries({ queryKey: keys.post(postId) });
    void queryClient.invalidateQueries({ queryKey: keys.lists });
  };
}

export function useAddComment(postId: string) {
  return useMutation({
    mutationFn: (body: { body: string; parent_id?: string | null }) =>
      unwrap(api.POST("/feed/posts/{post_id}/comments", { params: { path: { post_id: postId } }, body })),
    onSuccess: useRefreshThread(postId),
  });
}

export function useDeleteComment(postId: string) {
  return useMutation({
    mutationFn: (id: string) =>
      unwrapEmpty(api.DELETE("/feed/comments/{comment_id}", { params: { path: { comment_id: id } } })),
    onSuccess: useRefreshThread(postId),
  });
}

export function useReportPost(id: string) {
  return useMutation({
    mutationFn: () => unwrapEmpty(api.POST("/feed/posts/{post_id}/report", { params: { path: { post_id: id } } })),
  });
}

export function useReportComment() {
  return useMutation({
    mutationFn: (id: string) =>
      unwrapEmpty(api.POST("/feed/comments/{comment_id}/report", { params: { path: { comment_id: id } } })),
  });
}
