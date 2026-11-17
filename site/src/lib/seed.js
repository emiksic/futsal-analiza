// Početni podaci (bez izmišljenih rezultata).
// - 1. HMNL 2026./27.: raspored, rezultati, postave i strijelci (HNS Semafor), prijenosi (YouTube / MAXsport)
// - Hrvatski malonogometni kup 2026./27.: raspored 1/16 finala, rezultati, postave, strijelci i kazneni udarci (HNS Semafor)
// - 1. HMNL juniori 2026./27.: raspored i rezultati (HNS Semafor) + analiza isječka RIJ–NVR (3. kolo)
// Boje dresova su procjena iz grbova i treba ih potvrditi u adminu.

import HMNL from "../data/hmnl-2026-27.json";       // gradi: python3 data/build.py hmnl-2026-27 1-hmnl-2026-27 Seniori
import JUNIORI from "../data/juniori-2026-27.json"; // gradi: python3 data/build.py juniori-2026-27 juniori-2026-27 U-19
import KADETI from "../data/kadeti-2026-27.json";   // gradi: python3 data/build.py kadeti-2026-27 kadeti-2026-27 U-17
import KUP from "../data/kup-2026-27.json";         // gradi: python3 data/build.py kup-2026-27 kup-2026-27 Seniori

import { SEED_VERSION, leagues, seasons, halls, clubs } from "./seedBase.js";
export { SEED_VERSION };

function build() {
  const players = [], matches = [], comps = [];

  // --- 1. HMNL seniori
  const cid = "1-hmnl-2026-27";
  const SEN = ["torcida", "olmissum", "crnica", "osijek", "futsal-dinamo", "pula", "novo-vrijeme", "square", "rijeka", "hajduk"];
  comps.push({ id: cid, league: "1-hmnl", season: "2026-27", teams: SEN, rounds: 18 });
  players.push(...HMNL.players);
  matches.push(...HMNL.matches.map((m) => ({ ...m, date: new Date(m.date).toISOString() })));

  // --- juniori: raspored i rezultati
  const jid = "juniori-2026-27";
  comps.push({ id: jid, league: "juniori", season: "2026-27", teams: [...new Set(JUNIORI.matches.flatMap((m) => [m.home, m.away]))], rounds: 22 });
  matches.push(...JUNIORI.matches.map((m) => ({ ...m, date: new Date(m.date).toISOString() })));
  players.push(...JUNIORI.players);    // samo brojevi; imena su u privatnoj bazi

  // --- kadeti: isti raspored kao juniori, rezultati 1.–3. kola
  comps.push({ id: "kadeti-2026-27", league: "kadeti", season: "2026-27", teams: [...new Set(KADETI.matches.flatMap((m) => [m.home, m.away]))], rounds: 22 });
  players.push(...KADETI.players);
  matches.push(...KADETI.matches.map((m) => ({ ...m, date: new Date(m.date).toISOString() })));

  // --- Hrvatski kup (seniori): igrači iz 1. HMNL već postoje, dodaju se samo novi
  comps.push({ id: "kup-2026-27", league: "kup", season: "2026-27", teams: [...new Set(KUP.matches.flatMap((m) => [m.home, m.away]))], rounds: 5 });
  const have = new Set(players.map((p) => p.id));
  players.push(...KUP.players.filter((p) => !have.has(p.id)));
  matches.push(...KUP.matches.map((m) => ({ ...m, date: new Date(m.date).toISOString(), ...(m.dateTo && { dateTo: new Date(m.dateTo).toISOString() }) })));

  const site = { name: "", contact: "" };   // naziv još nije odabran
  return { version: SEED_VERSION, site, leagues, seasons, halls, clubs, players, comps, matches };
}

export default build();
