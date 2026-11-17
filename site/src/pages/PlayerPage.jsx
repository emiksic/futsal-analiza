// Stranica igrača (seniori): nastupi, golovi, asistencije, kartoni po natjecanju i popis utakmica kao na Sofascoreu.
// Igrači koji su prešli u drugi klub (players.person) spajaju se u jednu stranicu.
import { href } from "../lib/router.js";
import { personOf, playerName, score, winner, goalTime, absSec, fmtDay, roundName, isCup } from "../lib/derive.js";
import { Jersey, Icon } from "../components/ui.jsx";
import { hasPlayerPage } from "../components/PLink.jsx";

function collect(db, ix, ids) {
  const out = [];
  for (const m of db.matches) {
    if (m.status !== "finished" && m.status !== "live") continue;
    for (const side of ["home", "away"]) {
      const r = m.roster?.[side];
      const pid = (r?.players || []).find((x) => ids.has(x));
      if (!pid) continue;
      const evs = m.events.filter((e) => ids.has(e.player) || ids.has(e.assist)).sort((a, b) => absSec(a) - absSec(b));
      out.push({
        m, side, pid,
        start: !!r.start?.includes(pid), gk: !!r.gk?.includes(pid), cap: r.cap === pid,
        num: r.num?.[pid] ?? ix.player[pid]?.num,
        goals: evs.filter((e) => e.type === "goal" && ids.has(e.player)),
        own: evs.filter((e) => e.type === "owngoal" && ids.has(e.player)),
        assists: evs.filter((e) => e.type === "goal" && ids.has(e.assist)),
        yellow: evs.filter((e) => e.type === "yellow" && ids.has(e.player)),
        red: evs.filter((e) => e.type === "red" && ids.has(e.player)),
        penMiss: evs.filter((e) => e.type === "penmiss" && ids.has(e.player)),
      });
      break;
    }
  }
  return out.sort((a, b) => b.m.date.localeCompare(a.m.date));
}

const sum = (rows) => rows.reduce((t, r) => ({
  n: t.n + 1, start: t.start + (r.start ? 1 : 0), g: t.g + r.goals.length, a: t.a + r.assists.length,
  y: t.y + r.yellow.length, r: t.r + r.red.length,
}), { n: 0, start: 0, g: 0, a: 0, y: 0, r: 0 });

export function PlayerPage({ db, ix, id }) {
  const p = ix.player[id];
  if (!p || !hasPlayerPage(p)) return <div className="page"><div className="panel empty">Stranica ovog igrača nije dostupna.</div></div>;
  const key = personOf(p);
  const recs = db.players.filter((x) => personOf(x) === key);
  const ids = new Set(recs.map((x) => x.id));
  const rows = collect(db, ix, ids);
  // trenutni klub i broj: zapis iz zadnje odigrane utakmice, inače zadnji zapis igrača
  const lastRec = rows[0] ? ix.player[rows[0].pid] : p;
  const club = ix.club[rows[0] ? rows[0].m[rows[0].side] : lastRec.club];
  const num = rows[0]?.num ?? lastRec.num;
  const gk = recs.some((x) => x.gk) || rows.some((r) => r.gk);
  const prevClubs = [...new Set(rows.map((r) => r.m[r.side]))].filter((c) => c !== club?.id);
  const T = sum(rows);
  const byComp = [...new Set(rows.map((r) => r.m.comp))].map((c) => ({ c, s: sum(rows.filter((r) => r.m.comp === c)) }));
  const hasA = T.a > 0;

  return (
    <div className="page two">
      <main className="col">
        <section className="panel">
          <div className="chead phead">
            <Jersey kit={club?.kit} size={64} num={num} />
            <div>
              <h1>{playerName(lastRec)}</h1>
              <div className="muted">
                {club && <a href={href("klub", club.id)} className="plink">{club.name}</a>}
                {gk ? " · golman" : ""}
                {prevClubs.length > 0 && <> · prije: {prevClubs.map((c, i) => <span key={c}>{i ? ", " : ""}<a href={href("klub", c)} className="plink">{ix.club[c]?.name}</a></span>)}</>}
              </div>
            </div>
          </div>
          <div className="ptiles">
            {[["Nastupi", T.n], ["U petorci", T.start], ["Golovi", T.g], ...(hasA ? [["Asistencije", T.a]] : []), ["Žuti", T.y], ["Crveni", T.r]].map(([k, v]) => (
              <div key={k}><b>{v}</b><span>{k}</span></div>))}
          </div>
          {byComp.length > 1 && (
            <table className="squad pcomp">
              <thead><tr><th>Natjecanje</th><th className="c" title="Nastupi">N</th><th className="c" title="Golovi">G</th>{hasA && <th className="c" title="Asistencije">A</th>}<th className="c" title="Žuti kartoni">Ž</th><th className="c" title="Crveni kartoni">C</th></tr></thead>
              <tbody>{byComp.map(({ c, s }) => (
                <tr key={c}><td><a className="plink" href={href("liga", ix.comp[c].league, ix.comp[c].season, "strijelci")}>{ix.league[ix.comp[c].league].name} {ix.season[ix.comp[c].season]?.name || ""}</a></td>
                  <td className="c">{s.n}</td><td className="c"><b>{s.g}</b></td>{hasA && <td className="c">{s.a}</td>}<td className="c">{s.y}</td><td className="c">{s.r}</td></tr>))}</tbody>
            </table>)}
          {byComp.length > 1 && <div className="note pcomp-key">N – nastupi, G – golovi{hasA ? ", A – asistencije" : ""}, Ž – žuti kartoni, C – crveni kartoni</div>}
        </section>

        <section className="panel">
          <div className="ph"><h2>Utakmice</h2><span className="aside">{rows.length ? `${rows.length} u zapisniku` : ""}</span></div>
          {!rows.length ? <div className="empty">Igrač još nije bio u zapisniku nijedne odigrane utakmice.</div> :
            <div className="pm-list">{rows.map((r) => <PMRow key={r.m.id} r={r} ix={ix} />)}</div>}
        </section>
      </main>
      <aside className="col">
        {club && <section className="panel">
          <div className="ph"><h2>Klub</h2><a className="more" href={href("klub", club.id)}>Otvori</a></div>
          <a className="pclub" href={href("klub", club.id)}><Jersey kit={club.kit} size={36} /><span><b>{club.name}</b><small className="muted">{club.city}</small></span></a>
        </section>}
      </aside>
    </div>
  );
}

function PMRow({ r, ix }) {
  const { m, side } = r;
  const opp = ix.club[m[side === "home" ? "away" : "home"]];
  const L = ix.league[ix.comp[m.comp].league];
  const s = score(m), mine = s ? (side === "home" ? s : [s[1], s[0]]) : null;
  const w = m.status === "finished" ? winner(m) : null;
  const res = w == null ? null : w === 0 ? "N" : (w === 1) === (side === "home") ? "P" : "I";
  const ev = [
    ...r.goals.map((e) => ({ k: e.id, cls: "g", icon: Icon.ball(14), t: goalTime(e) + (e.pen ? " (p)" : "") })),
    ...r.own.map((e) => ({ k: e.id, cls: "og", icon: Icon.ball(14), t: `${goalTime(e)} autogol` })),
    ...r.assists.map((e) => ({ k: "a" + e.id, cls: "a", icon: <span className="pm-as">A</span>, t: goalTime(e) })),
    ...r.yellow.map((e) => ({ k: e.id, cls: "y", icon: <span className="card-y" />, t: goalTime(e) })),
    ...r.red.map((e) => ({ k: e.id, cls: "r", icon: <span className="card-r" />, t: goalTime(e) })),
    ...r.penMiss.map((e) => ({ k: e.id, cls: "pm", icon: <span className="so-miss">✕</span>, t: `${goalTime(e)} promašen penal` })),
  ];
  return (
    <a className="pm" href={href("utakmica", m.id)}>
      <span className="pm-when">{fmtDay(m.date)}<small>{isCup(L) ? `Kup${m.round ? `, ${roundName(L, m.round)}` : ""}` : m.round ? roundName(L, m.round) : L.name}</small></span>
      <span className="pm-opp"><Jersey kit={opp?.kit} size={22} /><span><b>{opp?.name}</b><small>{side === "home" ? "doma" : "gost"}{r.start ? " · petorka" : " · klupa"}{r.cap ? " · kapetan" : ""}</small></span></span>
      <span className="pm-ev">{ev.map((x) => <span key={x.k} className={"pm-e " + x.cls}>{x.icon}<small>{x.t}</small></span>)}</span>
      <span className={"pm-sc" + (res ? " r-" + res : "")}>{mine ? `${mine[0]}:${mine[1]}` : "–"}{res && <i>{res}</i>}</span>
    </a>
  );
}
