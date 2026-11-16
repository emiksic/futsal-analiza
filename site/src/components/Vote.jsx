import { useEffect, useState } from "react";
import { voteCounts, castVote } from "../lib/store.js";
import { winner } from "../lib/derive.js";
import { Jersey } from "./ui.jsx";

// Glasanje "Tko pobjeđuje?" bez prijave (vidi supabase/glasanje-2026-11-16.sql).
// Svi mogu glasati; postoci se vide tek nakon glasanja, a nakon zatvaranja (početak utakmice) svima.
// Glas se ne može promijeniti.
const LEAGUES = ["1-hmnl", "kup"];          // samo seniori; u kupu nema X (ide se do pobjednika)
const OPEN_DAYS = 8;
const VOTER_KEY = "hmnl-glasac", PICKS_KEY = "hmnl-glasovi";

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* privatni način ili blokirano */ } },
};
function voterId() {
  let id = ls.get(VOTER_KEY);
  if (!id) { id = crypto.randomUUID(); ls.set(VOTER_KEY, id); }
  return id;
}
const myPicks = () => { try { return JSON.parse(ls.get(PICKS_KEY) || "{}"); } catch { return {}; } };
const savePick = (mid, p) => ls.set(PICKS_KEY, JSON.stringify({ ...myPicks(), [mid]: p }));

const glasova = (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "glas" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "glasa" : "glasova"}`;

// Mora se podudarati s cast_vote u bazi.
export function voteOpen(m, now = Date.now()) {
  if (m.status !== "scheduled") return false;
  const t = new Date(m.date).getTime();
  return now >= t - OPEN_DAYS * 864e5 && (m.timeTbd || now < t);
}

// boja trake: dres, a ako je dres skoro bijel, rukavi; ako je i to svijetlo, siva
const light = (hex) => {
  const h = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!h) return true;
  const n = parseInt(h[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.82;
};
const barColor = (kit) => (!light(kit?.shirt) ? kit.shirt : !light(kit?.trim) ? kit.trim : "var(--muted)");

// postoci koji uvijek daju zbroj 100 (najveći ostatak)
function percents(keys, counts) {
  const total = keys.reduce((a, k) => a + (counts?.[k] || 0), 0); if (!total) return {};
  const raw = keys.map((k) => (counts[k] / total) * 100), fl = raw.map(Math.floor);
  let left = 100 - fl.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - fl[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { fl[i]++; left--; } });
  return Object.fromEntries(keys.map((k, i) => [k, fl[i]]));
}

export function Vote({ m, ix }) {
  const league = ix.comp[m.comp]?.league;
  const cup = league === "kup";
  const open = voteOpen(m);
  const [counts, setCounts] = useState(null);
  const [mine, setMine] = useState(() => myPicks()[m.id] || null);
  const [busy, setBusy] = useState(null);       // glas koji se upravo šalje
  const [err, setErr] = useState("");
  const on = LEAGUES.includes(league) && (open || m.status !== "scheduled");

  useEffect(() => {
    if (!on) return;
    let live = true;
    voteCounts([m.id]).then((c) => live && setCounts(c[m.id] || { 1: 0, X: 0, 2: 0 })).catch(() => live && setCounts(null));
    return () => { live = false; };
  }, [on, m.id, m.status]);

  if (!on) return null;
  const H = ix.club[m.home], A = ix.club[m.away];
  const opts = [
    { k: "1", label: H.name, kit: H.kit, color: barColor(H.kit) },
    ...(cup ? [] : [{ k: "X", label: "Neriješeno", color: "var(--muted)" }]),
    { k: "2", label: A.name, kit: A.kit, color: barColor(A.kit) },
  ];
  const total = counts ? opts.reduce((a, o) => a + counts[o.k], 0) : 0;
  if (!open && !total) return null;             // zatvoreno, a nitko nije glasao: ništa ne prikazujemo

  const reveal = !!counts && (!!mine || !open);
  const P = reveal ? percents(opts.map((o) => o.k), counts) : {};
  const w = winner(m), right = w == null ? null : w === 1 ? "1" : w === -1 ? "2" : "X";
  const done = m.status === "finished";

  async function vote(k) {
    if (busy || mine || !open) return;
    setBusy(k); setErr("");
    try { const r = await castVote(m.id, voterId(), k); setCounts(r.counts); setMine(r.mine); savePick(m.id, r.mine); }
    catch (e) { setErr(e.message || "Glas nije spremljen. Pokušaj ponovno."); }
    finally { setBusy(null); }
  }

  const sub = open
    ? (mine ? "Tvoj glas je zabilježen." : "Glas se ne može promijeniti. Rezultati se vide nakon glasanja.")
    : done ? (mine ? (mine === right ? "Pogodio si." : "Nisi pogodio.") : "Glasanje je završeno.")
    : "Glasanje je zatvoreno.";

  return (
    <section className="panel vote" aria-label={cup ? "Tko prolazi dalje?" : "Tko pobjeđuje?"}>
      <header className="vote-h">
        <h2>{cup ? "Tko prolazi dalje?" : "Tko pobjeđuje?"}</h2>
        {total > 0 && <span className="vote-n">{glasova(total)}</span>}
      </header>
      <div className={`vote-opts n${opts.length}${reveal ? " res" : ""}`} role="group">
        {opts.map((o) => {
          const p = P[o.k] ?? 0;
          const cls = ["vote-opt", mine === o.k && "mine", reveal && right === o.k && "right", busy === o.k && "busy",
            reveal && mine && mine !== o.k && "other"].filter(Boolean).join(" ");
          return (
            <button key={o.k} type="button" className={cls} disabled={!open || !!mine || !!busy} onClick={() => vote(o.k)}
              aria-pressed={mine === o.k} aria-label={reveal ? `${o.label}: ${p} %` : `Glasaj: ${o.label}`}>
              <span className="vote-ic">{o.kit ? <Jersey kit={o.kit} size={30} /> : <b>X</b>}</span>
              <span className="vote-l">{o.label}</span>
              {reveal && <span className="vote-p">{p}<small>%</small></span>}
              {reveal && <span className="vote-bar"><i style={{ width: `${p}%`, background: mine === o.k ? "var(--primary)" : o.color }} /></span>}
              {mine === o.k && <span className="vote-tag">Tvoj glas</span>}
              {reveal && right === o.k && <span className="vote-tag ok">Ishod</span>}
            </button>);
        })}
      </div>
      <div className={`vote-sub${err ? " err" : ""}`}>{err || sub}</div>
    </section>
  );
}
