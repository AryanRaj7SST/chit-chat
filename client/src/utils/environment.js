export function getClientUrls(env) {
  const readUrl = (key) => {
    const value = String(env[key] || "").trim().replace(/\/+$/, "");
    let url;
    try { url = new URL(value); } catch { throw new Error(`${key} must be an absolute HTTP(S) URL`); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash)
      throw new Error(`${key} must be an HTTP(S) URL without credentials, a query, or a fragment`);
    return { value, url };
  };
  const api = readUrl("VITE_API_URL");
  if (!api.url.pathname.endsWith("/api")) throw new Error("VITE_API_URL must end with /api");
  const socket = readUrl("VITE_SOCKET_URL");
  if (socket.url.pathname !== "/") throw new Error("VITE_SOCKET_URL must be the backend origin without /api");
  return { apiUrl: api.value, socketUrl: socket.value };
}
