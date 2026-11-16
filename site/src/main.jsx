import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import { applyStoredTheme } from "./lib/theme.js";
applyStoredTheme();

// Instalacija na mobitel (PWA): Chrome/Android javlja da se stranica može instalirati; čuvamo događaj za gumb "Instaliraj".
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); window.__installPrompt = e; window.dispatchEvent(new Event("installable")); });
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {}));
}
createRoot(document.getElementById("app")).render(<App />);
