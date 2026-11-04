// Instagram objava za kolo (raspored ili rezultati), 1080×1350, crta se na canvas pa se preuzme kao PNG.
// Boja po kategoriji: seniori žuta, juniori zelena, kadeti narančasta, kup crvena. Tema tamna ili svijetla.
import { score, shootout, winner, roundName, isCup } from "./derive.js";

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
      city: hall?.city || "", tv: m.youtube || m.tv === "YouTube" ? "YouTube" : m.tv || null,
    };
  });
  const per = rows.length <= MAX_PER_PAGE ? MAX_PER_PAGE : 5;
  const pages = [];
  for (let i = 0; i < rows.length; i += per) pages.push(rows.slice(i, i + per));
  return {
    pal, cat: pal.cat, league: C.league === "kup" ? "Seniori" : C.league === "1-hmnl" ? "SuperSport HMNL" : L.name,
    title: [roundName(L, round), res ? "Rezultati" : "Raspored"], dates: span(ms), res,
    sub: res ? "službeno: HNS Semafor" : "termini prema HNS Semaforu", pages: pages.length ? pages : [[]],
  };
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
  const rows = post.pages[pageIx], n = rows.length, many = post.pages.length > 1;
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
  const tf = fit(ctx, post.title[0], 900, 112, 70, 620);
  text(ctx, post.title[0], PAD - 4, 222, { font: `900 ${tf}px ${RC}`, color: onHead, upper: true });
  ctx.save(); if (light) ctx.globalAlpha = 0.55;
  text(ctx, post.title[1], PAD - 4, 320, { font: `900 112px ${RC}`, color: light ? P.on : P.acc, upper: true });
  ctx.restore();
  text(ctx, post.dates, W - PAD, 292, { font: `700 30px ${RC}`, color: onHead, align: "right", ls: 1.5, upper: true });
  ctx.save(); ctx.globalAlpha = 0.7;
  text(ctx, post.sub + (many ? `  ·  ${pageIx + 1}/${post.pages.length}` : ""), W - PAD, 322, { font: `500 21px ${RB}`, color: onHead, align: "right" });
  ctx.restore();

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
      if (r.city) text(ctx, r.city, x0 + 22, y + rh - 14, { font: `400 19px ${RB}`, color: T.muted });
      if (r.tv) {
        const tw = text(ctx, r.tv, W - PAD - 22, y + rh - 14, { font: `700 16px ${RC}`, color: T.fg, align: "right", ls: 1.6, upper: true });
        ctx.fillStyle = light ? T.fg : P.acc; ctx.beginPath(); ctx.arc(W - PAD - 22 - tw - 12, y + rh - 20, 4, 0, 2 * Math.PI); ctx.fill();
      }
    }
    y += rh + gap;
  }

  // podnožje
  const fy = H - 44 - 42 - 22;
  ctx.fillStyle = light ? T.line : DARK.line; ctx.fillRect(PAD, fy, W - 2 * PAD, 2);
  const bw = text(ctx, "hmnl", PAD, H - 52, { font: `900 42px ${RC}`, color: T.fg });
  ctx.save(); if (light) ctx.globalAlpha = 0.5;
  text(ctx, ".hr", PAD + bw, H - 52, { font: `900 42px ${RC}`, color: light ? T.fg : P.acc });
  ctx.restore();
  text(ctx, "Neslužbena stranica · hmnl.hr", W - PAD, H - 58, { font: `400 18px ${RB}`, color: T.muted, align: "right" });
}
