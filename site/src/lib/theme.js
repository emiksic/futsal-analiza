// Tamni / svjetli način rada. Bez spremljenog izbora prati postavku sustava.
import { useSyncExternalStore } from "react";
const KEY = "theme";
const subs = new Set();
const mq = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
function stored() { try { const v = localStorage.getItem(KEY); return v === "dark" || v === "light" ? v : null; } catch { return null; } }
export function currentTheme() { return document.documentElement.dataset.theme || (mq?.matches ? "dark" : "light"); }
export function applyStoredTheme() { const v = stored(); if (v) document.documentElement.dataset.theme = v; }
export function toggleTheme() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(KEY, next); } catch { /* */ }
  subs.forEach((f) => f());
}
mq?.addEventListener?.("change", () => subs.forEach((f) => f()));
export const useTheme = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, currentTheme);
