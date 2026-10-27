import { Moon, Sun } from "lucide-react";
import { useTheme } from "../hooks/useTheme";
import { useAuth } from "../hooks/useAuth";

export default function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { user, updateProfile } = useAuth();
  const dark = resolvedTheme === "dark";
  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  return <button type="button" onClick={() => { const theme = dark ? "light" : "dark"; setTheme(theme); if (user) void updateProfile({ settings: { theme } }).catch(() => setTheme(user.settings?.theme || "system")); }}
    aria-label={label} aria-pressed={dark} title={`${label}${theme === "system" ? " (currently following system)" : ""}`}
    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-text">
    {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
  </button>;
}
