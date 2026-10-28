// Izvedeni podaci: rezultat, tablica, strijelci, formatiranje.

// prikaz imena po kategoriji (postavka lige): full | initial | number
let NAMES = {};
export function index(db) {
  NAMES = Object.fromEntries(db.leagues.map((l) => [l.category, l.privacy?.names || "full"]));
  const by = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
  return { club: by(db.clubs), player: by(db.players), hall: by(db.halls), league: by(db.leagues), comp: by(db.comps), season: by(db.seasons), match: by(db.matches) };
}

export function score(m, upto = Infinity) {
  if (m.status === "scheduled" && !m.events.some((e) => e.type === "goal" || e.type === "owngoal")) return null;
  const s = [0, 0];
  for (const e of m.events) {
    if (absSec(e) > upto) continue;
    if (e.type === "goal") s[e.side === "home" ? 0 : 1]++;
    if (e.type === "owngoal") s[e.side === "home" ? 1 : 0]++;
  }
  return s;
}
export const absSec = (e) => (e.period - 1) * 1200 + e.sec;
export const minute = (e) => e.period > 2 ? `${40 + Math.floor(e.sec / 60) + 1}'` : `${(e.period - 1) * 20 + Math.floor(e.sec / 60) + 1}'`;
export const clock = (sec) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;

export function result(m, side) {
  const s = score(m); if (!s || m.status !== "finished") return null;
  const [a, b] = side === "home" ? s : [s[1], s[0]];
  return a > b ? "W" : a === b ? "D" : "L";
}

export function standings(db, compId) {
  const comp = db.comps.find((c) => c.id === compId); if (!comp) return [];
  const row = Object.fromEntries(comp.teams.map((t) => [t, { club: t, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] }]));
  const ms = db.matches.filter((m) => m.comp === compId && m.status === "finished").sort((a, b) => a.date.localeCompare(b.date));
  for (const m of ms) {
    const s = score(m); if (!s) continue;
    const H = row[m.home], A = row[m.away]; if (!H || !A) continue;
    H.p++; A.p++; H.gf += s[0]; H.ga += s[1]; A.gf += s[1]; A.ga += s[0];
    if (s[0] > s[1]) { H.w++; A.l++; H.pts += 3; H.form.push({ r: "W", m: m.id }); A.form.push({ r: "L", m: m.id }); }
    else if (s[0] < s[1]) { A.w++; H.l++; A.pts += 3; H.form.push({ r: "L", m: m.id }); A.form.push({ r: "W", m: m.id }); }
    else { H.d++; A.d++; H.pts++; A.pts++; H.form.push({ r: "D", m: m.id }); A.form.push({ r: "D", m: m.id }); }
  }
  return Object.values(row).map((r) => ({ ...r, gd: r.gf - r.ga, form: r.form.slice(-5).reverse() }))
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.club.localeCompare(b.club));
}

export function scorers(db, compId) {
  const t = {};
  for (const m of db.matches) {
    if (m.comp !== compId || m.status !== "finished") continue;
    for (const side of ["home", "away"]) for (const pid of m.roster[side]?.players || []) {
      (t[pid] ||= { player: pid, club: m[side], goals: 0, assists: 0, apps: 0 }).apps++;
    }
    for (const e of m.events) {
      if (e.type === "goal" && e.player) (t[e.player] ||= { player: e.player, club: m[e.side], goals: 0, assists: 0, apps: 0 }).goals++;
      if (e.type === "goal" && e.assist) (t[e.assist] ||= { player: e.assist, club: m[e.side], goals: 0, assists: 0, apps: 0 }).assists++;
    }
  }
  return Object.values(t).filter((x) => x.goals || x.assists).sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.apps - b.apps);
}

export function fouls(m, side, period) {
  return m.events.filter((e) => e.type === "foul" && e.side === side && e.period === period).length;
}

const DAYS = ["ned", "pon", "uto", "sri", "čet", "pet", "sub"];
export const fmtDay = (iso) => { const d = new Date(iso); return `${DAYS[d.getDay()]}, ${d.getDate()}. ${d.getMonth() + 1}.`; };
export const fmtDate = (iso) => { const d = new Date(iso); return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}.`; };
export const fmtTime = (iso) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
export const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

// kadeti (U-17, maloljetnici): javno se prikazuje samo broj
export function playerName(p) {
  if (!p) return "—";
  const fmt = NAMES[p.cat] || "full", n = (p.name || "").trim();
  if (!n || fmt === "number") return `Igrač #${p.num}`;
  if (fmt === "initial") { const parts = n.split(/\s+/); return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(" ")}` : n; }
  return n;
}
export const NAME_FORMATS = { full: "Ime i prezime", initial: "Inicijal i prezime", number: "Samo broj" };
export const perPlayerAllowed = (ix, compId) => ix.league[ix.comp[compId]?.league]?.privacy?.perPlayer !== false;
export const ANALYSIS_LABEL = { none: "Bez analize", queued: "Čeka obradu", processing: "U obradi", done: "Analizirano", failed: "Greška u obradi" };
export const STATUS_LABEL = { scheduled: "Zakazano", live: "Uživo", finished: "Kraj" };

export function compName(ix, compId) {
  const c = ix.comp[compId]; if (!c) return compId;
  return `${ix.league[c.league].name} ${ix.season[c.season].name}`;
}
export function currentRound(db, compId) {
  const ms = db.matches.filter((m) => m.comp === compId);
  const fin = ms.filter((m) => m.status === "finished").map((m) => m.round);
  return fin.length ? Math.max(...fin) : 1;
}
