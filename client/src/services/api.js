import axios from "axios";

const TOKEN_KEY = "chat_token";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url || "";
    const isAuthForm = url.includes("/auth/login") || url.includes("/auth/register");
    if (err.response?.status === 401 && !isAuthForm && localStorage.getItem(TOKEN_KEY)) {
      window.dispatchEvent(new Event("auth:logout"));
    }
    return Promise.reject(err);
  }
);

export const getErrorMessage = (err) => {
  if (err.response?.data?.message) return err.response.data.message;
  if (err.request) return "Cannot reach the server. Please try again.";
  return err.message || "Something went wrong";
};

export { TOKEN_KEY };
export default api;
