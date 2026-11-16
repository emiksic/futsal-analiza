import { useEffect, useState } from "react";
import { useStore, voteCounts, castVote } from "../lib/store.js";
import { winner } from "../lib/derive.js";

// Glasanje "Tko pobjeđuje?" bez prijave. Zasad ga vidi samo admin; kad je spremno za javnost, stavi na true.
export const VOTES_PUBLIC = false;
export const useVotesVisible = () => { const st = useStore(); return VOTES_PUBLIC || st.isAdmin; };

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

export function Vote({ m, ix }) {
  const visible = useVotesVisible();
  const adm = useStore().isAdmin;
  const league = ix.comp[m.comp]?.league;
  const cup = league === "kup";
  const open = voteOpen(m);
  const [counts, setCounts] = useState(null);
  const [mine, setMine] = useState(() => myPicks()[m.id] || null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const on = visible && LEAGUES.includes(league) && (open || m.status !== "scheduled");

  useEffect(() => {
    if (!on) return;
    let live = true;
    voteCounts([m.id]).then((c) => live && setCounts(c[m.id] || { 1: 0, X: 0, 2: 0 }))
      .catch((e) => live && (setCounts(null), setErr(e.message)));
    return () => { live = false; };
  }, [on, m.id, m.status]);

  if (!on) return null;
  const total = counts ? counts[1] + counts.X + counts[2] : 0;
  if (!open && !total) return adm && err ? <div className="note" style={{ marginTop: 8 }}>Glasanje: {err}</div> : null;

  const H = ix.club[m.home], A = ix.club[m.away];
  const opts = [["1", H.name], ...(cup ? [] : [["X", "Neriješeno"]]), ["2", A.name]];
  const showBars = !!counts && (!!mine || !open);
  const w = winner(m), right = w == null ? null : w === 1 ? "1" : w === -1 ? "2" : "X";
  // postoci koji uvijek daju zbroj 100 (najveći ostatak)
  const P = (() => {
    const ks = opts.map((o) => o[0]); if (!total) return {};
    const raw = ks.map((k) => (counts[k] / total) * 100), fl = raw.map(Math.floor);
    let left = 100 - fl.reduce((a, b) => a + b, 0);
    raw.map((r, i) => [r - fl[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { fl[i]++; left--; } });
    return Object.fromEntries(ks.map((k, i) => [k, fl[i]]));
  })();
  const pct = (k) => P[k] || 0;

  async function vote(p) {
    if (busy) return;
    setBusy(true); setErr("");
    try { const c = await castVote(m.id, voterId(), p); setCounts(c); setMine(p); savePick(m.id, p); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <section className="panel vote" aria-label="Tko pobjeđuje?">
      <div className="vote-h">
        <b>{cup ? "Tko prolazi dalje?" : "Tko pobjeđuje?"}</b>
        <span className="note">
          {!VOTES_PUBLIC && "Vidi samo admin · "}
          {open ? (mine ? "Glas možeš promijeniti do početka utakmice." : "Glasaj prije početka utakmice.") : "Glasanje je zatvoreno."}
          {counts && total > 0 && ` · ${glasova(total)}`}
        </span>
      </div>
      <div className={`vote-opts n${opts.length}`}>
        {opts.map(([k, label]) => {
          const p = pct(k);
          const cls = ["vote-opt", mine === k && "mine", right === k && "right", showBars && "res"].filter(Boolean).join(" ");
          return (
            <button key={k} type="button" className={cls} disabled={!open || busy} onClick={() => vote(k)}
              aria-pressed={mine === k} title={open ? `Glasaj: ${label}` : undefined}>
              {showBars && <i style={{ width: `${p}%` }} />}
              <span className="vote-k">{k}</span>
              <span className="vote-l">{label}</span>
              {showBars && <span className="vote-p">{p}%</span>}
            </button>);
        })}
      </div>
      {right && total > 0 && <div className="note" style={{ marginTop: 8 }}>Točno je pogodilo {pct(right)}% glasača.</div>}
      {err && <div className="note" style={{ marginTop: 8, color: "var(--live)" }}>{err}</div>}
    </section>
  );
}
