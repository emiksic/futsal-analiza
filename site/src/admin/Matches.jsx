import { useState } from "react";
import { href, go } from "../lib/router.js";
import { update, uid } from "../lib/store.js";
import { score, fmtDay, fmtTime, currentRound, compName } from "../lib/derive.js";
import { Jersey, Icon, analysisPill } from "../components/ui.jsx";

export function Matches({ db, ix }) {
  const [comp, setComp] = useState(() => db.comps[0].id);
  const C = ix.comp[comp];
  const [round, setRound] = useState(() => currentRound(db, comp));
  const ms = db.matches.filter((m) => m.comp === comp && (round === "all" || m.round === +round)).sort((a, b) => a.date.localeCompare(b.date));
  const queue = db.matches.filter((m) => ["queued", "processing"].includes(m.analysis?.status)).sort((a, b) => a.date.localeCompare(b.date));
  const add = () => {
    const id = uid("m-");
    update((d) => { d.matches.push({ id, draft: true, comp, round: round === "all" ? 1 : +round, date: new Date().toISOString(), home: C.teams[0], away: C.teams[1],
      hall: ix.club[C.teams[0]].hall, status: "scheduled", youtube: "", roster: { home: null, away: null }, events: [], analysis: null }); });
    go("admin", "utakmica", id, "osnovno");
  };
  const rosterOk = (m) => m.roster?.home?.players?.length && m.roster?.away?.players?.length;
  return (
    <>
      <div className="ahead"><h1>Utakmice</h1><div className="r"><button className="btn primary" onClick={add}>{Icon.plus()} Nova utakmica</button></div></div>
      {queue.length > 0 && (
        <section className="panel">
          <div className="ph"><h2>Red za video analizu</h2><span className="aside">obrađuje se na laptopu ili PC-ju</span></div>
          <div className="queue">
            {queue.map((m) => (
              <div className="qrow" key={m.id}>
                <div>
                  <a href={href("admin", "utakmica", m.id, "analiza")} style={{ fontWeight: 600 }}>{ix.club[m.home].name} – {ix.club[m.away].name}</a>
                  <div className="small muted">{compName(ix, m.comp)}, {m.round}. kolo, {fmtDay(m.date)}</div>
                  {m.analysis.status === "processing" && <div className="prog-bar" style={{ maxWidth: 240 }}><i style={{ width: `${Math.round((m.analysis.progress || 0) * 100)}%` }} /></div>}
                </div>
                {analysisPill(m.analysis)}
              </div>))}
            <div className="qrow"><span className="small muted">Pokretanje obrade: <code>python scripts/analyze.py --queue</code>. Skripta sama preuzima utakmice iz reda i vraća rezultate.</span></div>
          </div>
        </section>)}
      <section className="panel">
        <div className="toolbar" style={{ paddingTop: 14 }}>
          <select className="select" aria-label="Natjecanje" value={comp} onChange={(e) => { setComp(e.target.value); setRound(currentRound(db, e.target.value)); }}>
            {db.comps.map((c) => <option key={c.id} value={c.id}>{compName(ix, c.id)}</option>)}
          </select>
          <select className="select" aria-label="Kolo" value={round} onChange={(e) => setRound(e.target.value)}>
            <option value="all">Sva kola</option>
            {Array.from({ length: C.rounds }, (_, i) => <option key={i} value={i + 1}>{i + 1}. kolo</option>)}
          </select>
          <span className="grow" />
          <span className="small muted">{ms.length} utakmica</span>
        </div>
        <div className="tbl-wrap">
          <table className="atbl">
            <thead><tr><th>Kolo</th><th>Termin</th><th>Utakmica</th><th>Rezultat</th><th>Zapisnik</th><th>Analiza</th><th /></tr></thead>
            <tbody>{ms.map((m) => {
              const s = score(m);
              return (
                <tr key={m.id}>
                  <td className="nowrap">{m.round}.</td>
                  <td className="nowrap">{fmtDay(m.date)}<div className="small muted">{fmtTime(m.date)}</div></td>
                  <td><span className="mt"><Jersey kit={ix.club[m.home].kit} size={18} />{ix.club[m.home].name}<span className="muted">–</span><Jersey kit={ix.club[m.away].kit} size={18} />{ix.club[m.away].name}</span></td>
                  <td className="nowrap" style={{ font: "700 17px/1 var(--display)" }}>{s && m.status === "finished" ? `${s[0]}:${s[1]}` : <span className="muted small" style={{ fontFamily: "var(--body)", fontWeight: 400 }}>zakazano</span>}</td>
                  <td>{rosterOk(m) ? <span className="pill done">unesen</span> : <span className="pill">nema</span>}</td>
                  <td>{analysisPill(m.analysis) || <span className="small muted">{m.youtube ? "ima snimku" : "—"}</span>}</td>
                  <td className="nowrap"><a className="btn sm" href={href("admin", "utakmica", m.id, "osnovno")}>Uredi</a></td>
                </tr>);
            })}</tbody>
          </table>
        </div>
      </section>
    </>
  );
}
