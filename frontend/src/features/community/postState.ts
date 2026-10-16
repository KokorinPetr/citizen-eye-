import type { Post } from "../../api/types";
import { t } from "../../i18n";

/** Posts expire after 30 days (backend setting); expired posts take no new responses. */
export function isExpired(post: Pick<Post, "expires_at">, now: Date = new Date()): boolean {
  return new Date(post.expires_at).getTime() <= now.getTime();
}

/** Same rule as the backend: only open, not expired posts take responses. */
export function isOpenForResponses(post: Pick<Post, "status" | "expires_at">): boolean {
  return post.status === "open" && !isExpired(post);
}

/** One word or phrase for lists such as "Your posts". */
export function postStatusLabel(post: Pick<Post, "status" | "expires_at">): string {
  if (post.status === "closed") return t.community.closed;
  if (isExpired(post)) return t.community.expired;
  return post.status === "matched" ? t.community.matched : t.community.open;
}
