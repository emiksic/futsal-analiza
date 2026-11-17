import { useState } from "react";
import { href } from "../lib/router.js";
import { currentRound, dayLabel, roundName, fmtDay } from "../lib/derive.js";
import { MatchRow } from "../components/MatchRow.jsx";
import { Rail } from "../components/Rail.jsx";
import { ScorersCard } from "../components/Side.jsx";
import { LeagueBadge, Icon } from "../components/ui.jsx";

// odabir (zadnje / sljedeće kolo) se pamti dok je kartica otvorena, pa ga povratak s utakmice ne poništi
const getMode = () => { try { return sessionStorage.getItem("home-mode") || "rez"; } catch { return "rez"; } };
// skupljena natjecanja se pamte u ovom pregledniku (zadano je sve prošireno)
const getClosed = () => { try { return new Set(JSON.parse(localStorage.getItem("home-closed") || "[]")); } catch { return new Set(); } };
// "Danas": utakmice današnjeg dana (po zagrebačkom vremenu) iz svih natjecanja + sve koje su upravo uživo.
// Utakmice bez termina ulaze samo ako im je poznat točan dan (kup usred tjedna), ne cijeli vikend.
const zDay = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: "Europe/Zagreb" });
const zDow = (d) => new Date(new Date(d).toLocaleString("en-US", { timeZone: "Europe/Zagreb" })).getDay();
function Today({ db, ix, comps }) {
  const today = zDay(Date.now()), ids = new Set(comps.map((c) => c.id));
  const exactDay = (m) => !m.timeTbd || (!m.dateTo && ![5, 6, 0].includes(zDow(m.date)));
  const ms = db.matches.filter((m) => ids.has(m.comp) && !m.draft && (m.status === "live" || (zDay(m.date) === today && exactDay(m))))
    .sort((a, b) => (b.status === "live") - (a.status === "live") || a.date.localeCompare(b.date));
  const live = ms.filter((m) => m.status === "live").length;
  if (!ms.length) {
    const next = db.matches.filter((m) => ids.has(m.comp) && !m.draft && m.status === "scheduled" && new Date(m.date) > new Date())
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!next) return null;
    const nl = ix.league[ix.comp[next.comp].league];
    return (
      <section className="panel today-none">
        <span><b>Danas</b> nema utakmica.</span>
        <a href={href("utakmica", next.id)}>Sljedeća: {dayLabel(next)}, {nl.name} · {ix.club[next.home].name} – {ix.club[next.away].name}</a>
      </section>);
  }
  return (
    <section className="panel today">
      <div className="ph"><h2>Danas{live ? <span className="livetag">{live} uživo</span> : null}</h2><span className="aside">{fmtDay(new Date().toISOString())}</span></div>
      <div className="mlist">
        {comps.map((c) => {
          const cm = ms.filter((m) => m.comp === c.id); if (!cm.length) return null;
          const L = ix.league[c.league];
          return (
            <div key={c.id}>
              <div className="mgroup mgroup-t"><a href={href("liga", c.league, c.season, "rezultati", cm[0].round)}><LeagueBadge league={L} /><b>{L.name}</b><span className="muted">{roundName(L, cm[0].round)}</span></a></div>
              {cm.map((m) => <MatchRow key={m.id} m={m} ix={ix} />)}
            </div>);
        })}
      </div>
    </section>);
}

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
        <Today db={db} ix={ix} comps={comps} />
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
        <ScorersCard db={db} ix={ix} comp={`1-hmnl-${cur}`} title={`Strijelci ${ix.league["1-hmnl"]?.name || "SS HMNL"}`} limit={5} />
      </aside>
    </div>
  );
}
