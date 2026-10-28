// Lokalna baza: seed + izmjene iz admina, spremljene u localStorage.
// Sučelje (useDB, update) ostaje isto kad se prebaci na Supabase.
import { useSyncExternalStore } from "react";
import seed, { SEED_VERSION } from "./seed.js";

const KEY = "futsal-db";
const subs = new Set();
const clone = (x) => JSON.parse(JSON.stringify(x));

function load() {
  try {
    const s = localStorage.getItem(KEY);
    if (s) { const d = JSON.parse(s); if (d.version === SEED_VERSION) return d; }
  } catch { /* privatni prozor ili blokiran storage */ }
  return clone(seed);
}
let db = load();
const emit = () => subs.forEach((f) => f());
function persist() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* ignore */ } }

export const getDB = () => db;
export function update(fn) { const next = clone(db); fn(next); db = next; persist(); emit(); }
export function resetDB() { db = clone(seed); try { localStorage.removeItem(KEY); } catch { /* ignore */ } emit(); }
export function useDB() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => db);
}
export const uid = (p = "x") => p + Math.random().toString(36).slice(2, 9);
