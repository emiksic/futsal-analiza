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

// boja dijela trake: dres, a ako je skoro bijel, rukavi; ako je i to svijetlo, siva
const lum = (hex) => {
  const h = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!h) return 1;
  const n = parseInt(h[1], 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};
const ok = (hex) => lum(hex) < 0.82;
const barColor = (kit) => (ok(kit?.shirt) ? kit.shirt : ok(kit?.trim) ? kit.trim : "var(--muted)");

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
    { k: "1", label: H.name, kit: H.kit },
    ...(cup ? [] : [{ k: "X", label: "Neriješeno" }]),
    { k: "2", label: A.name, kit: A.kit },
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

  const q = cup ? "Tko prolazi dalje?" : "Tko pobjeđuje?";
  const sub = err || (open
    ? (mine ? `Hvala na glasu · ${glasova(total)}` : "Glasaj prije početka utakmice!")
    : done && mine ? `${mine === right ? "Pogodio si" : "Nisi pogodio"} · ${glasova(total)}`
    : `Glasanje je završeno · ${glasova(total)}`);
  return (
    <div className="vcard" aria-label={q}>
      <div className="vcard-h">
        <h3>{q}</h3>
        <div className={`vcard-sub${err ? " err" : ""}`}>{sub}</div>
      </div>
      <div className={`vcard-opts${reveal ? " res" : ""}`} role="group">
        {opts.map((o) => {
          const p = P[o.k] ?? 0;
          const cls = [mine === o.k && "mine", reveal && right === o.k && "right", busy === o.k && "busy"].filter(Boolean).join(" ");
          return (
            <button key={o.k} type="button" className={cls} disabled={!open || !!mine || !!busy} onClick={() => vote(o.k)}
              title={open && !mine ? `${o.label} · glas se ne može promijeniti` : o.label}
              aria-pressed={mine === o.k} aria-label={reveal ? `${o.label}: ${p} %` : `Glasaj: ${o.label}`}>
              {reveal && <i className="vcard-fill" style={{ width: `${p}%` }} />}
              <span className="vcard-ic">{o.kit ? <Jersey kit={o.kit} size={26} /> : "X"}</span>
              {reveal && <b className="vcard-p">{p}%</b>}
              {reveal && right === o.k && <span className="vcard-ok" aria-hidden>✓</span>}
            </button>);
        })}
      </div>
      {open && !mine && <div className="vcard-note">Glas se ne može promijeniti. Postoci se vide nakon glasanja.</div>}
    </div>
  );
}
