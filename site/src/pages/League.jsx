import { useState } from "react";
import { href, go, replaceClick, replaceGo } from "../lib/router.js";
import { standings, scorers, currentRound, fmtDay, dayLabel, playerName, zoneOf, formStats, comebacks, fmtDate, sideScore, isCup, roundName, standingsView, cardsTable, YELLOW_BAN, suspendedNext, goalBins, BINS, htft, leadTable, mins, combinedZones, combinedTable } from "../lib/derive.js";
import { RULES } from "../lib/rules.js";
import { MatchRow } from "../components/MatchRow.jsx";
import { Rail } from "../components/Rail.jsx";
import { AnalysedCard, ScorersCard, MiniTable } from "../components/Side.jsx";
import { Jersey, LeagueBadge, Form, Icon } from "../components/ui.jsx";

const TABS = [["tablica", "Tablica"], ["rezultati", "Utakmice"], ["strijelci", "Strijelci"], ["preokreti", "Preokreti"], ["vodstvo", "Vodstvo"], ["minute", "Po minutama"], ["kartoni", "Kartoni"], ["analize", "Video analize"], ["pravila", "Pravila"]];

export function League({ db, ix, leagueId, seasonId, tab: tab0 = "tablica", roundArg }) {
  const L = ix.league[leagueId], cup = isCup(L);
  const tab = cup && tab0 === "tablica" ? "rezultati" : tab0;   // kup nema tablicu
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
              <div className="meta">{cup ? `${L.category}, kup, ${comp.teams.length} klubova` : `${L.category}, ${comp.teams.length} klubova, ${comp.rounds} kola`}</div>
            </div>
            <div className="sel">
              <label className="small muted" htmlFor="season-sel" style={{ marginRight: 8 }}>Sezona</label>
              <select id="season-sel" className="select" value={comp.season} onChange={(e) => replaceGo("liga", leagueId, e.target.value, tab)}>
                {seasonsOf.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <nav className="tabs" aria-label="Liga">
            {TABS.filter(([k]) => !(cup && k === "tablica")).map(([k, t]) => <a key={k} href={href("liga", leagueId, comp.season, k)} onClick={replaceClick} aria-current={tab === k ? "page" : undefined}>
              {t}{k === "analize" && analysed ? ` (${analysed})` : ""}</a>)}
          </nav>
          {tab === "tablica" && <Standings db={db} ix={ix} comp={comp} league={L} />}
          {tab === "rezultati" && <Rounds db={db} ix={ix} comp={comp} league={L} round={roundArg ? +roundArg : null} />}
          {tab === "strijelci" && <Scorers db={db} ix={ix} comp={comp} />}
          {tab === "preokreti" && <Comebacks db={db} ix={ix} comp={comp} />}
          {tab === "vodstvo" && <LeadTime db={db} ix={ix} comp={comp} />}
          {tab === "minute" && <Minutes db={db} ix={ix} comp={comp} />}
          {tab === "kartoni" && <Cards db={db} ix={ix} comp={comp} league={L} />}
          {tab === "analize" && <Analysed db={db} ix={ix} comp={comp} />}
          {tab === "pravila" && <Rules league={L} season={comp.season} />}
        </section>
      </main>
      <aside className="ctx col">
        {tab === "tablica" ? <RoundCard db={db} ix={ix} comp={comp} league={L} /> : <MiniTable db={db} ix={ix} comp={comp.id} />}
        {tab !== "strijelci" && <ScorersCard db={db} ix={ix} comp={comp.id} limit={5} />}
        {tab !== "analize" && <AnalysedCard db={db} ix={ix} comp={comp.id} limit={2} />}
      </aside>
    </div>
  );
}

const VIEWS = [["all", "Ukupno"], ["home", "Doma"], ["away", "U gostima", "Gosti"], ["h1", "1. poluvrijeme", "1. pol."], ["h2", "2. poluvrijeme", "2. pol."]];
function Standings({ db: db0, ix, comp, league }) {
  // tablica nakon odabranog kola (zadano: trenutna) i pomak u odnosu na kolo prije
  const played = [...new Set(db0.matches.filter((m) => m.comp === comp.id && m.status === "finished").map((m) => m.round))].sort((a, b) => a - b);
  const last = played[played.length - 1] || 0;
  const [upto0, setUpto] = useState(null);
  const upto = upto0 && upto0 <= last ? upto0 : last;
  const cut = (n) => ({ ...db0, matches: db0.matches.filter((m) => m.comp !== comp.id || m.round <= n) });
  const db = upto < last ? cut(upto) : db0;
  const prevRows = upto > 1 ? standings(cut(upto - 1), comp.id) : [];
  const prevPos = prevRows.some((r) => r.p) ? Object.fromEntries(prevRows.map((r, i) => [r.club, i])) : null;
  const [view, setView0] = useState(() => { try { return sessionStorage.getItem("tbl-view") || "all"; } catch { return "all"; } });
  const setView = (v) => { setView0(v); try { sessionStorage.setItem("tbl-view", v); } catch { /* */ } };
  const all = view === "all";
  const V = all ? { rows: standings(db, comp.id), skipped: 0 } : standingsView(db, comp.id, view);
  const rows = V.rows, z = all ? league.zones || {} : {};
  // juniori/kadeti: ispadanje po zbirnoj tablici, oznaka na klubu bez obzira na mjesto u ovoj tablici
  const R = all ? combinedZones(db, comp.id) : {}, youth = Object.keys(R).length > 0;
  const CT = youth ? combinedTable(db, comp.id) : [];
  const ctPos = (club) => CT.findIndex((r) => r.club === club) + 1;
  if (!standings(db0, comp.id).some((r) => r.p)) return <div className="empty">Rezultati za ovu ligu još nisu uneseni.</div>;
  return (
    <>
      {played.length > 1 && (
        <div className="tbl-round">
          <label className="small muted" htmlFor="tbl-upto">Tablica nakon</label>
          <button type="button" className="btn sm ghost" disabled={upto <= played[0]} onClick={() => setUpto(played[played.indexOf(upto) - 1])} aria-label="Kolo prije">‹</button>
          <select id="tbl-upto" className="select sm" value={upto} onChange={(e) => setUpto(+e.target.value)}>
            {played.map((r) => <option key={r} value={r}>{roundName(league, r)}{r === last ? " (trenutno)" : ""}</option>)}
          </select>
          <button type="button" className="btn sm ghost" disabled={upto >= last} onClick={() => setUpto(played[played.indexOf(upto) + 1])} aria-label="Sljedeće kolo">›</button>
        </div>)}
      <div className="seg tbl-views" role="tablist" aria-label="Vrsta tablice">
        {VIEWS.map(([k, n, sh]) => <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} aria-label={n}>
          {sh ? <><span className="lg-only">{n}</span><span className="sm-only">{sh}</span></> : n}</button>)}
      </div>
      <div className="tbl-wrap">
        <table className="st">
          <thead><tr>
            <th>#</th><th className="l">Klub</th><th title="Utakmice">U</th><th title="Pobjede">P</th><th title="Neriješeno">N</th><th title="Porazi">I</th>
            <th className="hide-s" title="Golovi">Gol.</th><th title="Gol-razlika">GR</th><th title="Bodovi">B</th><th className="hide-s l">Forma</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const zone = R[r.club] || zoneOf(z, i, rows.length);
              const c = ix.club[r.club];
              const ct = R[r.club] ? CT.find((x) => x.club === r.club) : null;
              return (
                <tr key={r.club} className={zone} title={ct ? `Zbirna tablica: ${ctPos(r.club)}. mjesto, ${ct.pts} bod.` : undefined}>
                  <td className="pos"><span>{i + 1}</span>{all && prevPos && r.club in prevPos && prevPos[r.club] !== i &&
                    <small className={prevPos[r.club] > i ? "mv up" : "mv down"} title={`Prije ovog kola: ${prevPos[r.club] + 1}. mjesto`}>{prevPos[r.club] > i ? "▲" : "▼"}{Math.abs(prevPos[r.club] - i)}</small>}</td>
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
        {z.direct ? <span><i style={{ background: "var(--zone-a2)" }} />Izravno u polufinale (1.–{z.direct}.)</span> : null}
        {z.playoff ? <span><i style={{ background: "var(--zone-a)" }} />{z.direct ? `Četvrtfinale (${z.direct + 1}.–${z.playoff}.)` : `Doigravanje (1.–${z.playoff}.)`}</span> : null}
        {z.qual ? <span><i style={{ background: "var(--zone-q)" }} />Kvalifikacije</span> : null}
        {z.relegation ? <span><i style={{ background: "var(--zone-b)" }} />Ispadanje</span> : null}
        {youth ? <span><i style={{ background: "var(--zone-q)" }} />Kvalifikacije i <i style={{ background: "var(--zone-b)", marginLeft: 6 }} />ispadanje po zbirnoj tablici kadeta i juniora (zbroj bodova obje momčadi; kod istih bodova plasman kadeta, pa gol-razlika i golovi)</span>
          : z.note ? <span>{z.note}</span> : null}
        {!all && <span>{view === "home" ? "Samo utakmice kod kuće." : view === "away" ? "Samo utakmice u gostima." : `Bodovi kao da je utakmica trajala samo ${view === "h1" ? "prvo" : "drugo"} poluvrijeme.`}
          {V.skipped ? ` Nije uračunato ${V.skipped} utakmica bez minuta svih golova.` : ""} Poredak po bodovima, gol-razlici i golovima.</span>}
        {all && upto < last && <span>Prikazana je tablica nakon {roundName(league, upto).replace(/kolo$/, "kola")}. Strelice: pomak u odnosu na kolo prije.</span>}
        {all && <span>Pobjeda 3 boda, neriješeno 1. Kod istog broja bodova: {league.id === "juniori" ? "plasman kadetske momčadi, " : ""}gol-razlika, više golova, međusobne utakmice, fair-play.</span>}
      </div>
      {all && played.length > 1 && <Positions db={db0} ix={ix} comp={comp} league={league} played={played} upto={upto} pick={setUpto} />}
    </>
  );
}

// Mjesto svake ekipe nakon svakog kola (redovi: trenutni poredak). Klik na kolo prikazuje tablicu nakon tog kola.
function Positions({ db, ix, comp, league, played, upto, pick }) {
  const cut = (n) => ({ ...db, matches: db.matches.filter((m) => m.comp !== comp.id || m.round <= n) });
  const pos = played.map((r) => Object.fromEntries(standings(cut(r), comp.id).map((x, i) => [x.club, i + 1])));
  const order = standings(db, comp.id).map((x) => x.club), n = order.length, z = league.zones || {};
  return (
    <div className="posgrid">
      <h3>Mjesto po kolima</h3>
      <div className="tbl-wrap">
        <table className="st pos-t">
          <thead><tr><th className="l">Klub</th>{played.map((r) => (
            <th key={r}><button type="button" className={"rbtn" + (r === upto ? " on" : "")} onClick={() => pick(r)} title={`Tablica nakon ${roundName(league, r).replace(/kolo$/, "kola")}`}>{r}.</button></th>))}</tr></thead>
          <tbody>{order.map((club) => {
            const c = ix.club[club];
            return (
              <tr key={club}>
                <td className="l"><a className="club" href={href("klub", club)}><Jersey kit={c.kit} size={18} />{c.short || c.name}</a></td>
                {pos.map((P, k) => {
                  const p = P[club], prev = k ? pos[k - 1][club] : null;
                  return <td key={k} className={"pc " + (zoneOf(z, p - 1, n) || "") + (played[k] === upto ? " cur" : "")}
                    title={`${c.name}, ${roundName(league, played[k])}: ${p}. mjesto${prev && prev !== p ? ` (${prev > p ? "gore" : "dolje"} ${Math.abs(prev - p)})` : ""}`}>{p}</td>;
                })}
              </tr>);
          })}</tbody>
        </table>
      </div>
    </div>
  );
}

function Rounds({ db, ix, comp, league, round }) {
  const r = round || currentRound(db, comp.id);
  const ms = db.matches.filter((m) => m.comp === comp.id && m.round === r).sort((a, b) => a.date.localeCompare(b.date));
  const days = [...new Set(ms.map(dayLabel))];
  const nav = (k) => replaceGo("liga", comp.league, comp.season, "rezultati", k);
  return (
    <>
      <div className="toolbar" style={{ paddingTop: 12 }}>
        <div className="stepper">
          <button onClick={() => nav(r - 1)} disabled={r <= 1} aria-label="Prethodno kolo">{Icon.chevL()}</button>
          <select className="select round-pick" aria-label="Odaberi kolo" value={r} onChange={(e) => nav(e.target.value)}>
            {Array.from({ length: comp.rounds }, (_, i) => <option key={i} value={i + 1}>{roundName(league, i + 1)}</option>)}
          </select>
          <button onClick={() => nav(r + 1)} disabled={r >= comp.rounds} aria-label="Sljedeće kolo">{Icon.chevR()}</button>
        </div>
      </div>
      <div className="mlist">
        {!ms.length && <div className="empty">Raspored za {roundName(league, r)} još nije unesen.</div>}
        {days.map((d) => (
          <div key={d}>
            <div className="mgroup"><b>{d}</b></div>
            {ms.filter((m) => dayLabel(m) === d).map((m) => <MatchRow key={m.id} m={m} ix={ix} />)}
          </div>
        ))}
      </div>
    </>
  );
}

function Scorers({ db, ix, comp }) {
  const list = scorers(db, comp.id);
  if (!list.length) return <div className="empty">Nema golova u ovoj sezoni.</div>;
  const hasA = list.some((r) => r.assists);
  return (
    <div className="tbl-wrap">
      <table className="st">
        <thead><tr><th>#</th><th className="l">Igrač</th><th className="l hide-s">Klub</th><th title="Golovi">G</th>{hasA && <th title="Asistencije">A</th>}<th title="Utakmice u zapisniku">Nast.</th></tr></thead>
        <tbody>{list.slice(0, 40).map((r, i) => {
          const p = ix.player[r.player], c = ix.club[r.club];
          return (
            <tr key={r.player}>
              <td className="pos">{i + 1}</td>
              <td className="l"><a className="club" href={href("klub", c.id)}><Jersey kit={c.kit} size={24} num={p?.num} />{playerName(p)}</a></td>
              <td className="l hide-s muted">{c.name}{r.prev.length > 0 && <small className="prevc"> (prije {r.prev.map((x) => ix.club[x]?.name).join(", ")})</small>}</td>
              <td className="pts">{r.goals}</td>{hasA && <td>{r.assists}</td>}<td>{r.apps}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

function Cards({ db, ix, comp, league }) {
  const rows = cardsTable(db, comp.id), cup = isCup(league);
  if (!rows.length) return <div className="empty">Još nema unesenih kartona.</div>;
  const susp = cup ? [] : suspendedNext(db, comp.id), suspIds = new Set(susp.map((s) => s.player));
  const watch = cup ? [] : [...susp.map((s) => ({ ...(rows.find((r) => r.player === s.player) || { player: s.player, club: s.club, y: 0 }), susp: s.reason })),
    ...rows.filter((r) => r.toBan === 1 && !suspIds.has(r.player))];
  const team = {};
  for (const r of rows) { const t = (team[r.club] ||= { club: r.club, y: 0, r: 0 }); t.y += r.y; t.r += r.r; }
  const teams = Object.values(team).map((t) => ({ ...t, fp: t.y + 3 * t.r })).sort((a, b) => a.fp - b.fp);
  const P = (r) => { const p = ix.player[r.player], c = ix.club[r.club];
    return <a className="club" href={href("klub", c.id)}><Jersey kit={c.kit} size={22} num={p?.num} />{playerName(p)}</a>; };
  return (
    <>
      {!cup && (
        <>
          <div className="mgroup"><b>Kazne i pred kaznom</b><span className="muted">sljedeća utakmica kluba</span></div>
          {!watch.length ? <div className="empty">Nitko trenutno nije suspendiran ni pred kaznom.</div> : (
            <div className="tbl-wrap"><table className="st"><tbody>{watch.map((r) => (
              <tr key={r.player}>
                <td className="l">{P(r)}</td>
                <td className="l hide-s muted">{ix.club[r.club].name}</td>
                <td className="l">{r.susp ? <span className="pill failed">ne igra sljedeću utakmicu ({r.susp})</span> : <span className="pill warn">{r.y} žuta, sljedeći = kazna</span>}</td>
              </tr>))}</tbody></table></div>)}
        </>)}
      <div className="mgroup"><b>Igrači</b></div>
      <div className="tbl-wrap">
        <table className="st">
          <thead><tr><th>#</th><th className="l">Igrač</th><th className="l hide-s">Klub</th><th title="Žuti kartoni"><span className="card-y" /></th><th title="Crveni kartoni"><span className="card-r" /></th></tr></thead>
          <tbody>{rows.slice(0, 50).map((r, i) => (
            <tr key={r.player}>
              <td className="pos">{i + 1}</td><td className="l">{P(r)}</td><td className="l hide-s muted">{ix.club[r.club].name}</td>
              <td className="pts">{r.y || ""}</td><td className="pts">{r.r || ""}</td>
            </tr>))}</tbody>
        </table>
      </div>
      <div className="mgroup"><b>Fair-play</b><span className="muted">žuti 1, crveni 3 boda, manje je bolje</span></div>
      <div className="tbl-wrap">
        <table className="st">
          <thead><tr><th>#</th><th className="l">Klub</th><th><span className="card-y" /></th><th><span className="card-r" /></th><th>Bodovi</th></tr></thead>
          <tbody>{teams.map((t, i) => { const c = ix.club[t.club]; return (
            <tr key={t.club}><td className="pos">{i + 1}</td><td className="l"><a className="club" href={href("klub", c.id)}><Jersey kit={c.kit} size={22} />{c.name}</a></td>
              <td>{t.y}</td><td>{t.r}</td><td className="pts">{t.fp}</td></tr>); })}</tbody>
        </table>
      </div>
      <div className="zones">{cup ? <span>U kupu kazne za kartone određuje Disciplinski pravilnik HNS-a.</span>
        : <span>{YELLOW_BAN} žuta kartona donose zabranu igranja jedne utakmice (propozicije), nakon čega se brojanje nastavlja do sljedećih {YELLOW_BAN}. Drugi žuti na istoj utakmici računa se kao isključenje; trajanje kazne za crveni određuje disciplinski sudac, ovdje je prikazana samo prva sljedeća utakmica.</span>}</div>
    </>
  );
}

function Minutes({ db, ix, comp }) {
  const B = goalBins(db, comp.id), H = htft(db, comp.id);
  if (!B.n) return <div className="empty">Još nema utakmica s minutama golova.</div>;
  const order = Object.fromEntries(standings(db, comp.id).map((r, i) => [r.club, i]));
  const rows = B.rows.sort((a, b) => order[a.club] - order[b.club]);
  const hrows = H.sort((a, b) => order[a.club] - order[b.club]);
  const tot = B.rows.reduce((s, r) => s.map((v, i) => v + r.f[i]), Array(8).fill(0)), mx = Math.max(1, ...tot);
  const cell = (f, a, i) => { const d = f - a, k = Math.min(1, Math.abs(d) / 3);
    const bg = d > 0 ? `color-mix(in srgb, var(--win) ${Math.round(14 + 40 * k)}%, transparent)` : d < 0 ? `color-mix(in srgb, var(--loss) ${Math.round(14 + 40 * k)}%, transparent)` : "transparent";
    return <td key={i} className="bin" style={{ background: bg }}>{f || a ? <><b>{f}</b><span className="muted">:{a}</span></> : <span className="muted">–</span>}</td>; };
  const wdl = (x) => <span className="wdl"><b>{x[0]}</b>-{x[1]}-{x[2]}</span>;
  return (
    <>
      <div className="mgroup"><b>Kada se zabija</b><span className="muted">zabijeno : primljeno po 5 minuta</span></div>
      <div className="tbl-wrap">
        <table className="st bins">
          <thead><tr><th className="l">Klub</th>{BINS.map((b) => <th key={b}>{b}'</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => { const c = ix.club[r.club]; return (
              <tr key={r.club}><td className="l"><a className="club" href={href("klub", c.id)}><Jersey kit={c.kit} size={20} /><span className="hide-s">{c.name}</span><span className="show-s">{c.short || c.name}</span></a></td>
                {r.f.map((f, i) => cell(f, r.a[i], i))}</tr>); })}
            <tr className="bin-tot"><td className="l muted">Svi golovi</td>{tot.map((v, i) => <td key={i}><div className="bin-bar"><i style={{ height: `${Math.round(100 * v / mx)}%` }} /></div><small>{v}</small></td>)}</tr>
          </tbody>
        </table>
      </div>
      <div className="mgroup"><b>Poluvrijeme / kraj</b><span className="muted">pobjede-neriješeno-porazi prema stanju na poluvremenu</span></div>
      <div className="tbl-wrap">
        <table className="st">
          <thead><tr><th className="l">Klub</th><th title="Ishod kad je vodio na poluvremenu">Vodio</th><th title="Ishod kad je na poluvremenu bilo neriješeno">Neriješeno</th><th title="Ishod kad je gubio na poluvremenu">Gubio</th></tr></thead>
          <tbody>{hrows.map((r) => { const c = ix.club[r.club]; return (
            <tr key={r.club}><td className="l"><a className="club" href={href("klub", c.id)}><Jersey kit={c.kit} size={22} />{c.name}</a></td>
              <td>{wdl(r.lead)}</td><td>{wdl(r.level)}</td><td>{wdl(r.trail)}</td></tr>); })}</tbody>
        </table>
      </div>
      <div className="zones"><span>Zelena ćelija: u tom razdoblju klub je zabio više nego primio, crvena: obrnuto. Uračunato {B.n} utakmica s minutama svih golova.</span></div>
    </>
  );
}

function Comebacks({ db, ix, comp }) {
  const rows = formStats(db, comp.id).filter((r) => r.n), list = comebacks(db, comp.id);
  if (!rows.length) return <div className="empty">Još nema utakmica s unesenim golovima.</div>;
  const order = Object.fromEntries(standings(db, comp.id).map((r, i) => [r.club, i]));
  rows.sort((a, b) => order[a.club] - order[b.club]);
  const wdl = (x) => <span className="wdl"><b>{x[0]}</b>-{x[1]}-{x[2]}</span>;
  return (
    <>
      <div className="tbl-wrap">
        <table className="st">
          <thead><tr>
            <th className="l">Klub</th>
            <th title="Pobjede-neriješeno-porazi kad je klub zabio prvi gol">Zabili prvi</th>
            <th title="Pobjede-neriješeno-porazi kad je klub primio prvi gol">Primili prvi</th>
            <th title="Bodovi osvojeni u utakmicama u kojima je klub gubio">Iz zaostatka</th>
            <th title="Bodovi ispušteni u utakmicama u kojima je klub vodio">Ispušteno</th>
            <th title="Golovi zabijeni i primljeni od 36. minute">36.–40.</th>
          </tr></thead>
          <tbody>{rows.map((r) => {
            const c = ix.club[r.club];
            return (
              <tr key={r.club}>
                <td className="l"><a className="club" href={href("klub", c.id)}><Jersey kit={c.kit} size={22} />{c.name}</a></td>
                <td>{wdl(r.fs)}</td><td>{wdl(r.cf)}</td>
                <td className={r.ptsBehind ? "pts" : "muted"}>{r.ptsBehind}</td>
                <td className={r.ptsLost ? "pts" : "muted"}>{r.ptsLost}</td>
                <td>{r.lateFor}:{r.lateAg}</td>
              </tr>);
          })}</tbody>
        </table>
      </div>
      <div className="zones"><span>Zabili prvi / primili prvi: pobjede-neriješeno-porazi. Iz zaostatka: bodovi osvojeni u utakmicama u kojima je klub gubio. Ispušteno: bodovi izgubljeni u utakmicama u kojima je vodio. 36.–40.: golovi zabijeni i primljeni u zadnjih 5 minuta. Računaju se samo utakmice za koje su uneseni svi golovi.</span></div>
      <div className="mgroup"><b>Preokreti</b></div>
      {!list.length ? <div className="empty">Još nije bilo preokreta.</div> : (
        <div className="cb-list">{list.map(({ m, c }) => {
          const W = ix.club[m[c.side]], O = ix.club[m[c.side === "home" ? "away" : "home"]], f = (x) => sideScore(x, c.side);
          const end = { W: "pobjeda", D: "neriješeno", L: "ipak poraz" }[c.res];
          return (
            <a key={m.id} className="cb-row" href={href("utakmica", m.id, "detalji")}>
              <span className="cb-def">−{c.deficit}</span>
              <span className="cb-txt"><Jersey kit={W.kit} size={20} /><b>{W.name}</b>&nbsp;protiv {O.name}
                <span className="muted small">&nbsp;· s {f(c.from)} na {f(c.lead)}, kraj {f(c.final)} ({end})</span></span>
              <span className="muted small cb-when">{roundName(ix.league[comp.league], m.round)}, {fmtDate(m.date)}</span>
            </a>);
        })}</div>)}
    </>
  );
}

// Minute u vodstvu po klubu (kao "laps led" u F1)
function LeadTime({ db, ix, comp }) {
  const rows = leadTable(db, comp.id);
  if (!rows.length) return <div className="empty">Još nema utakmica s minutama svih golova.</div>;
  const pc = (x) => `${Math.round(100 * x)} %`;
  return (
    <>
      <div className="tbl-wrap">
        <table className="st lead-tbl">
          <thead><tr>
            <th className="l">Klub</th>
            <th title="Utakmice s minutama svih golova">Ut.</th>
            <th title="Minute u vodstvu">Vodio</th>
            <th title="Minute pri neriješenom rezultatu">Nerij.</th>
            <th title="Minute u zaostatku">Gubio</th>
            <th className="lead-col" title="Udio vremena u vodstvu / neriješeno / u zaostatku">Udio vremena</th>
            <th title="Najduže neprekinuto vodstvo u jednoj utakmici">Najduže</th>
            <th title="Utakmice u kojima klub nijednom nije gubio">Bez zaost.</th>
          </tr></thead>
          <tbody>{rows.map((r) => {
            const c = ix.club[r.club], tot = r.n * 2400;
            return (
              <tr key={r.club}>
                <td className="l"><a className="club" href={href("klub", c.id)}><Jersey kit={c.kit} size={22} />{c.name}</a></td>
                <td className="muted">{r.n}</td>
                <td className="pts">{mins(r.lead)}'</td>
                <td>{mins(r.level)}'</td>
                <td>{mins(r.trail)}'</td>
                <td className="lead-col"><div className="lead-cell"><div className="lead-bar" aria-label={`u vodstvu ${pc(r.lead / tot)}`}>
                  <i className="w" style={{ width: `${100 * r.lead / tot}%` }} /><i className="d" style={{ width: `${100 * r.level / tot}%` }} /><i className="l" style={{ width: `${100 * r.trail / tot}%` }} />
                </div><span className="lead-pct">{pc(r.pct)}</span></div></td>
                <td>{r.longestM ? <a href={href("utakmica", r.longestM, "detalji")}>{mins(r.longest)}'</a> : <span className="muted">–</span>}</td>
                <td className={r.neverBehind ? "" : "muted"}>{r.neverBehind}</td>
              </tr>);
          })}</tbody>
        </table>
      </div>
      <div className="zones"><span>Koliko je od 40 minuta svake utakmice klub vodio, bilo je neriješeno ili je gubio (poredano po udjelu vremena u vodstvu). Najduže: najduže neprekinuto vodstvo u jednoj utakmici (klik vodi na utakmicu). Kad je poznata samo minuta gola, gol se računa u sredini te minute. Računaju se samo utakmice za koje su uneseni svi golovi.</span></div>
    </>
  );
}

function Analysed({ db, ix, comp }) {
  const ms = db.matches.filter((m) => m.comp === comp.id && m.analysis && m.analysis.status !== "none").sort((a, b) => b.date.localeCompare(a.date));
  if (!ms.length) return <div className="empty">Još nema video analiza u ovoj sezoni. Utakmice za analizu dodaju se u adminu.</div>;
  return <div className="mlist">{ms.map((m) => <MatchRow key={m.id} m={m} ix={ix} showDay />)}</div>;
}

function RoundCard({ db, ix, comp, league }) {
  const r = currentRound(db, comp.id), next = Math.min(comp.rounds, r + 1);
  const ms = db.matches.filter((m) => m.comp === comp.id && m.round === next).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <section className="panel">
      <div className="ph"><h2>{roundName(league, next)}</h2><a className="more" href={href("liga", comp.league, comp.season, "rezultati", next)}>Sva kola</a></div>
      <div className="mlist">{ms.map((m) => <MatchRow key={m.id} m={m} ix={ix} showDay />)}
        {!ms.length && <div className="empty">Raspored još nije unesen.</div>}</div>
    </section>
  );
}

function Rules({ league, season }) {
  const R = RULES[`${league.id}-${season}`];
  if (!R) return <div className="empty">Sažetak propozicija za ovu ligu još nije unesen.</div>;
  return (
    <div className="prose rules">
      <p className="muted small">Sažetak službenih propozicija HNS-a. Mjerodavan je izvorni dokument:{" "}
        <a href={R.url} target="_blank" rel="noreferrer" style={{ color: "var(--primary)", fontWeight: 500 }}>{R.title}</a>{R.title.endsWith(".") ? "" : "."}</p>
      {R.sections.map(([h, items]) => (
        <section key={h}>
          <h2>{h}</h2>
          <ul>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </section>))}
    </div>
  );
}
