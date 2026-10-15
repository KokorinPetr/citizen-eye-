import createClient from "openapi-fetch";
import type { paths } from "./schema";
import { readTokens, writeTokens } from "./tokens";

export const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

/** Backend error shape: { error: { code, message, details? } } */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let refreshing: Promise<boolean> | null = null;

/** Exchange the refresh token once, shared by all requests that got a 401 at the same time. */
function refreshTokens(): Promise<boolean> {
  refreshing ??= (async () => {
    const tokens = readTokens();
    if (!tokens) return false;
    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: tokens.refresh_token }),
      });
      if (!response.ok) {
        writeTokens(null);
        return false;
      }
      const data = (await response.json()) as { access_token: string; refresh_token: string };
      writeTokens({ access_token: data.access_token, refresh_token: data.refresh_token });
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

function withAuth(request: Request): Request {
  const tokens = readTokens();
  if (tokens) request.headers.set("Authorization", `Bearer ${tokens.access_token}`);
  return request;
}

/** fetch used by the typed client: adds the token, refreshes once on 401 and retries. */
async function authFetch(input: Request): Promise<Response> {
  const retry = input.clone();
  const response = await fetch(withAuth(input));
  if (response.status !== 401 || !readTokens() || input.url.includes("/auth/")) return response;
  return (await refreshTokens()) ? fetch(withAuth(retry)) : response;
}

export const api = createClient<paths>({ baseUrl: API_URL, fetch: authFetch });

interface FetchResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/** Turn an openapi-fetch result into data or a thrown ApiError (for TanStack Query). */
export async function unwrap<T>(request: Promise<FetchResult<T>>): Promise<T> {
  let result: FetchResult<T>;
  try {
    result = await request;
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  }
  if (result.error !== undefined || result.data === undefined) {
    const body = result.error as { error?: { message?: string; code?: string } } | undefined;
    throw new ApiError(
      body?.error?.message ?? `Request failed (${result.response.status})`,
      result.response.status,
      body?.error?.code,
    );
  }
  return result.data;
}
