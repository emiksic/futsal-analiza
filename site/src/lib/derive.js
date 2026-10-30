// Izvedeni podaci: rezultat, tablica, strijelci, formatiranje.

// prikaz imena po kategoriji (postavka lige): full | initial | number
let NAMES = {};
export function index(db) {
  NAMES = Object.fromEntries(db.leagues.map((l) => [l.category, l.privacy?.names || "full"]));
  const by = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
  return { club: by(db.clubs), player: by(db.players), hall: by(db.halls), league: by(db.leagues), comp: by(db.comps), season: by(db.seasons), match: by(db.matches) };
}

// Zone tablice: direct = izravno u polufinale, playoff = ukupno u doigravanju, qual = kvalifikacije, relegation = ispadanje
export function zoneOf(z = {}, i, n) {
  if (i < (z.direct || 0)) return "z-a2";
  if (i < (z.playoff || 0)) return "z-a";
  if (z.relegation && i >= n - z.relegation) return "z-b";
  if (z.qual && i >= n - (z.relegation || 0) - z.qual) return "z-q";
  return "";
}

// Konačni rezultat: ručno upisan (m.result) ili iz golova. Međurezultat samo kad su uneseni svi golovi.
export function score(m, upto = Infinity) {
  if (m.noScore) return null;
  const goals = m.events.filter((e) => e.type === "goal" || e.type === "owngoal");
  if (m.status === "scheduled" && !goals.length && !m.result) return null;
  if (m.result && (upto === Infinity || goals.length !== m.result[0] + m.result[1])) return upto === Infinity ? [...m.result] : null;
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
// vrijeme gola: s točnom sekundom kad je poznata (e.exact: Semafor sa sekundama ili očitano sa snimke), inače minuta
export const goalTime = (e) => e.exact && e.period <= 2 ? `${(e.period - 1) * 20 + Math.floor(e.sec / 60)}:${String(e.sec % 60).padStart(2, "0")}` : minute(e);
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
  const rows = Object.values(row).map((r) => ({ ...r, gd: r.gf - r.ga, form: r.form.slice(-5).reverse() }));
  // Kod istog broja bodova (propozicije SHMNL čl. 40, kadeti/juniori čl. 32):
  // gol-razlika, više postignutih golova, međusobne utakmice (bodovi, gol-razlika), fair-play (žuti −1, crveni −3).
  // Juniori/kadeti imaju i kriterij plasmana druge momčadi kluba, koji ovdje ne računamo.
  const fp = {};
  for (const m of ms) for (const e of m.events) {
    if (e.type === "yellow") fp[m[e.side]] = (fp[m[e.side]] || 0) + 1;
    if (e.type === "red") fp[m[e.side]] = (fp[m[e.side]] || 0) + 3;
  }
  const h2h = (ids) => {
    const t = Object.fromEntries(ids.map((i) => [i, { pts: 0, gd: 0 }]));
    for (const m of ms) {
      if (!t[m.home] || !t[m.away]) continue;
      const s = score(m); if (!s) continue;
      t[m.home].gd += s[0] - s[1]; t[m.away].gd += s[1] - s[0];
      if (s[0] > s[1]) t[m.home].pts += 3; else if (s[0] < s[1]) t[m.away].pts += 3; else { t[m.home].pts++; t[m.away].pts++; }
    }
    return t;
  };
  const groups = {};
  for (const r of rows) (groups[`${r.pts}|${r.gd}|${r.gf}`] ||= []).push(r.club);
  const H = {};
  for (const ids of Object.values(groups)) if (ids.length > 1) Object.assign(H, h2h(ids));
  const z = { pts: 0, gd: 0 };
  // juniori: kod istih bodova prednost ima klub s bolje plasiranom kadetskom momčadi (propozicije čl. 32)
  let K = {};
  if (comp.league === "juniori") {
    const kc = db.comps.find((c) => c.league === "kadeti" && c.season === comp.season);
    if (kc) standings(db, kc.id).forEach((r, i) => { K[r.club] = i; });
  }
  const kr = (c) => (c in K ? K[c] : 99);
  return rows.map((r) => ({ ...r, fp: fp[r.club] || 0 })).sort((a, b) => b.pts - a.pts || kr(a.club) - kr(b.club) || b.gd - a.gd || b.gf - a.gf
    || (H[b.club] || z).pts - (H[a.club] || z).pts || (H[b.club] || z).gd - (H[a.club] || z).gd
    || a.fp - b.fp || a.club.localeCompare(b.club));
}

// ---------- tijek rezultata i preokreti ----------
// Golovi redom s rezultatom nakon svakog. null ako golovi ne odgovaraju konačnom rezultatu.
export function flow(m) {
  if (m.status !== "finished") return null;
  const fin = score(m); if (!fin) return null;
  const goals = m.events.map((e, i) => [e, i]).filter(([e]) => e.type === "goal" || e.type === "owngoal")
    .sort((a, b) => absSec(a[0]) - absSec(b[0]) || a[1] - b[1]).map(([e]) => e);
  if (goals.length !== fin[0] + fin[1]) return null;
  const s = [0, 0], seq = [], worst = { home: [0, 0], away: [0, 0] }, def = { home: 0, away: 0 }, wi = { home: -1, away: -1 };
  for (const e of goals) {
    const h = (e.side === "home") !== (e.type === "owngoal");
    s[h ? 0 : 1]++;
    seq.push({ e, t: absSec(e), s: [...s], home: h });
    if (s[1] - s[0] > def.home) { def.home = s[1] - s[0]; worst.home = [...s]; wi.home = seq.length - 1; }
    if (s[0] - s[1] > def.away) { def.away = s[0] - s[1]; worst.away = [...s]; wi.away = seq.length - 1; }
  }
  return { seq, def, worst, wi, first: seq.length ? (seq[0].home ? "home" : "away") : null, final: [...s] };
}
// Preokret: ekipa koja je gubila pa prešla u vodstvo (bez obzira na konačni rezultat).
// Ako se dogodilo više puta, vrijedi onaj s najvećim zaostatkom (pa kasniji).
export function comeback(m) {
  const f = flow(m); if (!f) return null;
  let best = null;
  for (const side of ["home", "away"]) {
    const sign = side === "home" ? 1 : -1;
    let def = 0, from = null;
    for (const g of f.seq) {
      const d = sign * (g.s[0] - g.s[1]);
      if (-d > 0 && -d >= def) { def = -d; from = g.s; }   // zadnji trenutak najvećeg zaostatka
      if (d >= 1 && def > 0) {
        if (!best || def >= best.deficit) best = { side, deficit: def, from, lead: g.s, goal: g.e.id, t: g.t };
        def = 0; from = null;
      }
    }
  }
  if (!best) return null;
  const [h, a] = f.final, me = best.side === "home" ? h - a : a - h;
  return { ...best, final: f.final, res: me > 0 ? "W" : me === 0 ? "D" : "L" };
}
// rezultat iz perspektive ekipe
export const sideScore = (s, side) => side === "home" ? `${s[0]}:${s[1]}` : `${s[1]}:${s[0]}`;
// Po klubu: rezultati kad zabije/primi prvi, bodovi iz zaostatka, izgubljeni bodovi iz vodstva, golovi u zadnjih 5 minuta
export function formStats(db, compId) {
  const comp = db.comps.find((c) => c.id === compId); if (!comp) return [];
  const T = Object.fromEntries(comp.teams.map((t) => [t, { club: t, n: 0, fs: [0, 0, 0], cf: [0, 0, 0], ptsBehind: 0, ptsLost: 0, lateFor: 0, lateAg: 0 }]));
  for (const m of db.matches) {
    if (m.comp !== compId) continue;
    const f = flow(m); if (!f) continue;
    for (const side of ["home", "away"]) {
      const r = T[m[side]]; if (!r) continue;
      const [me, op] = side === "home" ? f.final : [f.final[1], f.final[0]];
      const res = me > op ? 0 : me === op ? 1 : 2, pts = [3, 1, 0][res];
      r.n++;
      if (f.first === side) r.fs[res]++; else if (f.first) r.cf[res]++;
      if (f.def[side] > 0) r.ptsBehind += pts;
      if (f.def[side === "home" ? "away" : "home"] > 0) r.ptsLost += 3 - pts;
      for (const g of f.seq) if (g.t >= 2100 && g.e.period === 2) { if (g.home === (side === "home")) r.lateFor++; else r.lateAg++; }
    }
  }
  return Object.values(T);
}
export function comebacks(db, compId) {
  const rank = { W: 0, D: 1, L: 2 };
  return db.matches.filter((m) => m.comp === compId).map((m) => ({ m, c: comeback(m) })).filter((x) => x.c)
    .sort((a, b) => b.c.deficit - a.c.deficit || rank[a.c.res] - rank[b.c.res] || b.m.date.localeCompare(a.m.date));
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
// Prezime: ručno upisano (p.last) ili procjena iz punog imena ("Vitor Hugo de Lima da Silva" -> "de Lima da Silva")
const PARTICLES = new Set(["de", "da", "do", "dos", "das", "del", "di", "van", "von", "le", "la"]);
export function surnameOf(p) {
  if (p?.last) return p.last;
  const t = (p?.name || "").trim().split(/\s+/);
  if (t.length < 2) return t[0] || "";
  const i = t.findIndex((w, k) => k > 0 && PARTICLES.has(w.toLowerCase()));
  return t.slice(i > 0 ? i : t.length - 1).join(" ");
}
// mladi igrači često mijenjaju broj; zapisnik (roster.num) ima broj koji je igrač nosio na toj utakmici
export function withMatchNumbers(ix, m) {
  const nums = { ...(m.roster?.home?.num || {}), ...(m.roster?.away?.num || {}) };
  if (!Object.keys(nums).length) return ix;
  const player = { ...ix.player };
  for (const [pid, n] of Object.entries(nums)) if (player[pid]) player[pid] = { ...player[pid], num: n };
  return { ...ix, player };
}
export function playerName(p) {
  if (!p) return "—";
  const fmt = NAMES[p.cat] || "full", n = (p.name || "").trim();
  if (!n || fmt === "number") return `Igrač #${p.num}`;
  const last = surnameOf(p);
  if (fmt === "last") return last;
  if (fmt === "initials") return `${n[0]}. ${(last || n)[0]}.${p.num ? ` #${p.num}` : ""}`;
  if (fmt === "initial") return last && last !== n ? `${n[0]}. ${last}` : n;
  return n;
}
export const NAME_FORMATS = { full: "Ime i prezime", initial: "Inicijal i prezime", last: "Samo prezime", initials: "Inicijali i broj", number: "Samo broj" };
export const perPlayerAllowed = (ix, compId) => ix.league[ix.comp[compId]?.league]?.privacy?.perPlayer !== false;
export const ANALYSIS_LABEL = { none: "Bez analize", queued: "Čeka obradu", processing: "U obradi", done: "Analizirano", failed: "Greška u obradi" };
export const STATUS_LABEL = { scheduled: "Zakazano", live: "Uživo", finished: "Kraj" };

export function compName(ix, compId) {
  const c = ix.comp[compId]; if (!c) return compId;
  return `${ix.league[c.league].name} ${ix.season[c.season].name}`;
}
export function currentRound(db, compId) {
  const ms = db.matches.filter((m) => m.comp === compId);
  const fin = ms.filter((m) => m.status === "finished" && Number.isFinite(m.round)).map((m) => m.round);   // isječci bez kola se preskaču
  return fin.length ? Math.max(...fin) : 1;
}
