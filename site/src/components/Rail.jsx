import { href } from "../lib/router.js";
import { LeagueBadge } from "./ui.jsx";

export function Rail({ db, active }) {
  const cur = db.seasons[0].id;
  return (
    <aside className="rail col" aria-label="Lige">
      <nav className="panel">
        <div className="group">Lige, sezona {db.seasons[0].name}</div>
        {db.leagues.map((l) => {
          const comp = db.comps.find((c) => c.league === l.id && c.season === cur);
          if (!comp) return null;
          return (
            <a key={l.id} className="lg" href={href("liga", l.id, cur)} aria-current={active === comp.id ? "page" : undefined}>
              <LeagueBadge league={l} />
              <div><b>{l.name}</b><span>{l.category}, {comp.teams.length} klubova</span></div>
            </a>
          );
        })}
        {db.comps.some((c) => c.season !== cur) && <div className="group">Arhiva</div>}
        {db.comps.filter((c) => c.season !== cur).map((c) => {
          const l = db.leagues.find((x) => x.id === c.league), s = db.seasons.find((x) => x.id === c.season);
          return (
            <a key={c.id} className="lg" href={href("liga", c.league, c.season)} aria-current={active === c.id ? "page" : undefined}>
              <LeagueBadge league={l} />
              <div><b>{l.name}</b><span>{s.name}</span></div>
            </a>
          );
        })}
      </nav>
    </aside>
  );
}
