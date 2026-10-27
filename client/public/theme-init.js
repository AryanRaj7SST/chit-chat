(() => {
  let theme = "system";
  try { const settings = JSON.parse(localStorage.getItem("chat_settings") || "{}"); for (const key of ["accent", "fontSize", "wallpaper", "bubbleStyle", "density"]) if (typeof settings[key] === "string" && /^[a-z]+$/.test(settings[key])) document.documentElement.dataset[key] = settings[key]; } catch {}
  try { const saved = localStorage.getItem("chat_theme"); if (["light", "dark", "system"].includes(saved)) theme = saved; } catch {}
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
})();
