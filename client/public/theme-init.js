(() => {
  let theme = "system";
  try { const saved = localStorage.getItem("chat_theme"); if (["light", "dark", "system"].includes(saved)) theme = saved; } catch {}
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
})();
