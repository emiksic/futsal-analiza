import { useState } from "react";
import { href } from "../lib/router.js";
import { currentRound, fmtDay } from "../lib/derive.js";
import { MatchRow } from "../components/MatchRow.jsx";
import { Rail } from "../components/Rail.jsx";
import { AnalysedCard, ScorersCard } from "../components/Side.jsx";
import { LeagueBadge } from "../components/ui.jsx";

export function Home({ db, ix }) {
  const [mode, setMode] = useState("rez");
  const cur = db.seasons[0].id;
  const comps = db.comps.filter((c) => c.season === cur);
  return (
    <div className="page three">
      <Rail db={db} />
      <main className="col">
        <section className="panel">
          <div className="tabs" role="tablist" aria-label="Utakmice">
            <button role="tab" aria-selected={mode === "rez"} onClick={() => setMode("rez")}>Zadnje kolo</button>
            <button role="tab" aria-selected={mode === "ras"} onClick={() => setMode("ras")}>Sljedeće kolo</button>
          </div>
          <div className="mlist">
            {comps.map((c) => {
              const L = ix.league[c.league];
              const last = currentRound(db, c.id);
              const round = mode === "rez" ? last : Math.min(c.rounds, last + 1);
              const ms = db.matches.filter((m) => m.comp === c.id && m.round === round).sort((a, b) => a.date.localeCompare(b.date));
              const days = [...new Set(ms.map((m) => fmtDay(m.date)))];
              return (
                <div key={c.id}>
                  <a className="mgroup" href={href("liga", c.league, c.season, "rezultati", round)}>
                    <LeagueBadge league={L} /><b>{L.name}</b><span className="muted">{round}. kolo</span>
                    <span className="r">{days.join(", ")}</span>
                  </a>
                  {ms.map((m) => <MatchRow key={m.id} m={m} ix={ix} />)}
                  {!ms.length && <div className="empty">Raspored za {round}. kolo još nije unesen.</div>}
                </div>
              );
            })}
          </div>
        </section>
      </main>
      <aside className="ctx col">
        <AnalysedCard db={db} ix={ix} />
        <ScorersCard db={db} ix={ix} comp={`1-hmnl-${cur}`} title="Strijelci 1. HMNL" limit={5} />
      </aside>
    </div>
  );
}
