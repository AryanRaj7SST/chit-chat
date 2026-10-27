export const getInitials = (name = "") =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => (w[0] || "").toUpperCase()).join("") || "?";

export const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export const formatMessageDate = (iso, now = new Date()) => {
  const date = new Date(iso);
  if (date.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
};

export const sameMessageGroup = (previous, current) => !!previous && !!current &&
  previous.sender === current.sender &&
  new Date(previous.createdAt).toDateString() === new Date(current.createdAt).toDateString() &&
  new Date(current.createdAt) - new Date(previous.createdAt) < 5 * 60 * 1000;

export const formatListTime = (iso) => {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return formatTime(iso);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
};

export const getOther = (conversation, meId) =>
  conversation.participants.find((p) => p._id !== meId);

export const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
