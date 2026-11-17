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

// Zbirna tablica kadeta i juniora (propozicije čl. 31 i 32): zbroj bodova obje momčadi kluba,
// kod istih bodova bolji plasman kadetske momčadi, zatim zbirna gol-razlika i više golova.
// Posljednji ispada, pretposljednji igra kvalifikacije.
export const YOUTH = ["juniori", "kadeti"];
export function combinedTable(db, compId) {
  const comp = db.comps.find((c) => c.id === compId);
  if (!comp || !YOUTH.includes(comp.league)) return [];
  const cs = YOUTH.map((l) => db.comps.find((c) => c.league === l && c.season === comp.season));
  if (cs.some((c) => !c)) return [];
  const [J, K] = cs.map((c) => standings(db, c.id));
  const kpos = Object.fromEntries(K.map((r, i) => [r.club, i]));
  const t = {};
  for (const r of [...J, ...K]) {
    const x = (t[r.club] ||= { club: r.club, p: 0, pts: 0, gd: 0, gf: 0 });
    x.p += r.p; x.pts += r.pts; x.gd += r.gd; x.gf += r.gf;
  }
  const kr = (c) => (c in kpos ? kpos[c] : 99);
  return Object.values(t).sort((a, b) => b.pts - a.pts || kr(a.club) - kr(b.club) || b.gd - a.gd || b.gf - a.gf || a.club.localeCompare(b.club));
}
// oznaka ispadanja/kvalifikacija po klubu iz zbirne tablice
export function combinedZones(db, compId) {
  const T = combinedTable(db, compId);
  if (!T.some((r) => r.p)) return {};
  const n = T.length, out = {};
  if (n >= 1) out[T[n - 1].club] = "z-b";
  if (n >= 2) out[T[n - 2].club] = "z-q";
  return out;
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
// minuta = započeta minuta, ali točno na cijeloj minuti ostaje ta minuta (10:00 → 10', 10:01 → 11', 0:00 → 1')
const minOf = (sec) => Math.max(1, Math.ceil(sec / 60));
export const minute = (e) => e.period > 2 ? `${40 + minOf(e.sec)}'` : `${(e.period - 1) * 20 + minOf(e.sec)}'`;
// vrijeme gola: s točnom sekundom kad je poznata (e.exact: Semafor sa sekundama ili očitano sa snimke), inače minuta
// karton bez minute (Semafor je nema): e.noTime, period/sec su tada kraj 2. poluvremena samo radi redoslijeda
export const NO_TIME = { period: 2, sec: 1200, noTime: true };
export const goalTime = (e) => e.noTime ? "–" : e.exact && e.period <= 2 ? `${(e.period - 1) * 20 + Math.floor(e.sec / 60)}:${String(e.sec % 60).padStart(2, "0")}` : minute(e);
export const clock = (sec) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;

// Kup: liga s zones.cup; kola su faze natjecanja
export const isCup = (L) => !!L?.zones?.cup;
export const CUP_STAGES = ["1/16 finala", "1/8 finala", "Četvrtfinale", "Polufinale", "Finale"];
export const roundName = (L, r) => isCup(L) ? (CUP_STAGES[r - 1] || `${r}. krug`) : `${r}. kolo`;
// kazneni udarci nakon utakmice (događaji "so"), [domaćin, gost] ili null
export function shootout(m) {
  const so = m.events.filter((e) => e.type === "so"); if (!so.length) return null;
  const s = [0, 0]; for (const e of so) if (e.scored) s[e.side === "home" ? 0 : 1]++;
  return s;
}
// 1 = domaćin, -1 = gost, 0 = neriješeno, null = nije odigrano (kod kupa odlučuju i kazneni udarci)
export function winner(m) {
  const s = score(m); if (!s || m.status !== "finished") return null;
  if (s[0] !== s[1]) return s[0] > s[1] ? 1 : -1;
  const p = shootout(m); return p && p[0] !== p[1] ? (p[0] > p[1] ? 1 : -1) : 0;
}

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
  if (me <= 0) return null;     // preokret se broji samo kad ekipa koja je gubila i pobijedi (u regularnom dijelu)
  return { ...best, final: f.final, res: "W" };
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
// Tablica za dio sezone: doma, u gostima, 1. ili 2. poluvrijeme (rezultat samo tog poluvremena).
// Poluvremena se računaju samo iz utakmica u kojima su uneseni svi golovi s minutama.
export function standingsView(db, compId, view) {
  const comp = db.comps.find((c) => c.id === compId); if (!comp) return { rows: [], skipped: 0 };
  const row = Object.fromEntries(comp.teams.map((t) => [t, { club: t, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] }]));
  let skipped = 0;
  const ms = db.matches.filter((m) => m.comp === compId && m.status === "finished").sort((a, b) => a.date.localeCompare(b.date));
  for (const m of ms) {
    let s = score(m); if (!s) continue;
    if (view === "h1" || view === "h2") {
      const ht = score(m, 1199); if (!ht) { skipped++; continue; }
      const f = flow(m); if (!f) { skipped++; continue; }
      const reg = f.final;                                 // regularni dio (bez kaznenih udaraca)
      s = view === "h1" ? ht : [reg[0] - ht[0], reg[1] - ht[1]];
    }
    for (const side of ["home", "away"]) {
      if (view === "home" && side !== "home") continue;
      if (view === "away" && side !== "away") continue;
      const r = row[m[side]]; if (!r) continue;
      const [me, op] = side === "home" ? s : [s[1], s[0]];
      r.p++; r.gf += me; r.ga += op;
      const res = me > op ? "W" : me === op ? "D" : "L";
      r[{ W: "w", D: "d", L: "l" }[res]]++; r.pts += { W: 3, D: 1, L: 0 }[res];
      r.form.push({ r: res, m: m.id });
    }
  }
  const rows = Object.values(row).map((r) => ({ ...r, gd: r.gf - r.ga, form: r.form.slice(-5).reverse() }))
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.club.localeCompare(b.club));
  return { rows, skipped };
}

// ---------- kartoni ----------
// 4 žuta = 1 utakmica zabrane (propozicije SHMNL čl. 18, kadeti/juniori čl. 14); crveni = automatska zabrana.
export const YELLOW_BAN = 4;
export function cardsTable(db, compId) {
  const t = {}, lastMatch = {};
  const ms = db.matches.filter((m) => m.comp === compId && m.status === "finished").sort((a, b) => a.date.localeCompare(b.date));
  for (const m of ms) {
    for (const side of ["home", "away"]) lastMatch[m[side]] = m;
    for (const e of m.events) {
      if ((e.type !== "yellow" && e.type !== "red") || !e.player) continue;
      const r = (t[e.player] ||= { player: e.player, club: m[e.side], y: 0, r: 0, lastRed: null });
      if (e.type === "yellow") r.y++;
      else { r.r++; r.lastRed = m.id; if (e.secondYellow) r.y = Math.max(0, r.y - 1); }   // drugi žuti se ne broji u nakupljanje
    }
  }
  return Object.values(t).map((r) => ({
    ...r,
    toBan: YELLOW_BAN - (r.y % YELLOW_BAN),                       // koliko žutih do sljedeće kazne
    redNow: !!r.lastRed && lastMatch[r.club]?.id === r.lastRed,    // isključen na zadnjoj utakmici kluba
  })).sort((a, b) => b.r - a.r || b.y - a.y);
}

// Tko ne smije igrati utakmicu m zbog kartona s prethodne utakmice svog kluba u istom natjecanju:
// crveni karton (i drugi žuti) ili nakupljeni 4., 8., … žuti. Nakon odrađene kazne brojanje kreće ispočetka
// (4 žuta = kazna, sljedeća kazna na 8. žutom). Žuti uz drugi žuti na istoj utakmici ne ulazi u nakupljanje.
export function suspensions(db, m) {
  const out = { home: [], away: [] };
  const comp = db.comps.find((c) => c.id === m.comp), L = comp && db.leagues.find((l) => l.id === comp.league);
  if (!comp || L?.zones?.cup) return out;
  const ms = db.matches.filter((x) => x.comp === m.comp && x.status === "finished" && x.date < m.date && x.id !== m.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const yellowsIn = (x, club) => {
    const sy = new Set(x.events.filter((e) => e.type === "red" && e.secondYellow && e.player).map((e) => e.player)), c = {};
    for (const e of x.events) if (e.type === "yellow" && e.player && x[e.side] === club && !sy.has(e.player)) c[e.player] = (c[e.player] || 0) + 1;
    return c;
  };
  for (const side of ["home", "away"]) {
    const club = m[side]; if (!club) continue;
    const prev = [...ms].reverse().find((x) => x.home === club || x.away === club); if (!prev) continue;
    const before = {};
    for (const x of ms) { if (x === prev) break; if (x.home !== club && x.away !== club) continue;
      for (const [p, n] of Object.entries(yellowsIn(x, club))) before[p] = (before[p] || 0) + n; }
    const red = new Set(prev.events.filter((e) => e.type === "red" && e.player && prev[e.side] === club).map((e) => e.player));
    for (const p of red) out[side].push({ player: p, reason: "isključenje na prošloj utakmici" });
    for (const [p, n] of Object.entries(yellowsIn(prev, club))) {
      const b = before[p] || 0, a = b + n;
      if (!red.has(p) && Math.floor(a / YELLOW_BAN) > Math.floor(b / YELLOW_BAN)) out[side].push({ player: p, reason: `${a}. žuti karton` });
    }
  }
  return out;
}
// tko je suspendiran za sljedeću utakmicu svog kluba (za karticu Kartoni)
export function suspendedNext(db, compId) {
  const comp = db.comps.find((c) => c.id === compId); if (!comp) return [];
  return comp.teams.flatMap((club) => suspensions(db, { id: "_", comp: compId, date: "9999", home: club, away: null }).home.map((s) => ({ ...s, club })));
}

// ---------- golovi po minutama i poluvrijeme/kraj ----------
export const BINS = ["0–5", "5–10", "10–15", "15–20", "20–25", "25–30", "30–35", "35–40"];
export function goalBins(db, compId) {
  const comp = db.comps.find((c) => c.id === compId); if (!comp) return { rows: [], n: 0 };
  const T = Object.fromEntries(comp.teams.map((c) => [c, { club: c, f: Array(8).fill(0), a: Array(8).fill(0) }]));
  let n = 0;
  for (const m of db.matches) {
    if (m.comp !== compId) continue;
    const fl = flow(m); if (!fl) continue; n++;
    for (const g of fl.seq) {
      if (g.e.period > 2) continue;
      const b = Math.min(7, Math.floor(g.t / 300)), scorer = g.home ? m.home : m.away, other = g.home ? m.away : m.home;
      if (T[scorer]) T[scorer].f[b]++; if (T[other]) T[other].a[b]++;
    }
  }
  return { rows: Object.values(T), n };
}
// za svaki klub: stanje na poluvremenu (vodi / neriješeno / gubi) -> ishod (P / N / I)
export function htft(db, compId) {
  const comp = db.comps.find((c) => c.id === compId); if (!comp) return [];
  const T = Object.fromEntries(comp.teams.map((c) => [c, { club: c, lead: [0, 0, 0], level: [0, 0, 0], trail: [0, 0, 0] }]));
  for (const m of db.matches) {
    if (m.comp !== compId) continue;
    const fl = flow(m); if (!fl) continue;
    const ht = score(m, 1199); if (!ht) continue;
    for (const side of ["home", "away"]) {
      const r = T[m[side]]; if (!r) continue;
      const [h1, h2] = side === "home" ? ht : [ht[1], ht[0]], [f1, f2] = side === "home" ? fl.final : [fl.final[1], fl.final[0]];
      const res = f1 > f2 ? 0 : f1 === f2 ? 1 : 2;
      r[h1 > h2 ? "lead" : h1 === h2 ? "level" : "trail"][res]++;
    }
  }
  return Object.values(T);
}

export function comebacks(db, compId) {
  const rank = { W: 0, D: 1, L: 2 };
  return db.matches.filter((m) => m.comp === compId).map((m) => ({ m, c: comeback(m) })).filter((x) => x.c)
    .sort((a, b) => b.c.deficit - a.c.deficit || rank[a.c.res] - rank[b.c.res] || b.m.date.localeCompare(a.m.date));
}

// Transfer: isti igrač u više klubova ima zajednički ključ osobe (players.person); bez njega je svaki zapis zasebna osoba.
export const personOf = (p) => (p && p.person) || p?.id;
// Strijelci natjecanja. merge (zadano): povezani igrači (transfer) broje se kao jedan, s klubom iz zadnje utakmice
// i popisom ranijih klubova (prev). Stranica kluba traži merge: false (samo nastupi za taj klub).
export function scorers(db, compId, { merge = true } = {}) {
  const P = Object.fromEntries(db.players.map((p) => [p.id, p]));
  const keyOf = (pid) => (merge ? personOf(P[pid]) || pid : pid);
  const t = {};
  const row = (pid, club, date) => {
    const r = (t[keyOf(pid)] ||= { player: pid, club, goals: 0, assists: 0, apps: 0, last: "", clubs: [] });
    if (date >= r.last) { r.last = date; r.player = pid; r.club = club; }
    if (!r.clubs.includes(club)) r.clubs.push(club);
    return r;
  };
  const ms = db.matches.filter((m) => m.comp === compId && m.status === "finished").sort((a, b) => a.date.localeCompare(b.date));
  for (const m of ms) {
    for (const side of ["home", "away"]) for (const pid of m.roster[side]?.players || []) row(pid, m[side], m.date).apps++;
    for (const e of m.events) {
      if (e.type === "goal" && e.player) row(e.player, m[e.side], m.date).goals++;
      if (e.type === "goal" && e.assist) row(e.assist, m[e.side], m.date).assists++;
    }
  }
  const list = Object.values(t).map(({ last, clubs, ...r }) => ({ ...r, prev: clubs.filter((c) => c !== r.club) }))
    .filter((x) => x.goals || x.assists).sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.apps - b.apps);
  // mjesto: isti broj golova = isto mjesto, sljedeći preskače (1, 1, 1, 4, …)
  list.forEach((r, i) => { r.rank = i && list[i - 1].goals === r.goals ? list[i - 1].rank : i + 1; });
  return list;
}

export function fouls(m, side, period) {
  return m.events.filter((e) => e.type === "foul" && e.side === side && e.period === period).length;
}

const DAYS = ["ned", "pon", "uto", "sri", "čet", "pet", "sub"];
export const fmtDay = (iso) => { const d = new Date(iso); return `${DAYS[d.getDay()]}, ${d.getDate()}. ${d.getMonth() + 1}.`; };
export const fmtDate = (iso) => { const d = new Date(iso); return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}.`; };
export const fmtTime = (iso) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
// kolo bez objavljenog termina: vikend u kojem se igra (petak – nedjelja)
export const fmtWeekend = (iso) => {
  const d = new Date(iso), back = { 5: 0, 6: 1, 0: 2 }[d.getDay()] ?? d.getDay() - 5;
  const f = new Date(d); f.setDate(d.getDate() - back); const n = new Date(f); n.setDate(f.getDate() + 2);
  return `pet ${f.getDate()}. ${f.getMonth() + 1}. – ned ${n.getDate()}. ${n.getMonth() + 1}.`;
};
// naslov dana u rasporedu: za utakmice bez termina cijeli vikend
// kup usred tjedna: raspon dana (dateTo, npr. uto – sri) ili jedan poznati dan
export const dayLabel = (m) => {
  if (!m.timeTbd) return fmtDay(m.date);
  if (m.dateTo) return `${fmtDay(m.date)} – ${fmtDay(m.dateTo)}`;
  return [5, 6, 0].includes(new Date(m.date).getDay()) ? fmtWeekend(m.date) : fmtDay(m.date);
};
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
// kratko ime za traku golova: "I. Prezime" (stroža pravila privatnosti ostaju)
export function shortName(p) {
  const n = playerName(p);
  if (!p || (NAMES[p.cat] || "full") !== "full") return n;
  const last = surnameOf(p), full = (p.name || "").trim();
  return last && last !== full ? `${full[0]}. ${last}` : n;
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

// ---------- minute u vodstvu (kao "laps led" u F1) ----------
// Regularnih 40 minuta podijeljeno na vrijeme u kojem je vodio domaćin, bilo neriješeno ili vodio gost.
// Bez točne sekunde gol se računa u sredini minute, pa je točnost oko ±30 s po golu.
export const REG = 2400;
export function leadTime(m) {
  const f = flow(m); if (!f) return null;
  const segs = []; let t0 = 0, d = 0;
  const push = (t1) => {
    const a = Math.min(t0, REG), b = Math.min(t1, REG); if (b <= a) return;
    const k = d > 0 ? "home" : d < 0 ? "away" : "level", last = segs[segs.length - 1];
    if (last && last.k === k) last.b = b; else segs.push({ k, a, b });
  };
  for (const g of f.seq) { push(g.t); t0 = g.t; d = g.s[0] - g.s[1]; }
  push(REG);
  const T = { home: 0, level: 0, away: 0, longest: { home: 0, away: 0 }, segs };
  for (const x of segs) { T[x.k] += x.b - x.a; if (x.k !== "level") T.longest[x.k] = Math.max(T.longest[x.k], x.b - x.a); }
  return T;
}
export const mins = (sec) => Math.round(sec / 60);
// Po klubu za natjecanje: vrijeme u vodstvu / neriješeno / u zaostatku, najduže neprekinuto vodstvo, utakmice bez zaostatka
export function leadTable(db, compId) {
  const comp = db.comps.find((c) => c.id === compId); if (!comp) return [];
  const T = Object.fromEntries(comp.teams.map((t) => [t, { club: t, n: 0, lead: 0, level: 0, trail: 0, longest: 0, longestM: null, neverBehind: 0 }]));
  for (const m of db.matches) {
    if (m.comp !== compId) continue;
    const L = leadTime(m); if (!L) continue;
    for (const side of ["home", "away"]) {
      const r = T[m[side]]; if (!r) continue;
      const op = side === "home" ? "away" : "home";
      r.n++; r.lead += L[side]; r.level += L.level; r.trail += L[op];
      if (!L[op]) r.neverBehind++;
      if (L.longest[side] > r.longest) { r.longest = L.longest[side]; r.longestM = m.id; }
    }
  }
  return Object.values(T).filter((r) => r.n).map((r) => ({ ...r, pct: r.lead / (r.n * REG) }))
    .sort((a, b) => b.pct - a.pct || a.trail - b.trail || a.club.localeCompare(b.club));
}

// Mjesto svake ekipe nakon svakog odigranog kola: { played: [kola], order: [klubovi po trenutnom poretku], pos: { klub: [mjesto po kolu] } }
export function positionsByRound(db, compId) {
  const played = [...new Set(db.matches.filter((m) => m.comp === compId && m.status === "finished").map((m) => m.round))].sort((a, b) => a - b);
  const pos = {};
  for (const r of played) {
    const rows = standings({ ...db, matches: db.matches.filter((m) => m.comp !== compId || m.round <= r) }, compId);
    rows.forEach((x, i) => { (pos[x.club] ||= []).push(i + 1); });
  }
  return { played, order: standings(db, compId).map((x) => x.club), pos };
}

// ---------- provjere za admin ----------
// Vraća popis upozorenja za utakmicu: [{ text, tab }] (tab = kartica u uređivanju gdje se popravlja).
export function matchIssues(m, ix, now = Date.now()) {
  const out = [];
  const nm = (pid) => (ix.player[pid] ? playerName(ix.player[pid]) : "nepoznat igrač");
  const team = (side) => ix.club[m[side]]?.name || side;
  const R = m.roster || {};
  const hasRoster = (side) => (R[side]?.players || []).length > 0;
  const t = new Date(m.date).getTime();
  if (m.status === "scheduled" && !m.timeTbd && now - t > 3 * 3600e3) out.push({ text: "Utakmica je prošla, a status je i dalje Zakazano", tab: "osnovno" });
  if (m.status === "live" && now - t > 4 * 3600e3) out.push({ text: "Utakmica je i dalje označena kao Uživo (više od 4 h od početka)", tab: "osnovno" });
  if (m.status !== "finished") return out;
  if (!hasRoster("home") || !hasRoster("away")) out.push({ text: `Kraj bez zapisnika: ${[!hasRoster("home") && team("home"), !hasRoster("away") && team("away")].filter(Boolean).join(" i ")}`, tab: "zapisnik" });
  if (m.noScore) return out;
  const g = [0, 0];
  for (const e of m.events) {
    if (e.type === "goal") g[e.side === "home" ? 0 : 1]++;
    if (e.type === "owngoal") g[e.side === "home" ? 1 : 0]++;
  }
  if (m.result && (g[0] || g[1] || m.result[0] || m.result[1]) && (g[0] !== m.result[0] || g[1] !== m.result[1])) {
    out.push({ text: g[0] + g[1] === 0 ? `Rezultat ${m.result[0]}:${m.result[1]}, a nije upisan nijedan gol` : `Rezultat ${m.result[0]}:${m.result[1]}, a upisani golovi daju ${g[0]}:${g[1]}`, tab: "dogadaji" });
  }
  const noScorer = m.events.filter((e) => e.type === "goal" && !e.player).length;
  if (noScorer) out.push({ text: `${noScorer} ${noScorer === 1 ? "gol nema" : "gola nemaju"} upisanog strijelca`, tab: "dogadaji" });
  const LBL = { goal: "Strijelac", owngoal: "Autogol", yellow: "Žuti karton", red: "Crveni karton", penmiss: "Promašen penal", so: "Kazneni udarac" };
  for (const e of m.events) {
    const side = e.side; if (!hasRoster(side)) continue;
    const inR = (pid) => R[side].players.includes(pid);
    if (e.player && LBL[e.type] && !e.staff && !inR(e.player)) out.push({ text: `${LBL[e.type]} ${minute(e)}: ${nm(e.player)} nije u zapisniku (${team(side)})`, tab: "dogadaji" });
    if (e.type === "goal" && e.assist && !inR(e.assist)) out.push({ text: `Asistencija ${minute(e)}: ${nm(e.assist)} nije u zapisniku (${team(side)})`, tab: "dogadaji" });
  }
  return out;
}

// ---------- rekordi sezone (kartica Rekordi u ligi) ----------
// Svaki rekord: { key, label, value (broj za usporedbu), rows: [{ m, text, sub, value }] } — izjednačeni su svi u rows (najviše 3 + ostatak u more).
export function seasonRecords(db, ix, compId) {
  const L = ix.league[ix.comp[compId]?.league]; if (!L) return null;
  const cup = !!L.zones?.cup;
  const fin = db.matches.filter((m) => m.comp === compId && m.status === "finished" && score(m)).sort((a, b) => a.date.localeCompare(b.date));
  if (!fin.length) return null;
  const per = perPlayerAllowed(ix, compId);
  const S = new Map(fin.map((m) => [m, score(m)]));
  const nm = (id) => ix.club[id]?.name || "";
  const vs = (m) => `${nm(m.home)} ${S.get(m)[0]}:${S.get(m)[1]} ${nm(m.away)}`;
  const rnd = (m) => (m.round ? roundName(L, m.round) : fmtDate(m.date));
  const top = (arr, key, max = true) => {
    if (!arr.length) return [];
    const v = arr.reduce((x, y) => (max ? Math.max : Math.min)(x, key(y)), max ? -Infinity : Infinity);
    return arr.filter((x) => key(x) === v);
  };
  const recs = [];
  const add = (key, label, list, fmt) => {
    if (!list.length) return;
    recs.push({ key, label, value: fmt.value(list[0]), rows: list.slice(0, 3).map(fmt.row), more: Math.max(0, list.length - 3) });
  };
  const golova = (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "gol" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "gola" : "golova"}`;
  const diff = (m) => Math.abs(S.get(m)[0] - S.get(m)[1]), sum = (m) => S.get(m)[0] + S.get(m)[1];

  add("big", "Najveća pobjeda", top(fin, diff).filter((m) => diff(m) > 0), { value: (m) => `+${diff(m)}`, row: (m) => ({ m, text: vs(m), sub: rnd(m) }) });
  add("most", "Najviše golova na utakmici", top(fin, sum).filter((m) => sum(m) > 0), { value: (m) => golova(sum(m)), row: (m) => ({ m, text: vs(m), sub: rnd(m) }) });
  const tg = fin.flatMap((m) => [["home", 0], ["away", 1]].map(([side, i]) => ({ m, side, n: S.get(m)[i] })));
  add("team", "Najviše golova jednog kluba", top(tg, (x) => x.n).filter((x) => x.n > 0), { value: (x) => golova(x.n), row: (x) => ({ m: x.m, club: x.m[x.side], text: nm(x.m[x.side]), sub: `protiv ${nm(x.m[x.side === "home" ? "away" : "home"])}, ${rnd(x.m)}` }) });

  const goals = fin.flatMap((m) => m.events.filter((e) => (e.type === "goal" || e.type === "owngoal") && Number.isFinite(e.sec) && !e.noTime && e.period <= 2)
    .map((e) => ({ m, e, side: (e.side === "home") !== (e.type === "owngoal") ? "home" : "away" })));
  const gRow = (g) => {
    const p = per && g.e.type === "goal" ? ix.player[g.e.player] : null, c = g.m[g.side], o = g.m[g.side === "home" ? "away" : "home"];
    return { m: g.m, club: c, player: p?.id, text: p ? playerName(p) : nm(c), sub: `${p ? nm(c) + ", " : ""}protiv ${nm(o)}${g.e.type === "owngoal" ? " (autogol)" : ""}, ${rnd(g.m)}` };
  };

  const halves = fin.flatMap((m) => [1, 2].map((p) => ({ m, p, n: m.events.filter((e) => (e.type === "goal" || e.type === "owngoal") && e.period === p).length })));
  add("half", "Najviše golova u poluvremenu", top(halves, (x) => x.n).filter((x) => x.n > 0), { value: (x) => golova(x.n), row: (x) => ({ m: x.m, text: vs(x.m), sub: `${x.p}. poluvrijeme, ${rnd(x.m)}` }) });

  const cbs = fin.map((m) => ({ m, c: comeback(m) })).filter((x) => x.c);
  add("comeback", "Najveći preokret", top(cbs, (x) => x.c.deficit), { value: (x) => `iz −${x.c.deficit}`, row: ({ m, c }) => {
    const fr = c.side === "home" ? c.from : [c.from[1], c.from[0]];
    return { m, club: m[c.side], text: nm(m[c.side]), sub: `s ${fr[0]}:${fr[1]} do pobjede protiv ${nm(m[c.side === "home" ? "away" : "home"])}, ${rnd(m)}` };
  } });

  if (per) {
    const pm = fin.flatMap((m) => { const t = {}; for (const e of m.events) if (e.type === "goal" && e.player) (t[e.player] ||= { m, p: e.player, side: e.side, n: 0 }).n++; return Object.values(t); });
    add("player", "Najviše golova igrača na utakmici", top(pm, (x) => x.n).filter((x) => x.n >= 2), { value: (x) => golova(x.n), row: (x) => ({ m: x.m, club: x.m[x.side], player: x.p, text: playerName(ix.player[x.p]), sub: `${nm(x.m[x.side])}, protiv ${nm(x.m[x.side === "home" ? "away" : "home"])}, ${rnd(x.m)}` }) });
    const hat = pm.filter((x) => x.n >= 3);
    if (hat.length) recs.push({ key: "hat", label: "Hat-trickovi", value: String(hat.length), rows: hat.slice(-3).reverse().map((x) => ({ m: x.m, club: x.m[x.side], player: x.p, text: playerName(ix.player[x.p]), sub: `${golova(x.n)} protiv ${nm(x.m[x.side === "home" ? "away" : "home"])}, ${rnd(x.m)}` })), more: Math.max(0, hat.length - 3) });
  }

  if (!cup) {
    // nizovi po klubu, redom po datumu
    const streak = (test) => {
      const best = [];
      for (const club of new Set(fin.flatMap((m) => [m.home, m.away]))) {
        let run = [], top0 = [];
        for (const m of fin) {
          if (m.home !== club && m.away !== club) continue;
          const w = winner(m), r = w === 0 ? "D" : (w === 1) === (m.home === club) ? "W" : "L";
          if (test(r)) { run.push(m); if (run.length > top0.length) top0 = [...run]; } else run = [];
        }
        if (top0.length) best.push({ club, n: top0.length, from: top0[0], to: top0[top0.length - 1], open: run.length === top0.length && run.length > 0 });
      }
      return top(best, (x) => x.n);
    };
    const sRow = (x) => ({ club: x.club, text: nm(x.club), sub: `${rnd(x.from)} – ${rnd(x.to)}${x.open ? " · niz traje" : ""}` });
    const nUt = (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "utakmica" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "utakmice" : "utakmica"}`;
    add("wins", "Najduži niz pobjeda", streak((r) => r === "W").filter((x) => x.n >= 2), { value: (x) => nUt(x.n), row: sRow });
    add("unbeaten", "Najduži niz bez poraza", streak((r) => r !== "L").filter((x) => x.n >= 2), { value: (x) => nUt(x.n), row: sRow });
  }
  const cardsOf = (m) => m.events.filter((e) => e.type === "yellow" || e.type === "red").length;
  add("cards", "Najviše kartona na utakmici", top(fin, cardsOf).filter((m) => cardsOf(m) > 0), { value: (m) => String(cardsOf(m)), row: (m) => ({ m, text: vs(m), sub: rnd(m) }) });

  const total = fin.reduce((a, m) => a + sum(m), 0);
  const wdl = [0, 0, 0]; for (const m of fin) { const [h, a] = S.get(m); wdl[h > a ? 0 : h === a ? 1 : 2]++; }
  return { n: fin.length, goals: total, avg: total / fin.length, wdl, recs };
}
