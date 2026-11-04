// Instagram objava za kolo (raspored ili rezultati), 1080×1350, crta se na canvas pa se preuzme kao PNG.
// Boja po kategoriji: seniori žuta, juniori zelena, kadeti narančasta, kup crvena. Tema tamna ili svijetla.
import { score, shootout, winner, roundName, isCup, standings, scorers, playerName, zoneOf, absSec, goalTime, comeback } from "./derive.js";

export const W = 1080, H = 1350;
const PAD = 56;
export const PALETTE = {
  "1-hmnl": { acc: "#f2b705", on: "#0d1a30", bg: "#0d1a30", row: "#15284a", deep: "#091326", cat: "Seniori" },
  juniori: { acc: "#2fd49a", on: "#06231a", bg: "#07211b", row: "#0e3329", deep: "#051813", cat: "Juniori U-19" },
  kadeti: { acc: "#ff8a3d", on: "#2a1205", bg: "#24130a", row: "#3a2010", deep: "#1a0d06", cat: "Kadeti U-17" },
  kup: { acc: "#ff4d5e", on: "#2a0710", bg: "#200a12", row: "#36121e", deep: "#16060c", cat: "Hrvatski kup" },
};
const LIGHT = { fg: "#101a2c", muted: "#5c6a7d", line: "#d9e0e8", bg: "#eef2f6", row: "#ffffff", deep: "#e3e9f0" };
const DARK = { fg: "#f1f5fb", muted: "rgba(241,245,251,.6)", line: "rgba(255,255,255,.12)" };
const RC = '"Roboto Condensed", "Arial Narrow", sans-serif', RB = 'Roboto, Arial, sans-serif';
const DAYS = ["ned", "pon", "uto", "sri", "čet", "pet", "sub"];
const MAX_PER_PAGE = 6;

export async function loadFonts() {
  if (!document.fonts?.load) return;
  await Promise.all([`900 60px ${RC}`, `700 30px ${RC}`, `400 20px ${RB}`].map((f) => document.fonts.load(f, "ŠĐČĆŽ šđčćž 0123").catch(() => null)));
}

// podaci kola -> stranice objave (do 6 utakmica po slici; više = karusel od nekoliko slika)
export function buildPost(db, ix, compId, round, mode = "auto") {
  const C = ix.comp[compId], L = ix.league[C.league];
  const pal = PALETTE[C.league] || (isCup(L) ? PALETTE.kup : PALETTE["1-hmnl"]);
  const ms = db.matches.filter((m) => m.comp === compId && m.round === round).sort((a, b) => a.date.localeCompare(b.date));
  const allFin = ms.length > 0 && ms.every((m) => m.status === "finished");
  const res = mode === "auto" ? allFin : mode === "rezultati";
  const rows = ms.map((m) => {
    const d = new Date(m.date), s = m.status === "finished" ? score(m) : null;
    const hall = ix.hall[m.hall];
    return {
      home: ix.club[m.home], away: ix.club[m.away], s, so: s ? shootout(m) : null, w: s ? winner(m) : 0,
      day: DAYS[d.getDay()], time: m.timeTbd ? null : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
      city: hall?.name || hall?.city || "", tv: m.youtube || m.tv === "YouTube" ? "YouTube" : m.tv || null,
    };
  });
  const per = rows.length <= MAX_PER_PAGE ? MAX_PER_PAGE : 5;
  const rn = roundName(L, round), dates = span(ms), rnG = rn.replace(/kolo$/, "kola");
  const slides = [];
  for (let i = 0; i < rows.length; i += per) slides.push({ kind: "matches", rows: rows.slice(i, i + per), title: [rn, res ? "Rezultati" : "Raspored"] });
  if (!slides.length) slides.push({ kind: "matches", rows: [], title: [rn, "Raspored"] });
  // uz rezultate: brojke kola, tablica nakon kola i strijelci
  if (res) { const f = facts(ms, ix, L); if (f) slides.push({ kind: "facts", ...f, title: ["Brojke", rnG] }); }
  if (res && !isCup(L)) {
    const upTo = { ...db, matches: db.matches.filter((m) => m.comp !== compId || m.round <= round) };
    const tbl = standings(upTo, compId);
    // pomak u odnosu na tablicu nakon prethodnog kola (+ gore, - dolje)
    const before = round > 1 ? standings({ ...db, matches: db.matches.filter((m) => m.comp !== compId || m.round < round) }, compId) : [];
    const prev = before.some((r) => r.p) ? Object.fromEntries(before.map((r, i) => [r.club, i])) : null;
    if (tbl.some((r) => r.p)) slides.push({ kind: "table", rows: tbl.map((r, i) => ({ ...r, c: ix.club[r.club], move: prev && r.club in prev ? prev[r.club] - i : null })),
      zones: L.zones || {}, title: ["Tablica", `nakon ${rnG}`] });
    if (C.league === "1-hmnl") {
      const sc = scorers(upTo, compId).filter((r) => r.goals);
      const cut = sc.length > 10 ? sc[9].goals : 0;
      const top = sc.filter((r, i) => i < 10 || r.goals === cut).slice(0, 12);
      if (top.length) slides.push({ kind: "scorers", rows: top.map((r) => ({ ...r, name: playerName(ix.player[r.player]), c: ix.club[r.club] })), title: ["Strijelci", `nakon ${rnG}`] });
    }
  }
  const post = {
    pal, cat: pal.cat, league: C.league === "kup" ? "Seniori" : C.league === "1-hmnl" ? "SuperSport HMNL" : L.name,
    dates, res, sub: res ? "službeni rezultati" : "službeni termini", slides,
  };
  post.caption = caption(post, C.league, L, rn, rows, slides);
  return post;
}

// ---------- opis objave i hashtagovi ----------
const TAGS = {
  "1-hmnl": ["#SuperSportHMNL", "#SHMNL", "#futsalcroatia"],
  juniori: ["#HMNLjuniori", "#U19", "#futsalmladi"],
  kadeti: ["#HMNLkadeti", "#U17", "#futsalmladi"],
  kup: ["#HrvatskiKup", "#futsalkup"],
};
const tag = (n) => "#" + n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/[^A-Za-z0-9]/g, "");
function caption(post, lid, L, rn, rows, slides) {
  const clubs = [...new Set(rows.flatMap((r) => [r.home.name, r.away.name]))].slice(0, 12).map(tag);
  const tags = ["#futsal", "#malinogomet", "#futsalhrvatska", ...(TAGS[lid] || []), ...clubs, "#hmnlhr"].slice(0, 30).join(" ");
  const head = `${lid === "1-hmnl" ? "SuperSport HMNL" : L.name} · ${rn}`;
  if (!post.res) {
    const lines = rows.map((r) => `▫️ ${r.home.name} – ${r.away.name}${r.s ? ` ${r.s[0]}:${r.s[1]}` : r.time ? ` · ${r.day} ${r.time}` : " · termin naknadno"}${r.city ? ` · ${r.city}` : ""}`);
    return `📅 ${head} | ${post.dates}\n\n${lines.join("\n")}\n\n📺 Prijenosi, rezultati i statistika na hmnl.hr\n\n${tags}`;
  }
  const lines = rows.map((r) => `${r.home.name} ${r.s ? `${r.s[0]}:${r.s[1]}` : "–"} ${r.away.name}${r.so ? ` (11 m ${r.so[0]}:${r.so[1]})` : ""}`);
  const extra = slides.some((x) => x.kind === "table") ? `📊 ${slides.some((x) => x.kind === "scorers") ? "Tablica i strijelci" : "Tablica"} u objavi ➡️\n` : "";
  return `⚽ ${head}: rezultati\n\n${lines.join("\n")}\n\n${extra}Strijelci po minutama i detaljna statistika na hmnl.hr\n\n${tags}`;
}

function span(ms) {
  if (!ms.length) return "";
  const ds = ms.map((m) => new Date(m.date));
  let a = new Date(Math.min(...ds)), b = new Date(Math.max(...ds));
  if (ms.every((m) => m.timeTbd)) {               // bez satnice: vikend pet – ned
    const back = { 5: 0, 6: 1, 0: 2 }[a.getDay()] ?? a.getDay() - 5;
    a = new Date(a); a.setDate(a.getDate() - back); b = new Date(a); b.setDate(a.getDate() + 2);
  }
  const f = (d, m) => `${DAYS[d.getDay()]} ${d.getDate()}.${m ? ` ${d.getMonth() + 1}.` : ""}`;
  if (a.toDateString() === b.toDateString()) return f(a, true);
  return `${f(a, a.getMonth() !== b.getMonth())} – ${f(b, true)}`;
}

const JERSEY = new Path2D("M13 4.5 7.5 6.6 1.8 12.6l4.6 6.6 3.8-2.7V36.5h19.6V16.5l3.8 2.7 4.6-6.6-5.7-6-5.5-2.1Q20 9.5 13 4.5Z");
const SLEEVES = new Path2D("M1.8 12.6 6.4 19.2l2.4-1.7L4.2 11Z M38.2 12.6 33.6 19.2l-2.4-1.7L35.8 11Z");
const COLLAR = new Path2D("M13 4.5Q20 9.5 27 4.5");
function jersey(ctx, kit, x, y, s) {
  const k = kit?.shirt ? kit : { shirt: "#cfd6de", trim: "#8995a3" };
  ctx.save(); ctx.translate(x, y); ctx.scale(s / 40, s / 40);
  ctx.fillStyle = k.shirt; ctx.fill(JERSEY); ctx.lineWidth = 1; ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineJoin = "round"; ctx.stroke(JERSEY);
  ctx.fillStyle = k.trim; ctx.fill(SLEEVES); ctx.strokeStyle = k.trim; ctx.lineWidth = 2.2; ctx.stroke(COLLAR);
  ctx.restore();
}
function text(ctx, t, x, y, { font, color, align = "left", ls = 0, upper = false, max }) {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  if ("letterSpacing" in ctx) ctx.letterSpacing = ls + "px";
  const s = upper ? t.toLocaleUpperCase("hr") : t;
  ctx.fillText(s, x, y, max);
  const w = ctx.measureText(s).width; if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  return w;
}
// najveći font (do max) s kojim tekst stane u širinu
function fit(ctx, t, weight, max, min, width) {
  for (let f = max; f > min; f--) { ctx.font = `${weight} ${f}px ${RC}`; if (ctx.measureText(t.toLocaleUpperCase("hr")).width <= width) return f; }
  return min;
}

export function drawPage(ctx, post, pageIx, theme = "dark") {
  const P = post.pal, T = theme === "light" ? LIGHT : DARK, light = theme === "light";
  const bg = light ? T.bg : P.bg, row = light ? T.row : P.row, deep = light ? T.deep : P.deep;
  const slide = post.slides[pageIx], rows = slide.rows, n = rows.length, many = post.slides.length > 1;
  ctx.clearRect(0, 0, W, H); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // linije terena (samo tamna tema)
  if (!light) {
    ctx.save(); ctx.globalAlpha = 0.06; ctx.strokeStyle = "#fff"; ctx.lineWidth = 5;
    ctx.strokeRect(40, 40, 1000, 1270); ctx.beginPath(); ctx.moveTo(40, 675); ctx.lineTo(1040, 675); ctx.stroke();
    ctx.beginPath(); ctx.arc(540, 675, 150, 0, 2 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(330, 40); ctx.lineTo(330, 120); ctx.arc(540, 120, 210, Math.PI, 0, true); ctx.lineTo(750, 40); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(330, 1310); ctx.lineTo(330, 1230); ctx.arc(540, 1230, 210, Math.PI, 0); ctx.lineTo(750, 1310); ctx.stroke();
    ctx.restore();
  }

  // zaglavlje
  const headH = 364, onHead = light ? P.on : T.fg;
  if (light) { ctx.fillStyle = P.acc; ctx.fillRect(0, 0, W, headH); }
  else { const g = ctx.createLinearGradient(PAD, 0, W - PAD, 0); g.addColorStop(0, P.acc); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(PAD, headH - 4, W - 2 * PAD, 4); }
  // oznaka kategorije: [KATEGORIJA][LIGA]
  ctx.font = `900 26px ${RC}`; if ("letterSpacing" in ctx) ctx.letterSpacing = "3px";
  const cw = ctx.measureText(post.cat.toLocaleUpperCase("hr")).width + 28;
  ctx.font = `700 26px ${RC}`; const lw = ctx.measureText(post.league.toLocaleUpperCase("hr")).width + 28;
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  const cy = 56, ch = 44;
  ctx.fillStyle = light ? P.on : P.acc; ctx.fillRect(PAD, cy, cw, ch);
  ctx.strokeStyle = light ? P.on : P.acc; ctx.lineWidth = 2; ctx.strokeRect(PAD + cw + 1, cy + 1, lw - 2, ch - 2);
  text(ctx, post.cat, PAD + 14, cy + 33, { font: `900 26px ${RC}`, color: light ? P.acc : P.on, ls: 3, upper: true });
  text(ctx, post.league, PAD + cw + 14, cy + 33, { font: `700 26px ${RC}`, color: onHead, ls: 3, upper: true });
  // naslov
  const tf = fit(ctx, slide.title[0], 900, 112, 70, 620), tf2 = fit(ctx, slide.title[1], 900, 112, 60, 620);
  text(ctx, slide.title[0], PAD - 4, 222, { font: `900 ${tf}px ${RC}`, color: onHead, upper: true });
  ctx.save(); if (light) ctx.globalAlpha = 0.55;
  text(ctx, slide.title[1], PAD - 4, 320, { font: `900 ${tf2}px ${RC}`, color: light ? P.on : P.acc, upper: true });
  ctx.restore();
  text(ctx, post.dates, W - PAD, 292, { font: `700 30px ${RC}`, color: onHead, align: "right", ls: 1.5, upper: true });
  ctx.save(); ctx.globalAlpha = 0.7;
  text(ctx, post.sub + (many ? `  ·  ${pageIx + 1}/${post.slides.length}` : ""), W - PAD, 322, { font: `500 21px ${RB}`, color: onHead, align: "right" });
  ctx.restore();

  const Tt = { T, light, row, deep, top: headH + 30, bottom: H - 44 - 42 - 22 - 30 };
  if (slide.kind === "table") drawTable(ctx, P, Tt, slide);
  else if (slide.kind === "scorers") drawScorers(ctx, P, Tt, slide);
  else if (slide.kind === "facts") drawFacts(ctx, P, Tt, slide);
  else drawMatches(ctx, P, Tt, rows);
  footer(ctx, P, T, light);
}

function drawMatches(ctx, P, { T, light, row, deep }, rows) {
  const n = rows.length, headH = 364;
  // utakmice
  const rh = n >= 6 ? 128 : 148, gap = n >= 6 ? 12 : 16, top = headH + 30, bottom = H - 44 - 42 - 22 - 30;
  const total = n * rh + Math.max(0, n - 1) * gap;
  let y = top + Math.max(0, (bottom - top - total) / 2);
  const x0 = PAD, side = (W - 2 * PAD - 196) / 2, mx = x0 + side, js = 58;
  if (!n) text(ctx, "Raspored još nije unesen.", W / 2, top + 200, { font: `700 40px ${RC}`, color: T.muted, align: "center" });
  for (const r of rows) {
    if (light) { ctx.fillStyle = "rgba(16,26,44,.06)"; ctx.fillRect(x0, y + rh, W - 2 * PAD, 2); }
    ctx.fillStyle = row; ctx.fillRect(x0, y, W - 2 * PAD, rh);
    const cyRow = y + rh / 2, fin = !!r.s;
    // domaćin
    const nameW = side - 22 - js - 16 - 22;
    const fh = fit(ctx, r.home.name, 700, 34, 20, nameW), fa = fit(ctx, r.away.name, 700, 34, 20, nameW);
    jersey(ctx, r.home.kit, mx - 22 - js, cyRow - js / 2 - (fin ? 0 : 6), js);
    ctx.save(); if (r.w < 0) ctx.globalAlpha = 0.5;
    text(ctx, r.home.name, mx - 22 - js - 16, cyRow + fh * 0.36 - (fin ? 0 : 6), { font: `700 ${fh}px ${RC}`, color: T.fg, align: "right", upper: true });
    ctx.restore();
    // gost
    jersey(ctx, r.away.kit, mx + 196 + 22, cyRow - js / 2 - (fin ? 0 : 6), js);
    ctx.save(); if (r.w > 0) ctx.globalAlpha = 0.5;
    text(ctx, r.away.name, mx + 196 + 22 + js + 16, cyRow + fa * 0.36 - (fin ? 0 : 6), { font: `700 ${fa}px ${RC}`, color: T.fg, upper: true });
    ctx.restore();
    // sredina: termin ili rezultat
    ctx.fillStyle = fin ? P.acc : deep; ctx.fillRect(mx, y, 196, rh);
    if (fin) {
      text(ctx, `${r.s[0]}:${r.s[1]}`, mx + 98, cyRow + 18, { font: `900 68px ${RC}`, color: P.on, align: "center", ls: 1 });
      ctx.save(); ctx.globalAlpha = 0.75;
      text(ctx, r.so ? `11 m ${r.so[0]}:${r.so[1]}` : "kraj", mx + 98, cyRow + 46, { font: `700 19px ${RC}`, color: P.on, align: "center", ls: 1.5, upper: true });
      ctx.restore();
    } else if (r.time) {
      text(ctx, r.day, mx + 98, cyRow - 22, { font: `700 21px ${RC}`, color: T.muted, align: "center", ls: 2, upper: true });
      text(ctx, r.time, mx + 98, cyRow + 30, { font: `900 52px ${RC}`, color: T.fg, align: "center" });
    } else {
      text(ctx, "termin", mx + 98, cyRow - 4, { font: `700 24px ${RC}`, color: T.muted, align: "center", ls: 1.5, upper: true });
      text(ctx, "naknadno", mx + 98, cyRow + 24, { font: `700 24px ${RC}`, color: T.muted, align: "center", ls: 1.5, upper: true });
    }
    // grad i prijenos (samo raspored)
    if (!fin) {
      if (r.city) { ctx.font = `400 19px ${RB}`; let t = r.city;   // dvorana; predugačka se skrati
        while (t.length > 4 && ctx.measureText(t).width > side + 120) t = t.slice(0, -2).trimEnd() + "…";
        text(ctx, t, x0 + 22, y + rh - 14, { font: `400 19px ${RB}`, color: T.muted }); }
      if (r.tv) {
        const tw = text(ctx, r.tv, W - PAD - 22, y + rh - 14, { font: `700 16px ${RC}`, color: T.fg, align: "right", ls: 1.6, upper: true });
        ctx.fillStyle = light ? T.fg : P.acc; ctx.beginPath(); ctx.arc(W - PAD - 22 - tw - 12, y + rh - 20, 4, 0, 2 * Math.PI); ctx.fill();
      }
    }
    y += rh + gap;
  }
}

function footer(ctx, P, T, light) {
  // podnožje
  const fy = H - 44 - 42 - 22;
  ctx.fillStyle = light ? T.line : DARK.line; ctx.fillRect(PAD, fy, W - 2 * PAD, 2);
  const bw = text(ctx, "hmnl", PAD, H - 52, { font: `900 42px ${RC}`, color: T.fg });
  ctx.save(); if (light) ctx.globalAlpha = 0.5;
  text(ctx, ".hr", PAD + bw, H - 52, { font: `900 42px ${RC}`, color: light ? T.fg : P.acc });
  ctx.restore();
  text(ctx, "Neslužbena stranica · hmnl.hr", W - PAD, H - 58, { font: `400 18px ${RB}`, color: T.muted, align: "right" });
}

// tablica po bodovima: #, klub, U, P, N, I, GR, B
function drawTable(ctx, P, { T, light, row, deep, top, bottom }, slide) {
  const rows = slide.rows, n = rows.length, x0 = PAD, x1 = W - PAD;
  const hh = 44, rh = Math.min(68, Math.floor((bottom - top - hh) / n));
  let y = top + Math.max(0, (bottom - top - hh - rh * n) / 2);
  const cols = [["U", "p"], ["P", "w"], ["N", "d"], ["I", "l"], ["GR", "gd"], ["B", "pts"]];
  const cx = (i) => (i === cols.length - 1 ? x1 - 55 : x1 - 150 - (cols.length - 2 - i) * 74);
  cols.forEach(([h], i) => text(ctx, h, cx(i), y + 30, { font: `700 20px ${RC}`, color: T.muted, align: "center", ls: 2 }));
  text(ctx, "#", x0 + 30, y + 30, { font: `700 20px ${RC}`, color: T.muted, align: "center" });
  text(ctx, "Klub", x0 + 160, y + 30, { font: `700 20px ${RC}`, color: T.muted, ls: 2, upper: true });
  y += hh;
  rows.forEach((r, i) => {
    ctx.fillStyle = i % 2 ? deep : row; ctx.fillRect(x0, y, x1 - x0, rh);
    const z = zoneOf(slide.zones, i, n), mid = y + rh / 2;
    const zc = z === "z-a2" || z === "z-a" ? P.acc : z === "z-b" ? "#e0453b" : z === "z-q" ? "#e07b16" : null;
    if (zc) { ctx.fillStyle = zc; ctx.fillRect(x0, y, 8, rh); }
    text(ctx, String(i + 1), x0 + 30, mid + 10, { font: `900 28px ${RC}`, color: T.fg, align: "center" });
    // strelica pomaka: zelena gore, crvena dolje, siva crtica bez promjene
    const ax = x0 + 72;
    if (r.move > 0 || r.move < 0) {
      const up = r.move > 0, c = up ? (light ? "#14894a" : "#3cd07f") : (light ? "#d3362b" : "#ff6259");
      ctx.fillStyle = c; ctx.beginPath();
      if (up) { ctx.moveTo(ax - 10, mid); ctx.lineTo(ax + 10, mid); ctx.lineTo(ax, mid - 14); }
      else { ctx.moveTo(ax - 10, mid - 12); ctx.lineTo(ax + 10, mid - 12); ctx.lineTo(ax, mid + 2); }
      ctx.fill();
      text(ctx, String(Math.abs(r.move)), ax, mid + 24, { font: `700 21px ${RC}`, color: c, align: "center" });
    } else if (r.move === 0) { ctx.fillStyle = T.muted; ctx.fillRect(ax - 7, mid - 2, 14, 3); }
    jersey(ctx, r.c?.kit, x0 + 100, mid - 21, 42);
    const nf = fit(ctx, r.c?.name || r.club, 700, 30, 18, cx(0) - 40 - (x0 + 160));
    text(ctx, r.c?.name || r.club, x0 + 160, mid + nf * 0.36, { font: `700 ${nf}px ${RC}`, color: T.fg, upper: true });
    cols.forEach(([, k], j) => {
      const last = j === cols.length - 1, v = k === "gd" && r.gd > 0 ? "+" + r.gd : String(r[k]);
      if (last) { ctx.fillStyle = P.acc; ctx.fillRect(x1 - 110, y, 110, rh); }
      text(ctx, v, cx(j), mid + 10, { font: `${last ? 900 : 700} ${last ? 32 : 27}px ${RC}`, color: last ? P.on : T.fg, align: "center" });
    });
    y += rh;
  });
}

// strijelci: #, igrač, klub, golovi
function drawScorers(ctx, P, { T, light, row, deep, top, bottom }, slide) {
  const rows = slide.rows, n = rows.length, x0 = PAD, x1 = W - PAD;
  const rh = Math.min(76, Math.floor((bottom - top) / n));
  let y = top + Math.max(0, (bottom - top - rh * n) / 2), prev = null, pos = 0;
  rows.forEach((r, i) => {
    if (r.goals !== prev) { pos = i + 1; prev = r.goals; }
    ctx.fillStyle = i % 2 ? deep : row; ctx.fillRect(x0, y, x1 - x0, rh);
    const mid = y + rh / 2;
    text(ctx, i && rows[i - 1].goals === r.goals ? "" : `${pos}.`, x0 + 40, mid + 11, { font: `900 30px ${RC}`, color: T.muted, align: "center" });
    const nf = fit(ctx, r.name, 700, 34, 20, 520);
    text(ctx, r.name, x0 + 90, mid + nf * 0.36, { font: `700 ${nf}px ${RC}`, color: T.fg, upper: true });
    jersey(ctx, r.c?.kit, x1 - 400, mid - 20, 40);
    const cf = fit(ctx, r.c?.name || "", 500, 24, 16, 230);
    text(ctx, r.c?.name || "", x1 - 350, mid + 8, { font: `500 ${cf}px ${RC}`, color: T.muted, upper: true });
    ctx.fillStyle = P.acc; ctx.fillRect(x1 - 96, y, 96, rh);
    text(ctx, String(r.goals), x1 - 48, mid + 14, { font: `900 40px ${RC}`, color: P.on, align: "center" });
    y += rh;
  });
}

// ---------- brojke kola ----------
const golova = (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "gol" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "gola" : "golova"}`;
function facts(ms, ix, L) {
  const fin = ms.filter((m) => m.status === "finished" && score(m));
  if (!fin.length) return null;
  const S = new Map(fin.map((m) => [m, score(m)]));
  const total = fin.reduce((a, m) => a + S.get(m)[0] + S.get(m)[1], 0);
  const wdl = [0, 0, 0]; for (const m of fin) { const [h, a] = S.get(m); wdl[h > a ? 0 : h === a ? 1 : 2]++; }
  const tiles = [["Golova", String(total)], ["Po utakmici", (total / fin.length).toFixed(1).replace(".", ",")], ["Domaćin · N · gost", wdl.join(" · ")]];
  const seniors = /senior/i.test(L.category || "");
  const pair = (m) => ({ a: ix.club[m.home], b: ix.club[m.away] });
  const items = [];
  const big = [...fin].sort((x, y) => Math.abs(S.get(y)[0] - S.get(y)[1]) - Math.abs(S.get(x)[0] - S.get(x)[1]))[0];
  const bs = S.get(big);
  if (bs[0] !== bs[1]) items.push({ label: "Najveća pobjeda", ...pair(big), value: `${bs[0]}:${bs[1]}` });
  const most = [...fin].sort((x, y) => (S.get(y)[0] + S.get(y)[1]) - (S.get(x)[0] + S.get(x)[1]))[0];
  if (most !== big || bs[0] === bs[1]) items.push({ label: "Najviše golova", ...pair(most), value: golova(S.get(most)[0] + S.get(most)[1]) });
  // golovi s poznatim vremenom
  const goals = fin.flatMap((m) => m.events.filter((e) => (e.type === "goal" || e.type === "owngoal") && Number.isFinite(e.sec) && e.period <= 2)
    .map((e) => ({ m, e, side: (e.side === "home") !== (e.type === "owngoal") ? "home" : "away" })));
  const who = (g) => {
    const club = ix.club[g.m[g.side]], opp = ix.club[g.m[g.side === "home" ? "away" : "home"]];
    const pl = seniors && g.e.type === "goal" && ix.player[g.e.player] ? playerName(ix.player[g.e.player]) : null;
    return { club, text: pl || club.name, note: `${pl ? club.name + ", " : ""}protiv ${opp.name}` };
  };
  if (goals.length) {
    goals.sort((x, y) => absSec(x.e) - absSec(y.e));
    const f0 = goals[0], fl = goals[goals.length - 1];
    items.push({ label: "Najbrži gol", ...who(f0), value: goalTime(f0.e) });
    if (fl !== f0) items.push({ label: "Najkasniji gol", ...who(fl), value: goalTime(fl.e) });
  }
  const cb = fin.map((m) => ({ m, c: comeback(m) })).filter((x) => x.c).sort((x, y) => y.c.deficit - x.c.deficit)[0];
  if (cb) { const side = cb.c.side, club = ix.club[cb.m[side]], opp = ix.club[cb.m[side === "home" ? "away" : "home"]];
    const fr = side === "home" ? cb.c.from : [cb.c.from[1], cb.c.from[0]], fi = side === "home" ? cb.c.final : [cb.c.final[1], cb.c.final[0]];
    items.push({ label: "Preokret kola", club, text: club.name, note: `protiv ${opp.name}, s ${fr[0]}:${fr[1]} do ${fi[0]}:${fi[1]}`, value: `${fi[0]}:${fi[1]}` }); }
  if (seniors) {
    const t = {}; for (const m of fin) for (const e of m.events) if (e.type === "goal" && e.player) (t[e.player] ||= { p: e.player, club: m[e.side], n: 0 }).n++;
    const best = Object.values(t).sort((a, b) => b.n - a.n), top = best.filter((x) => x.n === best[0]?.n && x.n >= 2);
    if (top.length && top.length <= 2) for (const x of top) items.push({ label: "Igrač kola", club: ix.club[x.club], text: playerName(ix.player[x.p]), note: ix.club[x.club].name, value: golova(x.n) });
  }
  return { tiles, rows: items.slice(0, 6) };
}

function drawFacts(ctx, P, { T, light, row, deep, top, bottom }, slide) {
  const x0 = PAD, x1 = W - PAD, gap = 12, tw = (x1 - x0 - 2 * gap) / 3, th = 150;
  const rows = slide.rows, k = rows.length;
  const rh = Math.min(112, Math.floor((bottom - top - th - 24 - (k - 1) * 10) / Math.max(1, k)));
  let y = top + Math.max(0, (bottom - top - th - 24 - k * rh - (k - 1) * 10) / 2);
  slide.tiles.forEach(([l, v], i) => {
    const x = x0 + i * (tw + gap);
    ctx.fillStyle = i ? row : P.acc; ctx.fillRect(x, y, tw, th);
    text(ctx, v, x + tw / 2, y + 92, { font: `900 ${fit(ctx, v, 900, 76, 40, tw - 30)}px ${RC}`, color: i ? T.fg : P.on, align: "center" });
    ctx.save(); ctx.globalAlpha = i ? 1 : 0.75;
    text(ctx, l, x + tw / 2, y + 128, { font: `700 19px ${RC}`, color: i ? T.muted : P.on, align: "center", ls: 2, upper: true });
    ctx.restore();
  });
  y += th + 24;
  const lw = 210, vw = 170;
  for (const r of rows) {
    ctx.fillStyle = row; ctx.fillRect(x0, y, x1 - x0, rh);
    ctx.fillStyle = deep; ctx.fillRect(x0, y, lw, rh);
    const mid = y + rh / 2, words = r.label.split(" ");
    const l1 = words.slice(0, Math.ceil(words.length / 2)).join(" "), l2 = words.slice(Math.ceil(words.length / 2)).join(" ");
    text(ctx, l1, x0 + 22, mid - (l2 ? 4 : -8), { font: `700 22px ${RC}`, color: light ? T.fg : P.acc, ls: 2, upper: true });
    if (l2) text(ctx, l2, x0 + 22, mid + 22, { font: `700 22px ${RC}`, color: light ? T.fg : P.acc, ls: 2, upper: true });
    const cx = x0 + lw + 22, cw = x1 - vw - 22 - cx;
    if (r.a) {   // utakmica: dva dresa i imena
      jersey(ctx, r.a.kit, cx, mid - 20, 40); jersey(ctx, r.b.kit, cx + 46, mid - 20, 40);
      const t = `${r.a.name} – ${r.b.name}`, f = fit(ctx, t, 700, 30, 18, cw - 104);
      text(ctx, t, cx + 104, mid + f * 0.36, { font: `700 ${f}px ${RC}`, color: T.fg, upper: true });
    } else {
      jersey(ctx, r.club?.kit, cx, mid - 22, 44);
      const f = fit(ctx, r.text, 700, 32, 18, cw - 60);
      text(ctx, r.text, cx + 60, mid + (r.note ? -2 : f * 0.36), { font: `700 ${f}px ${RC}`, color: T.fg, upper: true });
      if (r.note) { ctx.font = `400 19px ${RB}`; let n = r.note; while (n.length > 4 && ctx.measureText(n).width > cw - 60) n = n.slice(0, -2).trimEnd() + "…";
        text(ctx, n, cx + 60, mid + 26, { font: `400 19px ${RB}`, color: T.muted }); }
    }
    ctx.fillStyle = P.acc; ctx.fillRect(x1 - vw, y, vw, rh);
    text(ctx, r.value, x1 - vw / 2, mid + 14, { font: `900 ${fit(ctx, r.value, 900, 42, 22, vw - 24)}px ${RC}`, color: P.on, align: "center" });
    y += rh + 10;
  }
}
