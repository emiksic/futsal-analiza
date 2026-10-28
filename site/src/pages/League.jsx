import { href, go } from "../lib/router.js";
import { standings, scorers, currentRound, fmtDay, playerName } from "../lib/derive.js";
import { MatchRow } from "../components/MatchRow.jsx";
import { Rail } from "../components/Rail.jsx";
import { AnalysedCard, ScorersCard, MiniTable } from "../components/Side.jsx";
import { Jersey, LeagueBadge, Form, Icon } from "../components/ui.jsx";

const TABS = [["tablica", "Tablica"], ["rezultati", "Utakmice"], ["strijelci", "Strijelci"], ["analize", "Video analize"]];

export function League({ db, ix, leagueId, seasonId, tab = "tablica", roundArg }) {
  const L = ix.league[leagueId];
  const comp = db.comps.find((c) => c.league === leagueId && c.season === seasonId) || db.comps.find((c) => c.league === leagueId);
  if (!L || !comp) return <div className="page"><div className="panel empty">Liga ne postoji.</div></div>;
  const seasonsOf = db.comps.filter((c) => c.league === leagueId).map((c) => ix.season[c.season]);
  const analysed = db.matches.filter((m) => m.comp === comp.id && m.analysis?.status === "done").length;
  return (
    <div className="page three">
      <Rail db={db} active={comp.id} />
      <main className="col">
        <section className="panel">
          <div className="lhead">
            <LeagueBadge league={L} big />
            <div>
              <h1>{L.name}</h1>
              <div className="meta">{L.category}, {comp.teams.length} klubova, {comp.rounds} kola</div>
            </div>
            <div className="sel">
              <label className="small muted" htmlFor="season-sel" style={{ marginRight: 8 }}>Sezona</label>
              <select id="season-sel" className="select" value={comp.season} onChange={(e) => go("liga", leagueId, e.target.value, tab)}>
                {seasonsOf.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <nav className="tabs" aria-label="Liga">
            {TABS.map(([k, t]) => <a key={k} href={href("liga", leagueId, comp.season, k)} aria-current={tab === k ? "page" : undefined}>
              {t}{k === "analize" && analysed ? ` (${analysed})` : ""}</a>)}
          </nav>
          {tab === "tablica" && <Standings db={db} ix={ix} comp={comp} league={L} />}
          {tab === "rezultati" && <Rounds db={db} ix={ix} comp={comp} round={roundArg ? +roundArg : null} />}
          {tab === "strijelci" && <Scorers db={db} ix={ix} comp={comp} />}
          {tab === "analize" && <Analysed db={db} ix={ix} comp={comp} />}
        </section>
      </main>
      <aside className="ctx col">
        {tab === "tablica" ? <RoundCard db={db} ix={ix} comp={comp} /> : <MiniTable db={db} ix={ix} comp={comp.id} />}
        {tab !== "strijelci" && <ScorersCard db={db} ix={ix} comp={comp.id} limit={5} />}
        {tab !== "analize" && <AnalysedCard db={db} ix={ix} comp={comp.id} limit={2} />}
      </aside>
    </div>
  );
}

function Standings({ db, ix, comp, league }) {
  const rows = standings(db, comp.id), z = league.zones || {};
  return (
    <>
      <div className="tbl-wrap">
        <table className="st">
          <thead><tr>
            <th>#</th><th className="l">Klub</th><th title="Utakmice">U</th><th title="Pobjede">P</th><th title="Neriješeno">N</th><th title="Porazi">I</th>
            <th className="hide-s" title="Golovi">Gol.</th><th title="Gol-razlika">GR</th><th title="Bodovi">B</th><th className="hide-s l">Forma</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const zone = i < (z.playoff || 0) ? "z-a" : i >= rows.length - (z.relegation || 0) ? "z-b" : "";
              const c = ix.club[r.club];
              return (
                <tr key={r.club} className={zone}>
                  <td className="pos"><span>{i + 1}</span></td>
                  <td className="l"><a className="club" href={href("klub", c.id)}><Jersey kit={c.kit} size={22} />{c.name}</a></td>
                  <td>{r.p}</td><td>{r.w}</td><td>{r.d}</td><td>{r.l}</td>
                  <td className="hide-s">{r.gf}:{r.ga}</td><td>{r.gd > 0 ? "+" + r.gd : r.gd}</td><td className="pts">{r.pts}</td>
                  <td className="hide-s l"><Form items={r.form} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="zones">
        {z.playoff ? <span><i style={{ background: "var(--zone-a)" }} />Doigravanje (1.–{z.playoff}.)</span> : null}
        {z.relegation ? <span><i style={{ background: "var(--zone-b)" }} />Ispadanje</span> : null}
        <span>Pobjeda 3 boda, neriješeno 1. Kod istog broja bodova odlučuje gol-razlika.</span>
      </div>
    </>
  );
}

function Rounds({ db, ix, comp, round }) {
  const r = round || currentRound(db, comp.id);
  const ms = db.matches.filter((m) => m.comp === comp.id && m.round === r).sort((a, b) => a.date.localeCompare(b.date));
  const days = [...new Set(ms.map((m) => fmtDay(m.date)))];
  const nav = (k) => go("liga", comp.league, comp.season, "rezultati", k);
  return (
    <>
      <div className="toolbar" style={{ paddingTop: 12 }}>
        <div className="stepper">
          <button onClick={() => nav(r - 1)} disabled={r <= 1} aria-label="Prethodno kolo">{Icon.chevL()}</button>
          <b>{r}. kolo</b>
          <button onClick={() => nav(r + 1)} disabled={r >= comp.rounds} aria-label="Sljedeće kolo">{Icon.chevR()}</button>
        </div>
        <span className="grow" />
        <select className="select" aria-label="Odaberi kolo" value={r} onChange={(e) => nav(e.target.value)}>
          {Array.from({ length: comp.rounds }, (_, i) => <option key={i} value={i + 1}>{i + 1}. kolo</option>)}
        </select>
      </div>
      <div className="mlist">
        {days.map((d) => (
          <div key={d}>
            <div className="mgroup"><b>{d}</b></div>
            {ms.filter((m) => fmtDay(m.date) === d).map((m) => <MatchRow key={m.id} m={m} ix={ix} />)}
          </div>
        ))}
      </div>
    </>
  );
}

function Scorers({ db, ix, comp }) {
  const list = scorers(db, comp.id);
  if (!list.length) return <div className="empty">Nema golova u ovoj sezoni.</div>;
  return (
    <div className="tbl-wrap">
      <table className="st">
        <thead><tr><th>#</th><th className="l">Igrač</th><th className="l hide-s">Klub</th><th title="Golovi">G</th><th title="Asistencije">A</th><th title="Nastupi">Nast.</th></tr></thead>
        <tbody>{list.slice(0, 40).map((r, i) => {
          const p = ix.player[r.player], c = ix.club[r.club];
          return (
            <tr key={r.player}>
              <td className="pos">{i + 1}</td>
              <td className="l"><a className="club" href={href("klub", c.id)}><Jersey kit={c.kit} size={24} num={p?.num} />{playerName(p)}</a></td>
              <td className="l hide-s muted">{c.name}</td>
              <td className="pts">{r.goals}</td><td>{r.assists}</td><td>{r.apps}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

function Analysed({ db, ix, comp }) {
  const ms = db.matches.filter((m) => m.comp === comp.id && m.analysis && m.analysis.status !== "none").sort((a, b) => b.date.localeCompare(a.date));
  if (!ms.length) return <div className="empty">Još nema video analiza u ovoj sezoni. Utakmice za analizu dodaju se u adminu.</div>;
  return <div className="mlist">{ms.map((m) => <MatchRow key={m.id} m={m} ix={ix} showDay />)}</div>;
}

function RoundCard({ db, ix, comp }) {
  const r = currentRound(db, comp.id), next = Math.min(comp.rounds, r + 1);
  const ms = db.matches.filter((m) => m.comp === comp.id && m.round === next).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <section className="panel">
      <div className="ph"><h2>{next}. kolo</h2><a className="more" href={href("liga", comp.league, comp.season, "rezultati", next)}>Sva kola</a></div>
      <div className="mlist">{ms.map((m) => <MatchRow key={m.id} m={m} ix={ix} showDay />)}</div>
    </section>
  );
}
