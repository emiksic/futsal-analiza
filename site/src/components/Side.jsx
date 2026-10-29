// Kartice za desni stupac: video analize, strijelci, mini tablica.
import { href } from "../lib/router.js";
import { score, scorers, standings, playerName, fmtDay } from "../lib/derive.js";
import { Jersey, CourtLines } from "./ui.jsx";

export function AnalysedCard({ db, ix, comp, limit = 3 }) {
  const ms = db.matches.filter((m) => m.analysis?.status === "done" && (!comp || m.comp === comp))
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
  return (
    <section className="panel">
      <div className="ph"><h2>Video analize</h2><span className="aside">{ms.length ? "igrači, lopta, posjed" : ""}</span></div>
      {!ms.length ? <div className="empty">Još nema analiziranih utakmica u ovoj ligi.</div> :
        <div className="feat">
          {ms.map((m) => {
            const H = ix.club[m.home], A = ix.club[m.away], s = score(m);
            return (
              <a key={m.id} className="feat-card" href={href("utakmica", m.id, "analiza")}>
                <div className="feat-court">
                  <svg viewBox="-21 -11 42 22" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                    <CourtLines sw={0.18} />
                    {[[-12, -4], [-6, 5], [-3, -2], [-15, 3]].map(([x, y], i) => <circle key={"h" + i} cx={x} cy={y} r="0.9" fill={H.kit.shirt} stroke="rgba(0,0,0,.4)" strokeWidth=".15" />)}
                    {[[-9, -1], [-1, 6], [4, -5], [-17, -6]].map(([x, y], i) => <circle key={"a" + i} cx={x} cy={y} r="0.9" fill={A.kit.shirt} stroke="rgba(0,0,0,.4)" strokeWidth=".15" />)}
                    <circle cx="-5" cy="0.5" r="0.5" fill="var(--signal)" />
                  </svg>
                </div>
                <div className="feat-teams"><Jersey kit={H.kit} size={18} />{H.short}<span className="muted">–</span><Jersey kit={A.kit} size={18} />{A.short}
                  <span className="sc">{s ? `${s[0]}:${s[1]}` : ""}</span></div>
                <div className="small muted">{ix.league[ix.comp[m.comp].league].name}, {m.round ? `${m.round}. kolo, ${fmtDay(m.date)}` : "isječak"}</div>
              </a>
            );
          })}
        </div>}
    </section>
  );
}

export function ScorersCard({ db, ix, comp, limit = 6, title = "Strijelci" }) {
  const list = scorers(db, comp).slice(0, limit);
  return (
    <section className="panel">
      <div className="ph"><h2>{title}</h2><a className="more" href={href("liga", ix.comp[comp].league, ix.comp[comp].season, "strijelci")}>Svi</a></div>
      {!list.length ? <div className="empty">Nema golova u ovoj sezoni.</div> :
        <ol className="scorers">
          {list.map((r, i) => {
            const p = ix.player[r.player], c = ix.club[r.club];
            return (
              <li key={r.player}><a href={href("klub", c.id)}>
                <span className="rk">{i + 1}</span><Jersey kit={c.kit} size={24} num={p?.num} />
                <span className="nm">{playerName(p)}<small>{c.name}{r.assists ? `, ${r.assists} asist.` : ""}</small></span>
                <span className="g">{r.goals}</span>
              </a></li>
            );
          })}
        </ol>}
    </section>
  );
}

export function MiniTable({ db, ix, comp, mark = [] }) {
  const rows = standings(db, comp), C = ix.comp[comp];
  return (
    <section className="panel">
      <div className="ph"><h2>Tablica</h2><a className="more" href={href("liga", C.league, C.season, "tablica")}>Cijela</a></div>
      <table className="st">
        <thead><tr><th>#</th><th className="l">Klub</th><th>U</th><th>GR</th><th>B</th></tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={r.club} className={mark.includes(r.club) ? "hl" : ""}>
            <td className="pos">{i + 1}</td>
            <td className="l"><a className="club" href={href("klub", r.club)}><Jersey kit={ix.club[r.club].kit} size={18} />{ix.club[r.club].short}</a></td>
            <td>{r.p}</td><td>{r.gd > 0 ? "+" + r.gd : r.gd}</td><td className="pts">{r.pts}</td>
          </tr>))}</tbody>
      </table>
    </section>
  );
}
