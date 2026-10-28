import { useState } from "react";
import { href } from "../lib/router.js";
import { standings, scorers, compName, playerName } from "../lib/derive.js";
import { MatchRow } from "../components/MatchRow.jsx";
import { Jersey } from "../components/ui.jsx";

export function Club({ db, ix, id }) {
  const c = ix.club[id];
  const cur = db.seasons[0].id;
  const comps = db.comps.filter((x) => x.teams.includes(id) && x.season === cur);
  const [compSel, setComp] = useState(comps[0]?.id);
  if (!c) return <div className="page"><div className="panel empty">Klub ne postoji.</div></div>;
  const comp = ix.comp[compSel];
  const ms = db.matches.filter((m) => m.comp === compSel && (m.home === id || m.away === id)).sort((a, b) => a.date.localeCompare(b.date));
  const cat = comp ? ix.league[comp.league].category : null;
  const squad = db.players.filter((p) => p.club === id && p.season === cur && p.cat === cat).sort((a, b) => a.num - b.num);
  const st = comp ? scorers(db, comp.id) : [];
  const stat = Object.fromEntries(st.map((r) => [r.player, r]));
  const apps = {};
  for (const m of ms) for (const side of ["home", "away"]) if (m[side] === id) for (const pid of m.roster[side]?.players || []) apps[pid] = (apps[pid] || 0) + 1;
  return (
    <div className="page two">
      <main className="col">
        <section className="panel">
          <div className="chead">
            <Jersey kit={c.kit} size={64} title={`Dres: ${c.name}`} />
            <div>
              <h1>{c.name}</h1>
              <div className="muted">{c.city}, {ix.hall[c.hall]?.name}</div>
            </div>
          </div>
          <nav className="tabs" aria-label="Natjecanje">
            {comps.map((x) => <button key={x.id} aria-selected={x.id === compSel} onClick={() => setComp(x.id)}>{ix.league[x.league].name}</button>)}
          </nav>
          <div className="mlist">{ms.map((m) => <MatchRow key={m.id} m={m} ix={ix} showDay />)}</div>
        </section>
      </main>
      <aside className="col">
        {comp && <Position db={db} ix={ix} comp={comp} id={id} />}
        <section className="panel">
          <div className="ph"><h2>Igrači</h2><span className="aside">{cat}</span></div>
          <table className="squad">
            <thead><tr><th>#</th><th>Ime</th><th className="c" title="Nastupi">N</th><th className="c" title="Golovi">G</th><th className="c" title="Asistencije">A</th></tr></thead>
            <tbody>{squad.map((p) => (
              <tr key={p.id}>
                <td className="n">{p.num}</td>
                <td>{playerName(p)} {p.gk && <span className="tag">GK</span>}</td>
                <td className="c">{apps[p.id] || 0}</td><td className="c">{stat[p.id]?.goals || 0}</td><td className="c">{stat[p.id]?.assists || 0}</td>
              </tr>))}</tbody>
          </table>
          {squad.some((p) => !p.name) && <div className="note" style={{ padding: "10px 16px 14px" }}>Imena igrača još nisu unesena, prikazani su brojevi iz zapisnika.</div>}
        </section>
      </aside>
    </div>
  );
}

function Position({ db, ix, comp, id }) {
  const rows = standings(db, comp.id), i = rows.findIndex((r) => r.club === id), r = rows[i];
  if (!r) return null;
  return (
    <section className="panel">
      <div className="ph"><h2>{compName(ix, comp.id)}</h2><a className="more" href={href("liga", comp.league, comp.season, "tablica")}>Tablica</a></div>
      <div className="cmp" style={{ gridTemplateColumns: "repeat(4, 1fr)", display: "grid", textAlign: "center" }}>
        {[["Mjesto", `${i + 1}.`], ["Bodovi", r.pts], ["Bilanca", `${r.w}-${r.d}-${r.l}`], ["Golovi", `${r.gf}:${r.ga}`]].map(([k, v]) => (
          <div key={k}><div style={{ font: "700 26px/1 var(--display)" }}>{v}</div><div className="small muted">{k}</div></div>))}
      </div>
    </section>
  );
}
