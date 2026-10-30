import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import { applyStoredTheme } from "./lib/theme.js";
applyStoredTheme();
createRoot(document.getElementById("app")).render(<App />);
