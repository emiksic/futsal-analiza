import { safeUrl } from "./safe.js";
// Učitavanje i izvedene statistike iz podataka analize (export_web.py).
import { useEffect, useState } from "react";

const cache = {};

// JSON ili gzipani JSON (upload_analysis.py sprema .json.gz bez Content-Encoding, pa se raspakira ovdje)
async function readJson(r) {
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    const s = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(s).text());
  }
  return JSON.parse(new TextDecoder().decode(buf));
}
export function useAnalysis(m) {
  const url = m?.analysis?.status === "done" ? safeUrl(m.analysis.data, { relative: true }) : null;
  const [st, setSt] = useState(() => (url && cache[url] ? { D: cache[url] } : { D: null }));
  useEffect(() => {
    if (!url) { setSt({ D: null }); return; }
    if (cache[url]) { setSt({ D: cache[url] }); return; }
    let ok = true; setSt({ D: null, loading: true });
    fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return readJson(r); })
      .then((d) => { cache[url] = d; if (ok) setSt({ D: d }); })
      .catch(() => { if (ok) setSt({ D: null, error: true }); });
    return () => { ok = false; };
  }, [url]);
  return st;
}

// redoslijed ekipa u podacima -> [indeks domaćina, indeks gosta]
export function teamOrder(D, m) {
  const map = m.analysis.teamMap || {};
  const hi = D.teams.findIndex((t) => map[t.name] === "home"), ai = D.teams.findIndex((t) => map[t.name] === "away");
  return [hi >= 0 ? hi : 0, ai >= 0 ? ai : 1];
}

// strana gola koju brani ekipa (-1 lijevo, 1 desno), iz procjene golmana
export function defendSide(D, ti) {
  for (const f of D.frames) for (const g of f.g || []) if (g[0] === ti) return Math.sign(g[1]) || -1;
  return ti === 0 ? -1 : 1;
}

export function analysisStats(D, order) {
  const last = D.frames[D.frames.length - 1];
  const pc = [last.pc[order[0]], last.pc[order[1]]], tot = pc[0] + pc[1];
  const poss = tot ? [Math.round(100 * pc[0] / tot), 100 - Math.round(100 * pc[0] / tot)] : null;
  const side = order.map((ti) => defendSide(D, ti));
  let terr = [0, 0], n = 0;
  for (const f of D.frames) {
    if (!f.b || !f.live) continue; n++;
    const x = f.b[2];
    // f.dir (cijela utakmica): smjer napada ekipe 0 u tom poluvremenu; inače strana iz golmana
    const sd = f.dir ? order.map((ti) => (ti === 0 ? -f.dir : f.dir)) : side;
    if (Math.sign(x) === -sd[0]) terr[0]++; else if (Math.sign(x) === -sd[1]) terr[1]++;
  }
  const terrPct = n ? [Math.round(100 * terr[0] / (terr[0] + terr[1] || 1)), 0] : null;
  if (terrPct) terrPct[1] = 100 - terrPct[0];
  // kretanje igrača s prepoznatim brojem
  const dist = {}, seen = {}, prev = {};
  for (const f of D.frames) {
    for (const p of f.p) {
      const pi = p[1]; if (pi < 0 || p[0] > 1) continue;
      const k = D.players[pi]; seen[k] = (seen[k] || 0) + 1;
      const q = prev[k];
      if (q && f.t - q.t < 0.3) { const d = Math.hypot(p[7] - q.x, p[8] - q.y); if (d < 0.8 * (f.t - q.t) / 0.07) dist[k] = (dist[k] || 0) + d; }
      prev[k] = { t: f.t, x: p[7], y: p[8] };
    }
  }
  const dt = D.frames.length > 1 ? (D.frames[D.frames.length - 1].t - D.frames[0].t) / (D.frames.length - 1) : 0.07;
  const players = Object.keys(seen).map((k) => ({ key: k, team: k.split(" ")[0], num: k.split(" ")[1], dist: Math.round(dist[k] || 0), time: Math.round(seen[k] * dt) }))
    .sort((a, b) => b.dist - a.dist);
  const ballSeen = Math.round(100 * D.frames.filter((f) => f.b).length / D.frames.length);
  const dur = Math.round(D.frames[D.frames.length - 1].t - D.frames[0].t);
  return { poss, terr: terrPct, players, ballSeen, dur };
}

// točke za toplinsku mapu igrača, okrenute tako da domaćin napada udesno
export function heatPoints(D, key, homeIdx, isHome) {
  const idx = D.players.indexOf(key); if (idx < 0) return [];
  const homeLeft = defendSide(D, homeIdx) < 0;
  const flip = !homeLeft;
  const pts = [];
  for (const f of D.frames) for (const p of f.p) if (p[1] === idx) pts.push(flip ? [-p[7], -p[8]] : [p[7], p[8]]);
  return pts;
}

// točke za toplinsku mapu ekipe (bez golmana, samo dok teče sat), okrenute tako da ekipa napada udesno.
// f.dir = smjer napada ekipe 0 (domaćin u izvozu) u tom poluvremenu.
export function teamHeatPoints(D, ti) {
  const pts = [];
  for (const f of D.frames) {
    if (!f.live || !f.dir) continue;
    const d = ti === 0 ? f.dir : -f.dir;
    for (const p of f.p) if (p[0] === ti && !p[2]) pts.push(d > 0 ? [p[7], p[8]] : [-p[7], -p[8]]);
  }
  return pts;
}
