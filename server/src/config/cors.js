export const parseClientOrigins = (value = "") => [...new Set(
  value.split(",").map((origin) => origin.trim().replace(/\/+$/, "")).filter(Boolean)
)];

// An empty list allows no browser origins. Requests without Origin (health
// checks and CLI verification) still work. Never use '*' with credentials.
export const getCorsOptions = () => ({
  origin: parseClientOrigins(process.env.CLIENT_URL),
  credentials: true,
});
