// Shared helpers for the dev pages (/dev/map, /dev/report). Plain script, exposes `window.civic`.
window.civic = (() => {
  const TOKENS_KEY = "civic_dev_tokens";
  const USER_KEY = "civic_dev_user";

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

  function readStorage(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }

  function writeStorage(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch { /* storage blocked: stay logged out */ }
  }

  const getUser = () => readStorage(USER_KEY);

  function saveLogin(body) {
    writeStorage(TOKENS_KEY, body?.tokens ?? null);
    writeStorage(USER_KEY, body?.user ?? null);
  }

  /** Calls the API (same origin). Returns { ok, status, data, ms } and never throws on HTTP errors. */
  async function request(method, path, body) {
    const headers = { "Content-Type": "application/json" };
    const tokens = readStorage(TOKENS_KEY);
    if (tokens?.access_token) headers.Authorization = `Bearer ${tokens.access_token}`;

    const started = performance.now();
    const response = await fetch(path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const ms = Math.round(performance.now() - started);
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (response.status === 401 && tokens) saveLogin(null);  // expired: log out (no refresh in dev)
    return { ok: response.ok, status: response.status, data, ms };
  }

  async function getJson(path) {
    const result = await request("GET", path);
    if (!result.ok) throw new Error(`${path} → ${result.status}`);
    return result.data;
  }

  async function login(email, password) {
    const result = await request("POST", "/auth/login", { email, password });
    if (result.ok) saveLogin(result.data);
    return result;
  }

  const logout = () => saveLogin(null);

  return { escapeHtml, request, getJson, login, logout, getUser };
})();
