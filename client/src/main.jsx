import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";

try {
  document.documentElement.classList.toggle("dark", localStorage.getItem("chat_theme") === "dark");
} catch { /* The default light theme works when storage is unavailable. */ }

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
