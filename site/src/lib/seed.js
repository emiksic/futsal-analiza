// Početni podaci (bez izmišljenih rezultata).
// - 1. HMNL 2026./27.: raspored, rezultati, postave i strijelci (HNS Semafor), prijenosi (YouTube / MAXsport)
// - 1. HMNL juniori: samo dvije analizirane snimke (rezultat nije unesen)
// Boje dresova su procjena iz grbova i treba ih potvrditi u adminu.

import HMNL from "../data/hmnl-2026-27.json";   // gradi data/hmnl-2026-27/build.py

export const SEED_VERSION = 12;

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
  { id: "dom-sportova-2", name: "Dom sportova, dvorana 2", city: "Zagreb", calibrated: false },
  { id: "mladosti", name: "Sportska dvorana Mladosti", city: "Rijeka", calibrated: false },
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

// Juniori: pravi zapisnici (brojevi) za analiziranu utakmicu RIJ–NVR; imena nisu unesena.
const JUN = {
  rijeka: { gk: ["1", "12"], nums: ["1", "4", "7", "8", "9", "12", "14", "24", "26", "29", "44", "55", "77", "99"], start: ["1", "4", "7", "26", "44"] },
  "novo-vrijeme": { gk: ["17"], nums: ["4", "6", "7", "8", "9", "10", "11", "13", "14", "17"], start: ["17", "7", "9", "11", "14"] },
};

function build() {
  const players = [], matches = [], comps = [];
  const pid = (club, season, cat, n) => `${club}-${season}-${cat}-${n}`;

  // --- 1. HMNL seniori
  const cid = "1-hmnl-2026-27";
  comps.push({ id: cid, league: "1-hmnl", season: "2026-27", teams: clubs.map((c) => c.id), rounds: 18 });
  players.push(...HMNL.players);
  matches.push(...HMNL.matches.map((m) => ({ ...m, date: new Date(m.date).toISOString() })));

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
      rights: "embed", ytOffset: null,
      note: "Isječak od 20 s (128.–148. s snimke, 07:49–08:09 na satu). Brojevi su ograničeni na zapisnik.", teamMap: { RIJ: "home", NVR: "away" } } });
  matches.push({ id: `${jid}-futsal-dinamo-olmissum`, comp: jid, round: 2, date: "2026-09-27T10:00:00.000Z", home: "futsal-dinamo", away: "olmissum", hall: "dom-sportova",
    status: "finished", noScore: true, youtube: "https://www.youtube.com/watch?v=pNdDlCB2PT8", roster: { home: null, away: null }, events: [],
    analysis: { status: "done", clip: "u2", video: "media/u2.mp4", data: "media/u2.json", from: 0, to: 150,
      rights: "embed", ytOffset: null,
      note: "Isječak od 2:30. Zapisnik još nije unesen, a boje ekipa su pretpostavka (plavi = Futsal Dinamo, zeleni = Olmissum).",
      teamMap: { DIN: "home", OLM: "away" }, kitUnconfirmed: true } });

  const site = { name: "", contact: "" };   // naziv još nije odabran
  return { version: SEED_VERSION, site, leagues, seasons, halls, clubs, players, comps, matches };
}

export default build();
