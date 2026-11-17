// Osnovni podaci koji su odmah dostupni (lige, sezone, dvorane, klubovi) — bez rezultata i igrača.
// Puni ugrađeni podaci (seed.js, ~500 kB JSON-a) učitavaju se tek kad zatrebaju (bez interneta, admin uvoz).
export const SEED_VERSION = 24;

export const leagues = [
  { id: "1-hmnl", name: "SS HMNL", category: "Seniori", zones: { playoff: 8, qual: 1, relegation: 1 }, privacy: { names: "full", perPlayer: true } },
  { id: "juniori", name: "1. HMNL juniori", category: "U-19", zones: { direct: 2, playoff: 6, note: "Ispadanje se određuje zbirnom tablicom kadeta i juniora." }, privacy: { names: "initial", perPlayer: true } },
  { id: "kadeti", name: "1. HMNL kadeti", category: "U-17", zones: { direct: 2, playoff: 6, note: "Ispadanje se određuje zbirnom tablicom kadeta i juniora." }, privacy: { names: "initials", perPlayer: false } },
  { id: "kup", name: "Hrvatski kup", category: "Seniori", zones: { cup: true }, privacy: { names: "full", perPlayer: true } },
];
export const seasons = [{ id: "2026-27", name: "2026./27." }];

export const halls = [
  { id: "gripe", name: "SC Gripe", city: "Split", calibrated: false },
  { id: "dvorana-gripe", name: "Dvorana Gripe", city: "Split", calibrated: false },
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
export const clubs = [
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
  { id: "hajduk", name: "Hajduk", full: "MNK Hajduk", short: "HAJ", city: "Split", hall: "dvorana-gripe", kit: { shirt: "#ffffff", trim: "#c8102e", num: "#1d3c8f" } },
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
    // privremeno: pobjednik Olmissum – Crnica (1/16, 17. 11.) u 1/8 finala; nakon utakmice zamijeniti pravim klubom
    ["olmissum-crnica", "Olmissum/Crnica", "Pobjednik Olmissum – Crnica", "O/C", "", null],
  ].map(([id, name, full, short, city, hall]) => ({ id, name, full, short, city, hall, kit: { shirt: "#cfd6de", trim: "#8995a3", num: "#111111" } })),
];


// natjecanja bez popisa klubova (dovoljno za zaglavlje dok se baza učitava)
export const baseComps = [
  { id: "1-hmnl-2026-27", league: "1-hmnl", season: "2026-27", teams: [], rounds: 18 },
  { id: "juniori-2026-27", league: "juniori", season: "2026-27", teams: [], rounds: 22 },
  { id: "kadeti-2026-27", league: "kadeti", season: "2026-27", teams: [], rounds: 22 },
  { id: "kup-2026-27", league: "kup", season: "2026-27", teams: [], rounds: 5 },
];
export const baseDB = () => ({ version: SEED_VERSION, site: { name: "", contact: "" }, leagues, seasons, halls, clubs, players: [], comps: baseComps, matches: [] });
