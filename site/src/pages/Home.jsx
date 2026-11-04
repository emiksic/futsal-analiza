import { useState } from "react";
import { href } from "../lib/router.js";
import { currentRound, dayLabel, roundName } from "../lib/derive.js";
import { MatchRow } from "../components/MatchRow.jsx";
import { Rail } from "../components/Rail.jsx";
import { AnalysedCard, ScorersCard } from "../components/Side.jsx";
import { LeagueBadge, Icon } from "../components/ui.jsx";

// odabir (zadnje / sljedeće kolo) se pamti dok je kartica otvorena, pa ga povratak s utakmice ne poništi
const getMode = () => { try { return sessionStorage.getItem("home-mode") || "rez"; } catch { return "rez"; } };
// skupljena natjecanja se pamte u ovom pregledniku (zadano je sve prošireno)
const getClosed = () => { try { return new Set(JSON.parse(localStorage.getItem("home-closed") || "[]")); } catch { return new Set(); } };
export function Home({ db, ix }) {
  const [mode, setMode0] = useState(getMode);
  const setMode = (v) => { setMode0(v); try { sessionStorage.setItem("home-mode", v); } catch { /* */ } };
  const [closed, setClosed0] = useState(getClosed);
  const setClosed = (s) => { setClosed0(s); try { localStorage.setItem("home-closed", JSON.stringify([...s])); } catch { /* */ } };
  const toggle = (id) => { const s = new Set(closed); s.has(id) ? s.delete(id) : s.add(id); setClosed(s); };
  const cur = db.seasons[0].id;
  const comps = db.comps.filter((c) => c.season === cur);
  const allClosed = comps.every((c) => closed.has(c.id));
  return (
    <div className="page three">
      <Rail db={db} />
      <main className="col">
        <section className="panel">
          <div className="tabs" role="tablist" aria-label="Utakmice">
            <button role="tab" aria-selected={mode === "rez"} onClick={() => setMode("rez")}>Zadnje kolo</button>
            <button role="tab" aria-selected={mode === "ras"} onClick={() => setMode("ras")}>Sljedeće kolo</button>
            <button type="button" className="tabs-r" onClick={() => setClosed(allClosed ? new Set() : new Set(comps.map((c) => c.id)))}>{allClosed ? "Proširi sve" : "Skupi sve"}</button>
          </div>
          <div className="mlist">
            {comps.map((c) => {
              const L = ix.league[c.league];
              const last = currentRound(db, c.id);
              const round = mode === "rez" ? last : Math.min(c.rounds, last + 1);
              const ms = db.matches.filter((m) => m.comp === c.id && m.round === round).sort((a, b) => a.date.localeCompare(b.date));
              const days = [...new Set(ms.map(dayLabel))];
              const open = !closed.has(c.id);
              return (
                <div key={c.id}>
                  <div className="mgroup mgroup-t">
                    <a href={href("liga", c.league, c.season, "rezultati", round)}>
                      <LeagueBadge league={L} /><b>{L.name}</b><span className="muted">{roundName(L, round)}</span>
                    </a>
                    <span className="r">{open ? days.join(", ") : `${ms.length} ${ms.length === 1 ? "utakmica" : ms.length < 5 && ms.length > 1 ? "utakmice" : "utakmica"}`}</span>
                    <button type="button" className="mg-tog" aria-expanded={open} aria-label={open ? `Skupi ${L.name}` : `Proširi ${L.name}`} onClick={() => toggle(c.id)}>{Icon.chevR(16)}</button>
                  </div>
                  {open && ms.map((m) => <MatchRow key={m.id} m={m} ix={ix} showDay={m.status !== "finished"} />)}
                  {open && !ms.length && <div className="empty">Raspored za {roundName(L, round)} još nije unesen.</div>}
                </div>
              );
            })}
          </div>
        </section>
      </main>
      <aside className="ctx col">
        <AnalysedCard db={db} ix={ix} />
        <ScorersCard db={db} ix={ix} comp={`1-hmnl-${cur}`} title={`Strijelci ${ix.league["1-hmnl"]?.name || "SuperSport HMNL"}`} limit={5} />
      </aside>
    </div>
  );
}
