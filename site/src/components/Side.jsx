// Kartice za desni stupac: strijelci, mini tablica.
import { href } from "../lib/router.js";
import { scorers, standings, playerName, isCup } from "../lib/derive.js";
import { Jersey } from "./ui.jsx";
import { usePlayerHref } from "./PLink.jsx";

export function ScorersCard({ db, ix, comp, limit = 6, title = "Strijelci" }) {
  const list = scorers(db, comp).slice(0, limit);
  const ph = usePlayerHref();
  return (
    <section className="panel">
      <div className="ph"><h2>{title}</h2><a className="more" href={href("liga", ix.comp[comp].league, ix.comp[comp].season, "strijelci")}>Svi</a></div>
      {!list.length ? <div className="empty">Nema golova u ovoj sezoni.</div> :
        <ol className="scorers">
          {list.map((r) => {
            const p = ix.player[r.player], c = ix.club[r.club];
            return (
              <li key={r.player}><a href={ph(p) || href("klub", c.id)}>
                <span className="rk">{r.rank}</span><Jersey kit={c.kit} size={24} num={p?.num} />
                <span className="nm">{playerName(p)}<small>{c.name}{r.prev.length ? ` (prije ${r.prev.map((x) => ix.club[x]?.name).join(", ")})` : ""}{r.assists ? `, ${r.assists} asist.` : ""}</small></span>
                <span className="g">{r.goals}</span>
              </a></li>
            );
          })}
        </ol>}
    </section>
  );
}

export function MiniTable({ db, ix, comp, mark = [] }) {
  const C = ix.comp[comp];
  if (!C || isCup(ix.league[C.league])) return null;   // kup nema tablicu
  const rows = standings(db, comp);
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
