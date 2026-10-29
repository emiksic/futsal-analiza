// Podaci stranice. Dva načina:
//  - "remote": čita iz Supabasea; admin (prijavljen, u tablici admins) piše natrag — šalju se samo promijenjeni redovi
//  - "local":  kad baza nije dostupna (npr. pregled) radi se nad ugrađenim podacima, izmjene samo u ovom pregledniku
// Sučelje za ostatak aplikacije: useDB(), update(fn), useSession(), …
import { useSyncExternalStore } from "react";
import { createClient } from "@supabase/supabase-js";
import seed, { SEED_VERSION } from "./seed.js";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const clone = (x) => JSON.parse(JSON.stringify(x));
const subs = new Set();
const emit = () => subs.forEach((f) => f());
const KEY = "futsal-db";

// ---------- stanje ----------
let state = {
  db: loadLocal(),
  mode: "local",          // local | remote
  status: "loading",      // loading | ready | empty (baza bez podataka) | offline
  session: null, isAdmin: false,
  sync: "idle",           // idle | saving | saved | error
  syncError: "",
};
const set = (p) => { state = { ...state, ...p }; emit(); };
function loadLocal() {
  try { const s = localStorage.getItem(KEY); if (s) { const d = JSON.parse(s); if (d.version === SEED_VERSION) return d; } } catch { /* */ }
  return clone(seed);
}
const persistLocal = () => { try { localStorage.setItem(KEY, JSON.stringify(state.db)); } catch { /* */ } };

// ---------- mapiranje tablica ----------
const T = {
  seasons: ["id", "name"],
  halls: ["id", "name", "city", "calibrated"],
  leagues: ["id", "name", "category", "zones", "privacy", "sort"],
  clubs: ["id", "name", "full_name", "short", "city", "hall", "kit"],
  comps: ["id", "league", "season", "teams", "rounds"],
  players: ["id", "club", "season", "cat", "num", "name", "last", "gk"],
  matches: ["id", "comp", "round", "date", "home", "away", "hall", "status", "result", "no_score", "time_tbd", "extra",
    "youtube", "tv", "source", "roster", "events", "analysis"],
};
const REN = { clubs: { full: "full_name" }, matches: { noScore: "no_score", timeTbd: "time_tbd" } };
// zadane vrijednosti za stupce koji ne smiju biti prazni
const DEF = { calibrated: false, gk: false, no_score: false, time_tbd: false, extra: false, zones: {}, privacy: { names: "full", perPlayer: true },
  kit: {}, teams: [], rounds: 0, status: "scheduled", roster: { home: null, away: null }, events: [] };
function toRow(t, o, i) {
  const r = {}, ren = REN[t] || {}, back = Object.fromEntries(Object.entries(ren).map(([a, b]) => [b, a]));
  for (const c of T[t]) { const v = o[back[c] || c]; r[c] = v === undefined || v === null ? (c in DEF ? DEF[c] : null) : v; }
  if (t === "leagues") r.sort = i;
  return r;
}
function fromRow(t, r) {
  const o = {}, back = Object.fromEntries(Object.entries(REN[t] || {}).map(([a, b]) => [b, a]));
  for (const [k, v] of Object.entries(r)) { if (v === null) continue; o[back[k] || k] = v; }
  return o;
}
const ORDER = ["seasons", "halls", "leagues", "clubs", "comps", "players", "matches"];

// ---------- Supabase ----------
let sb = null;
try { sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true } }); } catch { sb = null; }

async function fetchAll() {
  const get = async (t, view) => {
    const out = []; let from = 0;
    for (;;) {
      const { data, error } = await sb.from(view || t).select("*").range(from, from + 999);
      if (error) throw error;
      out.push(...data); if (data.length < 1000) break; from += 1000;
    }
    return out;
  };
  const [seasons, halls, leagues, clubs, comps, matches, site] = await Promise.all(
    ["seasons", "halls", "leagues", "clubs", "comps", "matches", "site"].map((t) => get(t)));
  const players = await get("players", state.isAdmin ? "players" : "players_public");
  leagues.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)); seasons.sort((a, b) => b.id.localeCompare(a.id));
  return {
    version: SEED_VERSION, site: site[0] ? { name: site[0].name || "", contact: site[0].contact || "" } : { name: "", contact: "" },
    seasons, halls, leagues: leagues.map((r) => fromRow("leagues", r)), clubs: clubs.map((r) => fromRow("clubs", r)),
    comps, players: players.map((r) => fromRow("players", r)), matches: matches.map((r) => fromRow("matches", r)),
  };
}

async function checkAdmin() {
  if (!sb || !state.session) return false;
  const { data, error } = await sb.from("admins").select("email").limit(1);
  return !error && data.length > 0;     // RLS: admin vidi tablicu admins, drugi ne
}

export async function refresh() {
  if (!sb) { set({ status: "offline" }); return; }
  try {
    const d = await fetchAll();
    if (!d.matches.length) { set({ mode: "remote", status: "empty" }); return; }
    set({ db: d, mode: "remote", status: "ready" });
  } catch (e) {
    set({ mode: "local", status: "offline" });       // npr. pregled bez pristupa mreži
  }
}

if (sb) {
  // ako se baza ne javi u 8 s, radi dalje s ugrađenim podacima
  const guard = setTimeout(() => { if (state.status === "loading") set({ status: "offline" }); }, 8000);
  (async () => {
    // javni podaci odmah, bez čekanja na prijavu
    const { data } = await sb.auth.getSession().catch(() => ({ data: {} }));
    state.session = data?.session || null;
    state.isAdmin = state.session ? await checkAdmin() : false;
    await refresh(); clearTimeout(guard);
  })();
  // VAŽNO: unutar ovog callbacka se ne smije čekati na druge Supabase pozive (zaključa se auth lock),
  // zato se posao odgađa s setTimeout
  sb.auth.onAuthStateChange((event, session) => {
    if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
    if ((session?.user?.id || null) === (state.session?.user?.id || null)) return;
    setTimeout(async () => {
      state.session = session; state.isAdmin = session ? await checkAdmin() : false; emit(); await refresh();
    }, 0);
  });
} else set({ status: "offline" });

export const signIn = async (email, password) => {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
};
export const signOut = () => sb?.auth.signOut();

// ---------- pisanje ----------
let queue = Promise.resolve();
async function pushDiff(prev, next) {
  for (const t of ORDER) {
    const a = Object.fromEntries((prev[t] || []).map((x, i) => [x.id, JSON.stringify(toRow(t, x, i))]));
    const rows = (next[t] || []).map((x, i) => toRow(t, x, i));
    const changed = rows.filter((r) => a[r.id] !== JSON.stringify(r));
    const gone = Object.keys(a).filter((id) => !rows.some((r) => r.id === id));
    if (changed.length) { const { error } = await sb.from(t).upsert(changed); if (error) throw error; }
    if (gone.length) { const { error } = await sb.from(t).delete().in("id", gone); if (error) throw error; }
  }
  if (JSON.stringify(prev.site) !== JSON.stringify(next.site)) {
    const { error } = await sb.from("site").upsert({ id: 1, ...next.site }); if (error) throw error;
  }
}
let timer = 0, base = null;
export function update(fn) {
  const prev = state.db, next = clone(prev); fn(next);
  set({ db: next });
  if (state.mode !== "remote") { persistLocal(); return; }
  if (!state.isAdmin) { set({ sync: "error", syncError: "Nisi prijavljen kao admin, promjena se ne sprema." }); return; }
  // skupi brze uzastopne izmjene (tipkanje) u jedno spremanje
  if (!base) base = prev;
  clearTimeout(timer);
  set({ sync: "saving" });
  timer = setTimeout(() => {
    const from = base, to = state.db; base = null;
    queue = queue.then(() => pushDiff(from, to))
      .then(() => set({ sync: "saved", syncError: "" }))
      .catch((e) => set({ sync: "error", syncError: e.message || String(e) }));
  }, 600);
}

export async function importSeed() {
  const s = clone(seed);
  for (const t of ORDER) {
    const rows = s[t].map((x, i) => toRow(t, x, i));
    for (let i = 0; i < rows.length; i += 400) {
      const { error } = await sb.from(t).upsert(rows.slice(i, i + 400)); if (error) throw new Error(`${t}: ${error.message}`);
    }
  }
  await sb.from("site").upsert({ id: 1, ...s.site });
  await refresh();
}

export function resetDB() { if (state.mode === "local") { set({ db: clone(seed) }); try { localStorage.removeItem(KEY); } catch { /* */ } } }

// ---------- React ----------
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
export const useStore = () => useSyncExternalStore(subscribe, () => state);
export const useDB = () => useSyncExternalStore(subscribe, () => state.db);
export const getDB = () => state.db;
export const uid = (p = "x") => p + Math.random().toString(36).slice(2, 9);
