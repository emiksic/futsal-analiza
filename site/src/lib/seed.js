// Početni podaci (bez izmišljenih rezultata).
// - 1. HMNL 2026./27.: pravi rezultati 1.–4. kola (HNS Semafor, prepisano ručno); postave/strijelci kad stignu linkovi
// - 1. HMNL juniori: samo dvije analizirane snimke (rezultat nije unesen)
// Boje dresova su procjena iz grbova i treba ih potvrditi u adminu.

export const SEED_VERSION = 8;

const leagues = [
  { id: "1-hmnl", name: "1. HMNL", category: "Seniori", zones: { playoff: 8, relegation: 1 }, privacy: { names: "full", perPlayer: true } },
  { id: "juniori", name: "1. HMNL juniori", category: "U-19", zones: { playoff: 4, relegation: 0 }, privacy: { names: "initial", perPlayer: true } },
  { id: "kadeti", name: "1. HMNL kadeti", category: "U-17", zones: { playoff: 4, relegation: 0 }, privacy: { names: "number", perPlayer: false } },
];
const seasons = [{ id: "2026-27", name: "2026./27." }];

const halls = [
  { id: "gripe", name: "SC Gripe", city: "Split", calibrated: false },
  { id: "baldekin", name: "SD Baldekin", city: "Šibenik", calibrated: false },
  { id: "maksimir", name: "Stadion Maksimir", city: "Zagreb", calibrated: false },
  { id: "sutinska", name: "Sutinska Vrela", city: "Zagreb", calibrated: false },
  { id: "makarska", name: "SC Makarska", city: "Makarska", calibrated: false },
  { id: "zamet", name: "Sportska dvorana Zamet", city: "Rijeka", calibrated: true },
  { id: "gospino", name: "Sportska dvorana Gospino polje", city: "Dubrovnik", calibrated: false },
  { id: "omis", name: "Omiš", city: "Omiš", calibrated: false },
  { id: "mate-parlov", name: "Dom sportova \"Mate Parlov\"", city: "Pula", calibrated: false },
  { id: "zrinjevac", name: "ŠD Zrinjevac", city: "Osijek", calibrated: false },
  { id: "dom-sportova", name: "Dom sportova", city: "Zagreb", calibrated: true },
];

// kit: shirt = dres, trim = rukavi/ovratnik, num = broj (procjena)
const clubs = [
  { id: "torcida", name: "Torcida", full: "MNK Torcida", short: "TOR", city: "Split", hall: "gripe", kit: { shirt: "#1d3c8f", trim: "#d62b2b", num: "#ffffff" } },
  { id: "olmissum", name: "Olmissum", full: "MNK Olmissum", short: "OLM", city: "Omiš", hall: "omis", kit: { shirt: "#3fae49", trim: "#111111", num: "#ffffff" } },
  { id: "crnica", name: "Crnica", full: "MNK Crnica", short: "CRN", city: "Šibenik", hall: "baldekin", kit: { shirt: "#d22f2f", trim: "#ffffff", num: "#ffffff" } },
  { id: "osijek", name: "Osijek", full: "MNK Osijek", short: "OSI", city: "Osijek", hall: "zrinjevac", kit: { shirt: "#1d4f9c", trim: "#ffffff", num: "#ffffff" } },
  { id: "futsal-dinamo", name: "Futsal Dinamo", full: "MNK Futsal Dinamo", short: "DIN", city: "Zagreb", hall: "sutinska", kit: { shirt: "#2a7de1", trim: "#0e2f66", num: "#ffffff" } },
  { id: "pula", name: "Futsal Istra Pula", full: "MNK Futsal Istra Pula", short: "PUL", city: "Pula", hall: "mate-parlov", kit: { shirt: "#e7c22e", trim: "#2f7a32", num: "#2f7a32" } },
  { id: "novo-vrijeme", name: "Novo Vrijeme", full: "MNK Novo Vrijeme", short: "NVR", city: "Makarska", hall: "makarska", kit: { shirt: "#8c3cc8", trim: "#f2f2f2", num: "#ffffff" } },
  { id: "square", name: "Square", full: "MNK Square", short: "SQU", city: "Dubrovnik", hall: "gospino", kit: { shirt: "#d22f2f", trim: "#111111", num: "#ffffff" } },
  { id: "rijeka", name: "Rijeka", full: "HMNK Rijeka", short: "RIJ", city: "Rijeka", hall: "zamet", kit: { shirt: "#ffffff", trim: "#21b3d6", num: "#1f6fb5" } },
  { id: "hajduk", name: "Hajduk", full: "MNK Hajduk", short: "HAJ", city: "Split", hall: "gripe", kit: { shirt: "#ffffff", trim: "#c8102e", num: "#1d3c8f" } },
];

// 1. HMNL 2026./27. — [kolo, "dd.mm.yyyy hh:mm", domaćin, gost, golovi D, golovi G, dvorana]
const HMNL = [
  [1, "25.09.2026 18:15", "torcida", "olmissum", 1, 7, "gripe"],
  [1, "25.09.2026 20:15", "crnica", "osijek", 1, 4, "baldekin"],
  [1, "27.09.2026 16:30", "futsal-dinamo", "pula", 1, 2, "maksimir"],
  [1, "27.09.2026 18:00", "novo-vrijeme", "square", 3, 7, "makarska"],
  [1, "28.09.2026 19:00", "rijeka", "hajduk", 4, 2, "zamet"],
  [2, "02.10.2026 18:00", "square", "rijeka", 6, 4, "gospino"],
  [2, "02.10.2026 20:15", "torcida", "futsal-dinamo", 1, 4, "gripe"],
  [2, "03.10.2026 15:30", "olmissum", "hajduk", 5, 3, "omis"],
  [2, "03.10.2026 20:30", "pula", "crnica", 4, 2, "mate-parlov"],
  [2, "04.10.2026 18:30", "osijek", "novo-vrijeme", 9, 2, "zrinjevac"],
  [3, "09.10.2026 20:15", "futsal-dinamo", "olmissum", 2, 2, "sutinska"],
  [3, "10.10.2026 18:00", "rijeka", "osijek", 7, 3, "zamet"],
  [3, "10.10.2026 20:15", "crnica", "torcida", 6, 0, "baldekin"],
  [3, "11.10.2026 19:00", "novo-vrijeme", "pula", 7, 1, "makarska"],
  [3, "11.10.2026 19:45", "hajduk", "square", 3, 3, "gripe"],
  [4, "23.10.2026 18:15", "futsal-dinamo", "crnica", 4, 0, "sutinska"],
  [4, "23.10.2026 20:15", "olmissum", "square", 7, 4, "omis"],
  [4, "24.10.2026 17:45", "torcida", "novo-vrijeme", 2, 4, "gripe"],
  [4, "24.10.2026 18:00", "pula", "rijeka", 2, 5, "mate-parlov"],
  [4, "24.10.2026 20:15", "osijek", "hajduk", 2, 0, "zrinjevac"],
];

// Postave i strijelci (HNS Semafor). Ključ: id utakmice.
// igrači: [broj, ime, GK?, početna petorka?]; golovi: [minuta, "home"|"away", broj]
const DETAILS = {
  "1-hmnl-2026-27-k1-torcida-olmissum": {
    home: [[1, "Marin Jurić", 1, 1], [7, "Julian Esteban Clavijo Urquijo", 0, 1], [8, "Mijo Mišerda", 0, 1], [9, "Caio Alves Roque", 0, 1], [10, "Marko Žuljević", 0, 1],
      [13, "Ivan Vranješ", 1, 0], [25, "Duje Krivošija", 1, 0], [3, "Duje Vladović", 0, 0], [14, "Borna Jurjević-Adžić", 0, 0], [18, "Bartul Ora", 0, 0],
      [23, "Dario Vukasović", 0, 0], [37, "Karlo Vuković", 0, 0], [49, "Ante Perkušić", 0, 0], [99, "Nandi Eterović", 0, 0]],
    away: [[1, "Vinko Rozga", 1, 1], [4, "Duje Kustura", 0, 1], [10, "Romeo Sušac", 0, 1], [11, "Ante Kovačević", 0, 1], [19, "Iiro Olavi Vanha", 0, 1],
      [25, "Luka Pavlović", 1, 0], [7, "Uroš Đurić", 0, 0], [16, "Josip Juretić", 0, 0], [17, "Toni Kirevski", 0, 0], [18, "Ivan Kovačević", 0, 0],
      [20, "David Barbarić", 0, 0], [24, "Jure Copić", 0, 0], [31, "Tomislav Milić", 0, 0], [77, "Igor Da Costa", 0, 0]],
    goals: [[4, "away", 77], [6, "home", 10], [15, "away", 7], [19, "away", 10], [20, "away", 11], [34, "away", 7], [36, "away", 20], [38, "away", 11]],
  },
};

// Juniori: pravi zapisnici (brojevi) za analiziranu utakmicu RIJ–NVR; imena nisu unesena.
const JUN = {
  rijeka: { gk: ["1", "12"], nums: ["1", "4", "7", "8", "9", "12", "14", "24", "26", "29", "44", "55", "77", "99"], start: ["1", "4", "7", "26", "44"] },
  "novo-vrijeme": { gk: ["17"], nums: ["4", "6", "7", "8", "9", "10", "11", "13", "14", "17"], start: ["17", "7", "9", "11", "14"] },
};

function build() {
  const players = [], matches = [], comps = [];
  const pid = (club, season, cat, n) => `${club}-${season}-${cat}-${n}`;
  const date = (s) => { const [d, t] = s.split(" "); const [dd, mm, yy] = d.split("."); return new Date(`${yy}-${mm}-${dd}T${t}:00+02:00`).toISOString(); };
  const toEv = (min) => ({ period: min <= 20 ? 1 : min <= 40 ? 2 : 3, sec: ((min - 1) % 20) * 60 + 30 });

  // --- 1. HMNL seniori
  const cid = "1-hmnl-2026-27";
  comps.push({ id: cid, league: "1-hmnl", season: "2026-27", teams: clubs.map((c) => c.id), rounds: 18 });
  for (const [round, when, home, away, gh, ga, hall] of HMNL) {
    const id = `${cid}-k${round}-${home}-${away}`;
    const m = { id, comp: cid, round, date: date(when), home, away, hall, status: "finished", youtube: "", source: "HNS Semafor",
      roster: { home: null, away: null }, events: [], analysis: null, result: [gh, ga] };
    const det = DETAILS[id];
    if (det) {
      for (const side of ["home", "away"]) {
        const club = m[side], R = { players: [], start: [], gk: [] };
        for (const [n, name, gk, st] of det[side]) {
          const p = pid(club, "2026-27", "Seniori", n);
          if (!players.some((x) => x.id === p)) players.push({ id: p, club, season: "2026-27", cat: "Seniori", num: String(n), name, gk: !!gk });
          R.players.push(p); if (gk) R.gk.push(p); if (st) R.start.push(p);
        }
        m.roster[side] = R;
      }
      det.goals.forEach(([min, side, n], i) => m.events.push({ id: `${id}-g${i}`, type: "goal", side, ...toEv(min), player: pid(m[side], "2026-27", "Seniori", n) }));
      delete m.result;           // rezultat iz golova
    }
    matches.push(m);
  }

  // --- juniori: dvije analizirane snimke
  const jid = "juniori-2026-27";
  comps.push({ id: jid, league: "juniori", season: "2026-27", teams: ["rijeka", "novo-vrijeme", "futsal-dinamo", "olmissum"], rounds: 14 });
  for (const [club, S] of Object.entries(JUN))
    for (const n of S.nums) players.push({ id: pid(club, "2026-27", "U-19", n), club, season: "2026-27", cat: "U-19", num: n, name: "", gk: S.gk.includes(n) });
  const jp = (c, n) => pid(c, "2026-27", "U-19", n);
  const R = (c) => ({ players: JUN[c].nums.map((n) => jp(c, n)), start: JUN[c].start.map((n) => jp(c, n)), gk: JUN[c].gk.map((n) => jp(c, n)) });
  matches.push({ id: `${jid}-rijeka-novo-vrijeme`, comp: jid, round: 6, date: "2026-10-24T10:00:00.000Z", home: "rijeka", away: "novo-vrijeme", hall: "zamet",
    status: "finished", noScore: true, youtube: "https://www.youtube.com/watch?v=eCDieI6ctu0",
    roster: { home: R("rijeka"), away: R("novo-vrijeme") }, events: [],
    analysis: { status: "done", clip: "u1", video: "media/u1.mp4", data: "media/u1.json", from: 128, to: 148,
      rights: "overlay", rightsNote: "Interni pregled. Prije javne objave treba pisana dozvola kluba ili prijenosnika.", ytOffset: null,
      note: "Isječak od 20 s (128.–148. s snimke, 07:49–08:09 na satu). Brojevi su ograničeni na zapisnik.", teamMap: { RIJ: "home", NVR: "away" } } });
  matches.push({ id: `${jid}-futsal-dinamo-olmissum`, comp: jid, round: 2, date: "2026-09-27T10:00:00.000Z", home: "futsal-dinamo", away: "olmissum", hall: "dom-sportova",
    status: "finished", noScore: true, youtube: "https://www.youtube.com/watch?v=pNdDlCB2PT8", roster: { home: null, away: null }, events: [],
    analysis: { status: "done", clip: "u2", video: "media/u2.mp4", data: "media/u2.json", from: 0, to: 150,
      rights: "overlay", rightsNote: "Interni pregled. Prije javne objave treba pisana dozvola kluba ili prijenosnika.", ytOffset: null,
      note: "Isječak od 2:30. Zapisnik još nije unesen, a boje ekipa su pretpostavka (plavi = Futsal Dinamo, zeleni = Olmissum).",
      teamMap: { DIN: "home", OLM: "away" }, kitUnconfirmed: true } });

  const site = { name: "Šesterac", contact: "" };
  return { version: SEED_VERSION, site, leagues, seasons, halls, clubs, players, comps, matches };
}

export default build();
