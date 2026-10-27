import { createContext, useEffect, useState } from "react";

export const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem("chat_theme");
      if (["light", "dark", "system"].includes(saved)) return saved;
    } catch { /* Follow the system when storage is unavailable. */ }
    return "system";
  });
  const [resolvedTheme, setResolvedTheme] = useState(() => document.documentElement.classList.contains("dark") ? "dark" : "light");

  useEffect(() => {
    const preference = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && preference.matches);
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
      setResolvedTheme(dark ? "dark" : "light");
    };
    apply();
    try { localStorage.setItem("chat_theme", theme); } catch { /* Keep the in-memory choice. */ }
    if (theme !== "system") return;
    preference.addEventListener("change", apply);
    return () => preference.removeEventListener("change", apply);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>{children}</ThemeContext.Provider>;
}
