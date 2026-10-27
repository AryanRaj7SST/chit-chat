export const accents = { violet: ["#6d4aff", "#5b39e8"], blue: ["#1d4ed8", "#1e40af"], teal: ["#0f766e", "#115e59"], green: ["#15803d", "#166534"], rose: ["#be123c", "#9f1239"], orange: ["#c2410c", "#9a3412"] };
export function applyPreferences(settings) {
  const root = document.documentElement;
  for (const [key, fallback] of [["accent", "violet"], ["fontSize", "medium"], ["wallpaper", "none"], ["bubbleStyle", "rounded"], ["density", "comfortable"]]) root.dataset[key] = settings?.[key] || fallback;
  try { localStorage.setItem("chat_settings", JSON.stringify(settings || {})); } catch { /* Storage is optional. */ }
}
