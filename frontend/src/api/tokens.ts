/** Token storage. localStorage can throw (private mode, blocked storage), so every access is guarded. */
export interface StoredTokens {
  access_token: string;
  refresh_token: string;
}

const KEY = "civic_eye_tokens";

export function readTokens(): StoredTokens | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredTokens) : null;
  } catch {
    return null;
  }
}

export function writeTokens(tokens: StoredTokens | null): void {
  try {
    if (tokens) localStorage.setItem(KEY, JSON.stringify(tokens));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the user stays logged in until the page reloads */
  }
  window.dispatchEvent(new Event(TOKENS_CHANGED));
}

export const TOKENS_CHANGED = "civic-eye:tokens-changed";
