// Početni podaci (bez izmišljenih rezultata).
// - 1. HMNL 2026./27.: raspored, rezultati, postave i strijelci (HNS Semafor), prijenosi (YouTube / MAXsport)
// - Hrvatski malonogometni kup 2026./27.: raspored 1/16 finala, rezultati, postave, strijelci i kazneni udarci (HNS Semafor)
// - 1. HMNL juniori 2026./27.: raspored i rezultati (HNS Semafor) + analiza isječka RIJ–NVR (3. kolo)
// Boje dresova su procjena iz grbova i treba ih potvrditi u adminu.

import HMNL from "../data/hmnl-2026-27.json";       // gradi: python3 data/build.py hmnl-2026-27 1-hmnl-2026-27 Seniori
import JUNIORI from "../data/juniori-2026-27.json"; // gradi: python3 data/build.py juniori-2026-27 juniori-2026-27 U-19
import KADETI from "../data/kadeti-2026-27.json";   // gradi: python3 data/build.py kadeti-2026-27 kadeti-2026-27 U-17
import KUP from "../data/kup-2026-27.json";         // gradi: python3 data/build.py kup-2026-27 kup-2026-27 Seniori

export const SEED_VERSION = 19;

const leagues = [
  { id: "1-hmnl", name: "SuperSport HMNL", category: "Seniori", zones: { playoff: 8, qual: 1, relegation: 1 }, privacy: { names: "full", perPlayer: true } },
  { id: "juniori", name: "1. HMNL juniori", category: "U-19", zones: { direct: 2, playoff: 6, note: "Ispadanje se određuje zbirnom tablicom kadeta i juniora." }, privacy: { names: "initial", perPlayer: true } },
  { id: "kadeti", name: "1. HMNL kadeti", category: "U-17", zones: { direct: 2, playoff: 6, note: "Ispadanje se određuje zbirnom tablicom kadeta i juniora." }, privacy: { names: "initials", perPlayer: false } },
  { id: "kup", name: "Hrvatski kup", category: "Seniori", zones: { cup: true }, privacy: { names: "full", perPlayer: true } },
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
  { id: "lora", name: "Lora", city: "Split", calibrated: false },
  { id: "zagreb", name: "Zagreb", city: "Zagreb", calibrated: false },
  { id: "pescenica", name: "Peščenica", city: "Zagreb", calibrated: false },
  { id: "domjanic", name: "SD OŠ Dragutin Domjanić", city: "Zagreb", calibrated: false },
  // kup 2026./27.
  { id: "bjelovar", name: "Gradski stadion Bjelovar", city: "Bjelovar", calibrated: false },
  { id: "primorski-dolac", name: "ŠD Primorski Dolac", city: "Primorski Dolac", calibrated: false },
  { id: "vidovec", name: "Park", city: "Vidovec", calibrated: false },
  { id: "biograd", name: "Dvorana Biograd N/m", city: "Biograd na Moru", calibrated: false },
  { id: "murter", name: "Murterski škoj", city: "Murter", calibrated: false },
  { id: "valpovo", name: "GD Valpovo", city: "Valpovo", calibrated: false },
  { id: "vinkovci", name: "Vinkovci", city: "Vinkovci", calibrated: false },
  { id: "tisno", name: "Sportska dvorana Tisno", city: "Tisno", calibrated: false },
  { id: "racice", name: "S.C Račice", city: "Vodice", calibrated: false },
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
  { id: "universitas", name: "Universitas Split", full: "AMNK Universitas Split", short: "UNI", city: "Split", hall: "gripe", kit: { shirt: "#8fd3ee", trim: "#0e2f66", num: "#0e2f66" } },
  { id: "gimka", name: "Uspinjača Gimka", full: "MNK Uspinjača Gimka", short: "GIM", city: "Zagreb", hall: "zagreb", kit: { shirt: "#1f3a6b", trim: "#ffffff", num: "#ffffff" } },
  { id: "hajduk", name: "Hajduk", full: "MNK Hajduk", short: "HAJ", city: "Split", hall: "gripe", kit: { shirt: "#ffffff", trim: "#c8102e", num: "#1d3c8f" } },
  // ostali klubovi iz kupa 2026./27. (boje dresova još nisu poznate: sivi dres, mijenja se u adminu)
  ...[
    ["split", "Split", "MNK Split", "SPL", "Split", "gripe"],
    ["kijevo", "Kijevo", "MNK Kijevo", "KIJ", "", null],
    ["bjelovar", "Bjelovar", "MNK Bjelovar", "BJE", "Bjelovar", "bjelovar"],
    ["trilj", "Trilj", "MNK Trilj", "TRI", "Trilj", null],
    ["podstrana", "Podstrana", "MNK Podstrana", "POD", "Podstrana", "primorski-dolac"],
    ["fotex", "Fotex", "MNK Fotex", "FOT", "Vidovec", "vidovec"],
    ["lika-sport", "Lika šport", "MNK Lika šport", "LIK", "", null],
    ["gauni", "Gauni", "MNK Gauni", "GAU", "Biograd na Moru", "biograd"],
    ["dubravice", "Dubravice", "MNK Dubravice", "DUB", "", null],
    ["murter", "Murter", "MNK Murter", "MUR", "Murter", "murter"],
    ["slatina", "Slatina", "MNK Slatina", "SLA", "Slatina", null],
    ["mala-mljekara", "Mala Mljekara", "MNK Mala Mljekara", "MML", "Valpovo", "valpovo"],
    ["petrinjcica", "Petrinjčica", "MNK Petrinjčica", "PET", "", null],
    ["dominik-savio", "Dominik Savio", "MNK Dominik Savio", "DSA", "Zagreb", "sutinska"],
    ["novi-marof", "Novi Marof", "MNK Novi Marof", "NMA", "Novi Marof", null],
    ["vinkovci", "Vinkovci", "MNK Vinkovci", "VIN", "Vinkovci", "vinkovci"],
    ["jezera", "Jezera", "MNK Jezera", "JEZ", "", "tisno"],
    ["vrgorac", "Vrgorac", "HMNK Vrgorac", "VRG", "Vrgorac", null],
    ["aurelia-boso", "Aurelia Boso", "MNK Aurelia Boso", "AUR", "", null],
    ["heroji-2007", "Heroji 2007", "MNK Heroji 2007", "HER", "Vodice", "racice"],
  ].map(([id, name, full, short, city, hall]) => ({ id, name, full, short, city, hall, kit: { shirt: "#cfd6de", trim: "#8995a3", num: "#111111" } })),
];

function build() {
  const players = [], matches = [], comps = [];

  // --- 1. HMNL seniori
  const cid = "1-hmnl-2026-27";
  const SEN = ["torcida", "olmissum", "crnica", "osijek", "futsal-dinamo", "pula", "novo-vrijeme", "square", "rijeka", "hajduk"];
  comps.push({ id: cid, league: "1-hmnl", season: "2026-27", teams: SEN, rounds: 18 });
  players.push(...HMNL.players);
  matches.push(...HMNL.matches.map((m) => ({ ...m, date: new Date(m.date).toISOString() })));

  // --- juniori: raspored i rezultati + analiza isječka
  const jid = "juniori-2026-27";
  comps.push({ id: jid, league: "juniori", season: "2026-27", teams: [...new Set(JUNIORI.matches.flatMap((m) => [m.home, m.away]))], rounds: 22 });
  matches.push(...JUNIORI.matches.map((m) => ({ ...m, date: new Date(m.date).toISOString() })));
  players.push(...JUNIORI.players);    // samo brojevi; imena su u privatnoj bazi
  const u1 = matches.find((m) => m.id === `${jid}-k3-rijeka-novo-vrijeme`);
  Object.assign(u1, {
    analysis: { status: "done", clip: "u1", video: "media/u1.mp4", data: "media/u1.json", from: 128, to: 148, rights: "embed", ytOffset: null,
      note: "Isječak od 20 s (07:49–08:09 na satu, 1:0 za Rijeku). Brojevi su ograničeni na zapisnik.", teamMap: { RIJ: "home", NVR: "away" } } });
  // drugi isječak (DIN–OLM): još nije utvrđeno s koje je utakmice, pa nije u rasporedu
  matches.push({ id: "isjecak-futsal-dinamo-olmissum", comp: jid, round: null, extra: true, date: "2026-09-27T10:00:00.000Z", home: "futsal-dinamo", away: "olmissum", hall: "dom-sportova",
    status: "finished", noScore: true, youtube: "", roster: { home: null, away: null }, events: [],
    analysis: { status: "done", clip: "u2", video: "media/u2.mp4", data: "media/u2.json", from: 0, to: 150, rights: "embed", ytOffset: null,
      note: "Isječak od 2:30. Utakmica i zapisnik još nisu utvrđeni, a boje ekipa su pretpostavka (plavi = Futsal Dinamo, zeleni = Olmissum).",
      teamMap: { DIN: "home", OLM: "away" }, kitUnconfirmed: true } });

  // --- kadeti: isti raspored kao juniori, rezultati 1.–3. kola
  comps.push({ id: "kadeti-2026-27", league: "kadeti", season: "2026-27", teams: [...new Set(KADETI.matches.flatMap((m) => [m.home, m.away]))], rounds: 22 });
  players.push(...KADETI.players);
  matches.push(...KADETI.matches.map((m) => ({ ...m, date: new Date(m.date).toISOString() })));

  // --- Hrvatski kup (seniori): igrači iz 1. HMNL već postoje, dodaju se samo novi
  comps.push({ id: "kup-2026-27", league: "kup", season: "2026-27", teams: [...new Set(KUP.matches.flatMap((m) => [m.home, m.away]))], rounds: 5 });
  const have = new Set(players.map((p) => p.id));
  players.push(...KUP.players.filter((p) => !have.has(p.id)));
  matches.push(...KUP.matches.map((m) => ({ ...m, date: new Date(m.date).toISOString() })));

  const site = { name: "", contact: "" };   // naziv još nije odabran
  return { version: SEED_VERSION, site, leagues, seasons, halls, clubs, players, comps, matches };
}

export default build();
