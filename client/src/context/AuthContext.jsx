import { createContext, useCallback, useEffect, useState } from "react";
import api, { TOKEN_KEY } from "../services/api";
import { clearMediaCache } from "../services/media";
import { applyPreferences } from "../utils/preferences";
import { useTheme } from "../hooks/useTheme";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { setTheme } = useTheme();
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => !!localStorage.getItem(TOKEN_KEY));
  const [mediaEnabled, setMediaEnabled] = useState(true);
  useEffect(() => { api.get("/config").then(({ data }) => setMediaEnabled(data.mediaEnabled !== false)).catch(() => {}); }, []);
  useEffect(() => { if (user) { applyPreferences(user.settings); setTheme(user.settings?.theme || "system"); } }, [user, setTheme]);
  useEffect(() => {
    const refresh = () => { if (localStorage.getItem(TOKEN_KEY)) api.get("/auth/me").then(({ data }) => setUser(data.user)).catch(() => {}); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  const logout = useCallback(() => {
    clearMediaCache();
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const saveSession = ({ token: newToken, user: newUser }) => {
    clearMediaCache();
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(newUser);
  };

  // restore session once on page load
  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return;
    api
      .get("/auth/me")
      .then((res) => setUser(res.data.user))
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, [logout]);

  // fired by the axios interceptor or a rejected socket handshake
  useEffect(() => {
    window.addEventListener("auth:logout", logout);
    return () => window.removeEventListener("auth:logout", logout);
  }, [logout]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    saveSession(data);
  };

  const register = async (name, email, password) => {
    const { data } = await api.post("/auth/register", { name, email, password });
    saveSession(data);
  };
  const updateProfile = async fields => { const { data } = await api.patch("/users/me", fields); setUser(data.user); };
  const logoutAll = async () => { await api.post("/auth/logout-all"); logout(); };
  const changePassword = async fields => { await api.post("/auth/change-password", fields); logout(); };

  return (
    <AuthContext.Provider value={{ user, token, loading, mediaEnabled, login, register, logout, updateProfile, logoutAll, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}
