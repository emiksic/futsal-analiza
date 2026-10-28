// Početni (demo) podaci. Sve što je ovdje izmišljeno označeno je s demo: true.
// Pravi podaci: zapisnici RIJ i NVR (brojevi), dvije analizirane snimke (u1, u2).
// Kad dođe backend, ovo se zamjenjuje stvarnom bazom.

export const SEED_VERSION = 6;

function rng(seed) {                       // deterministički PRNG (mulberry32)
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const leagues = [
  { id: "1-hmnl", name: "1. HMNL", category: "Seniori", zones: { playoff: 8, relegation: 1 }, privacy: { names: "full", perPlayer: true } },
  { id: "juniori", name: "1. HMNL juniori", category: "U-19", zones: { playoff: 4, relegation: 0 }, privacy: { names: "initial", perPlayer: true } },
  { id: "kadeti", name: "1. HMNL kadeti", category: "U-17", zones: { playoff: 4, relegation: 0 }, privacy: { names: "number", perPlayer: false } },
];
const seasons = [
  { id: "2026-27", name: "2026./27." },
  { id: "2025-26", name: "2025./26." },
];

const halls = [
  { id: "zamet", name: "Dvorana Zamet", city: "Rijeka", calibrated: true },
  { id: "dom-sportova", name: "Dom sportova", city: "Zagreb", calibrated: true },
  { id: "makarska", name: "Gradska sportska dvorana", city: "Makarska", calibrated: false },
  { id: "omis", name: "Sportska dvorana Ribnjak", city: "Omiš", calibrated: false },
  { id: "pula", name: "Dom mladosti", city: "Pula", calibrated: false },
  { id: "dubrovnik", name: "Dvorana Gospino polje", city: "Dubrovnik", calibrated: false },
  { id: "sibenik", name: "Dvorana Baldekin", city: "Šibenik", calibrated: false },
  { id: "vrgorac", name: "Gradska dvorana", city: "Vrgorac", calibrated: false },
  { id: "split", name: "Dvorana Gripe", city: "Split", calibrated: false },
  { id: "osijek", name: "Dvorana Gradski vrt", city: "Osijek", calibrated: false },
];

// kit: shirt = boja dresa, trim = rukavi/ovratnik, num = boja broja
const clubs = [
  { id: "rijeka", name: "Rijeka", short: "RIJ", city: "Rijeka", hall: "zamet", kit: { shirt: "#ffffff", trim: "#1f4f9c", num: "#2a6fd6" } },
  { id: "novo-vrijeme", name: "Novo Vrijeme", short: "NVR", city: "Makarska", hall: "makarska", kit: { shirt: "#8c3cc8", trim: "#f2f2f2", num: "#ffffff" } },
  { id: "futsal-dinamo", name: "Futsal Dinamo", short: "DIN", city: "Zagreb", hall: "dom-sportova", kit: { shirt: "#2a7de1", trim: "#0e2f66", num: "#ffffff" } },
  { id: "olmissum", name: "Olmissum", short: "OLM", city: "Omiš", hall: "omis", kit: { shirt: "#3fae49", trim: "#ffffff", num: "#ffffff" } },
  { id: "pula", name: "Futsal Pula", short: "PUL", city: "Pula", hall: "pula", kit: { shirt: "#0f2c5c", trim: "#e7c33a", num: "#e7c33a" } },
  { id: "square", name: "Square", short: "SQU", city: "Dubrovnik", hall: "dubrovnik", kit: { shirt: "#d22f2f", trim: "#ffffff", num: "#ffffff" } },
  { id: "crnica", name: "Crnica", short: "CRN", city: "Šibenik", hall: "sibenik", kit: { shirt: "#1b1b1b", trim: "#e9e9e9", num: "#f4d23c" } },
  { id: "vrgorac", name: "Vrgorac", short: "VRG", city: "Vrgorac", hall: "vrgorac", kit: { shirt: "#f0f0f0", trim: "#c62828", num: "#c62828" } },
  { id: "split", name: "Split", short: "SPL", city: "Split", hall: "split", kit: { shirt: "#f5f5f5", trim: "#13294b", num: "#13294b" } },
  { id: "osijek", name: "Osijek", short: "OSI", city: "Osijek", hall: "osijek", kit: { shirt: "#1d3f8f", trim: "#f28c28", num: "#f28c28" } },
];

// Pravi zapisnici (brojevi) za juniorsku utakmicu RIJ–NVR; imena nisu unesena.
const REAL_SQUADS = {
  "rijeka": { gk: ["1", "12"], nums: ["1", "4", "7", "8", "9", "12", "14", "24", "26", "29", "44", "55", "77", "99"], start: ["1", "4", "7", "26", "44"] },
  "novo-vrijeme": { gk: ["17"], nums: ["4", "6", "7", "8", "9", "10", "11", "13", "14", "17"], start: ["17", "7", "9", "11", "14"] },
  "futsal-dinamo": { gk: ["1", "12"], nums: ["1", "4", "5", "7", "8", "9", "10", "11", "12", "14", "17", "21"], demo: true },
  "olmissum": { gk: ["1", "12"], nums: ["1", "2", "5", "6", "7", "9", "10", "11", "12", "14", "15", "19"], demo: true },
};

function roundRobin(ids) {                  // metoda kruga, dvokružno
  const t = [...ids]; if (t.length % 2) t.push(null);
  const n = t.length, rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = t[i], b = t[n - 1 - i];
      if (a && b) pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs); t.splice(1, 0, t.pop());
  }
  return [...rounds, ...rounds.map(r => r.map(([a, b]) => [b, a]))];
}

function build() {
  const R = rng(20261028);
  const players = [];
  const comps = [];
  const matches = [];
  const pick = (arr) => arr[Math.floor(R() * arr.length)];

  // igrači po klubu i sezoni (samo brojevi; imena unosi admin)
  const squadFor = (clubId, season, cat) => {
    const real = cat === "U-19" && season === "2026-27" ? REAL_SQUADS[clubId] : null;
    let nums, gk, demo = true;
    if (real) { nums = real.nums; gk = real.gk; demo = !!real.demo; }
    else {
      const pool = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "17", "19", "21", "23", "77"];
      nums = pool.filter(() => R() < 0.62); for (const g of ["1", "12"]) if (!nums.includes(g)) nums.push(g);
      nums.sort((a, b) => a - b); gk = ["1", "12"];
    }
    return nums.map(n => ({ id: `${clubId}-${season}-${cat}-${n}`, club: clubId, season, cat, num: n, name: "", gk: gk.includes(n), demo }));
  };

  const setups = [
    { league: "1-hmnl", season: "2026-27", cat: "Seniori", teams: clubs.map(c => c.id).filter(id => id !== "rijeka"), start: "2026-09-18T20:00", played: 6 },
    { league: "juniori", season: "2026-27", cat: "U-19", teams: ["rijeka", "novo-vrijeme", "futsal-dinamo", "olmissum", "pula", "square", "split", "osijek"], start: "2026-09-19T12:00", played: 6 },
    { league: "kadeti", season: "2026-27", cat: "U-17", teams: ["rijeka", "futsal-dinamo", "pula", "split", "osijek", "vrgorac"], start: "2026-09-20T11:00", played: 6 },
    { league: "1-hmnl", season: "2025-26", cat: "Seniori", teams: clubs.map(c => c.id).filter(id => id !== "rijeka"), start: "2025-09-19T20:00", played: 99 },
  ];

  for (const S of setups) {
    const compId = `${S.league}-${S.season}`;
    for (const c of S.teams) players.push(...squadFor(c, S.season, S.cat));
    let sched = roundRobin(S.teams);
    // analizirane juniorske utakmice smjesti u odigrana kola, s pravim domaćinom
    if (compId === "juniori-2026-27") {
      const place = (h, a, round) => {   // pomakni samo ako je par u neodigranom kolu
        const r = sched.findIndex(p => p.some(([x, y]) => (x === h && y === a) || (x === a && y === h)));
        if (r + 1 <= 6) round = r + 1; else [sched[r], sched[round - 1]] = [sched[round - 1], sched[r]];
        sched[round - 1] = sched[round - 1].map(([x, y]) => (x === a && y === h) ? [h, a] : [x, y]);
        // drugi krug zrcali prvi
        const half = sched.length / 2;
        sched[round - 1 + half] = sched[round - 1].map(([x, y]) => [y, x]);
        if (r < half && r !== round - 1) sched[r + half] = sched[r].map(([x, y]) => [y, x]);
      };
      place("rijeka", "novo-vrijeme", 6);
      place("futsal-dinamo", "olmissum", 5);
    }
    comps.push({ id: compId, league: S.league, season: S.season, teams: S.teams, rounds: sched.length });
    const t0 = new Date(S.start + ":00+02:00");
    sched.forEach((pairs, ri) => {
      pairs.forEach(([h, a], k) => {
        const d = new Date(t0.getTime() + ri * 7 * 864e5 + (k % 2) * 864e5 + (k % 3) * 3600e3);
        const id = `${compId}-k${ri + 1}-${h}-${a}`;
        const m = { id, comp: compId, round: ri + 1, date: d.toISOString(), home: h, away: a,
          hall: clubs.find(c => c.id === h).hall, status: "scheduled", youtube: "", demo: true,
          roster: { home: null, away: null }, events: [], analysis: null };
        if (ri + 1 <= S.played) {
          m.status = "finished";
          const sq = (cid) => players.filter(p => p.club === cid && p.season === S.season && p.cat === S.cat);
          const mk = (cid) => { const s = sq(cid); const gk = s.filter(p => p.gk); const out = s.filter(p => !p.gk);
            const pl = [gk[0], ...(gk[1] ? [gk[1]] : []), ...out.slice(0, 12)].filter(Boolean);
            return { players: pl.map(p => p.id), start: [gk[0].id, ...out.slice(0, 4).map(p => p.id)], gk: gk.map(p => p.id) }; };
          m.roster = { home: mk(h), away: mk(a) };
          const goals = (lam) => { let n = 0, L = Math.exp(-lam), p = 1; do { n++; p *= R(); } while (p > L); return n - 1; };
          const gh = goals(3.4), ga = goals(2.9);
          for (const [side, n] of [["home", gh], ["away", ga]]) {
            const pool = m.roster[side].players.filter(pid => !m.roster[side].gk.includes(pid));
            for (let i = 0; i < n; i++) {
              const sec = Math.floor(R() * 2400); const scorer = pick(pool);
              const ast = R() < 0.6 ? pick(pool.filter(x => x !== scorer)) : null;
              m.events.push({ id: `e${Math.floor(R() * 1e9)}`, type: "goal", side, period: sec < 1200 ? 1 : 2, sec: sec % 1200, player: scorer, assist: ast });
            }
          }
          for (const side of ["home", "away"]) {
            const pool = m.roster[side].players;
            const nf = 2 + Math.floor(R() * 8);
            for (let i = 0; i < nf; i++) { const sec = Math.floor(R() * 2400);
              m.events.push({ id: `e${Math.floor(R() * 1e9)}`, type: "foul", side, period: sec < 1200 ? 1 : 2, sec: sec % 1200, player: pick(pool) }); }
            if (R() < 0.5) { const sec = Math.floor(R() * 2400);
              m.events.push({ id: `e${Math.floor(R() * 1e9)}`, type: "yellow", side, period: sec < 1200 ? 1 : 2, sec: sec % 1200, player: pick(pool) }); }
            if (R() < 0.7) { const sec = 300 + Math.floor(R() * 800);
              m.events.push({ id: `e${Math.floor(R() * 1e9)}`, type: "timeout", side, period: R() < 0.5 ? 1 : 2, sec }); }
          }
        }
        matches.push(m);
      });
    });
  }

  // prave analize
  const u1 = matches.find(m => m.comp === "juniori-2026-27" && m.home === "rijeka" && m.away === "novo-vrijeme");
  const u2 = matches.find(m => m.comp === "juniori-2026-27" && m.home === "futsal-dinamo" && m.away === "olmissum");
  const pid = (club, n) => `${club}-2026-27-U-19-${n}`;
  if (u1) {
    const RS = REAL_SQUADS;
    u1.roster = {
      home: { players: RS.rijeka.nums.map(n => pid("rijeka", n)), start: RS.rijeka.start.map(n => pid("rijeka", n)), gk: RS.rijeka.gk.map(n => pid("rijeka", n)) },
      away: { players: RS["novo-vrijeme"].nums.map(n => pid("novo-vrijeme", n)), start: RS["novo-vrijeme"].start.map(n => pid("novo-vrijeme", n)), gk: RS["novo-vrijeme"].gk.map(n => pid("novo-vrijeme", n)) },
    };
    // usklađeno sa snimkom: na satu 07:49 je 1:0 za RIJ, ostali golovi poslije isječka
    u1.events = u1.events.filter(e => e.type !== "goal" && e.type !== "owngoal");
    const P = (c, n) => pid(c, n);
    u1.events.push(
      { id: "u1g1", type: "goal", side: "home", period: 1, sec: 312, player: P("rijeka", "77"), assist: P("rijeka", "26") },
      { id: "u1g2", type: "goal", side: "away", period: 1, sec: 905, player: P("novo-vrijeme", "9") },
      { id: "u1g3", type: "goal", side: "home", period: 2, sec: 241, player: P("rijeka", "44"), assist: P("rijeka", "4") },
      { id: "u1g4", type: "goal", side: "home", period: 2, sec: 1090, player: P("rijeka", "7") });
    u1.analysis = { status: "done", clip: "u1", video: "media/u1.mp4", data: "media/u1.json", from: 128, to: 148,
      rights: "overlay", rightsNote: "Interni pregled. Prije javne objave treba pisana dozvola kluba ili prijenosnika.", ytOffset: null,
      note: "Isječak od 20 s (128.–148. s snimke, 07:49–08:09 na satu). Brojevi su ograničeni na zapisnik.",
      teamMap: { RIJ: "home", NVR: "away" } };
    u1.youtube = "https://www.youtube.com/watch?v=eCDieI6ctu0";
  }
  if (u2) {
    u2.analysis = { status: "done", clip: "u2", video: "media/u2.mp4", data: "media/u2.json", from: 0, to: 150,
      rights: "overlay", rightsNote: "Interni pregled. Prije javne objave treba pisana dozvola kluba ili prijenosnika.", ytOffset: null,
      note: "Isječak od 2:30. Zapisnik još nije unesen, a boje ekipa su pretpostavka (plavi = Futsal Dinamo, zeleni = Olmissum).",
      teamMap: { DIN: "home", OLM: "away" }, kitUnconfirmed: true };
    u2.youtube = "https://www.youtube.com/watch?v=pNdDlCB2PT8";
  }
  // nekoliko utakmica u redu za analizu (sljedeće kolo)
  matches.filter(m => m.comp === "1-hmnl-2026-27" && m.round === 7).slice(0, 3)
    .forEach((m, i) => { m.youtube = "https://www.youtube.com/"; m.analysis = { status: i === 0 ? "queued" : "none" }; });
  matches.filter(m => m.comp === "1-hmnl-2026-27" && m.round === 6).slice(0, 2)
    .forEach((m, i) => { m.youtube = "https://www.youtube.com/"; m.analysis = { status: i === 0 ? "processing" : "queued", progress: 0.42 }; });

  const site = { name: "Šesterac", contact: "" };
  return { version: SEED_VERSION, site, leagues, seasons, halls, clubs, players, comps, matches };
}

export default build();
