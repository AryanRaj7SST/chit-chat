import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { getClientUrls } from "./src/utils/environment.js";

export default defineConfig(({ mode }) => {
  getClientUrls(loadEnv(mode, process.cwd(), "VITE_"));
  return {
    plugins: [react(), tailwindcss()],
    server: { port: 5173 },
  };
});
