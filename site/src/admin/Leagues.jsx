import { useState } from "react";
import { update } from "../lib/store.js";
import { compName, NAME_FORMATS } from "../lib/derive.js";
import { Jersey, Icon, LeagueBadge } from "../components/ui.jsx";

function roundRobin(ids) {
  const t = [...ids]; if (t.length % 2) t.push(null);
  const n = t.length, rounds = [];
  for (let r = 0; r < n - 1; r++) { const p = [];
    for (let i = 0; i < n / 2; i++) { const a = t[i], b = t[n - 1 - i]; if (a && b) p.push(r % 2 ? [b, a] : [a, b]); }
    rounds.push(p); t.splice(1, 0, t.pop()); }
  return [...rounds, ...rounds.map((r) => r.map(([a, b]) => [b, a]))];
}

export function Leagues({ db, ix }) {
  const [ns, setNs] = useState("");
  const [nc, setNc] = useState({ league: db.leagues[0].id, season: db.seasons[0].id });
  const ul = (id, fn) => update((d) => fn(d.leagues.find((l) => l.id === id)));
  const addSeason = () => { const m = /^(\d{4})\D*(\d{2})?/.exec(ns); if (!m) return;
    const y = +m[1], id = `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
    if (db.seasons.some((s) => s.id === id)) return;
    update((d) => { d.seasons.push({ id, name: `${y}./${String((y + 1) % 100).padStart(2, "0")}.` }); d.seasons.sort((a, b) => b.id.localeCompare(a.id)); }); setNs(""); };
  const addComp = () => { const id = `${nc.league}-${nc.season}`; if (db.comps.some((c) => c.id === id)) return;
    update((d) => { d.comps.push({ id, league: nc.league, season: nc.season, teams: [], rounds: 0 }); }); };
  return (
    <>
      <div className="ahead"><h1>Lige i sezone</h1></div>
      <section className="panel">
        <div className="ph"><h2>Lige</h2></div>
        <div className="pb small muted">U bazi se za svakog igrača čuvaju ime, prezime, klub i broj. Prikaz imena određuje samo što se vidi na javnim stranicama, a u adminu se uvijek vidi puno ime. Za kadete (maloljetnici) preporuka je samo broj i bez podataka po igraču.</div>
        <div className="tbl-wrap">
          <table className="atbl">
            <thead><tr><th /><th>Naziv</th><th>Kategorija</th><th title="Izravno u polufinale">Polufinale</th><th title="Ukupno mjesta u doigravanju">Doigravanje</th><th title="Mjesta za kvalifikacije (iznad ispadanja)">Kvalif.</th><th>Ispadanje</th><th>Prikaz imena</th><th>Podaci po igraču</th></tr></thead>
            <tbody>{db.leagues.map((l) => (
              <tr key={l.id}>
                <td><LeagueBadge league={l} /></td>
                <td><input className="input sm" value={l.name} onChange={(e) => ul(l.id, (x) => { x.name = e.target.value; })} aria-label="Naziv lige" /></td>
                <td><select className="input sm" value={l.category} onChange={(e) => ul(l.id, (x) => { x.category = e.target.value; })} aria-label="Kategorija">
                  {["Seniori", "U-19", "U-17", "U-15", "Seniorke"].map((c) => <option key={c}>{c}</option>)}</select></td>
                <td><input className="input sm num" type="number" min="0" value={l.zones?.direct || 0} onChange={(e) => ul(l.id, (x) => { x.zones = { ...x.zones, direct: +e.target.value }; })} aria-label="Izravno u polufinale" /></td>
                <td><input className="input sm num" type="number" min="0" value={l.zones?.playoff || 0} onChange={(e) => ul(l.id, (x) => { x.zones = { ...x.zones, playoff: +e.target.value }; })} aria-label="Doigravanje" /></td>
                <td><input className="input sm num" type="number" min="0" value={l.zones?.qual || 0} onChange={(e) => ul(l.id, (x) => { x.zones = { ...x.zones, qual: +e.target.value }; })} aria-label="Kvalifikacije" /></td>
                <td><input className="input sm num" type="number" min="0" value={l.zones?.relegation || 0} onChange={(e) => ul(l.id, (x) => { x.zones = { ...x.zones, relegation: +e.target.value }; })} aria-label="Ispadanje" /></td>
                <td><select className="input sm" value={l.privacy?.names || "full"} onChange={(e) => ul(l.id, (x) => { x.privacy = { ...x.privacy, names: e.target.value }; })} aria-label="Prikaz imena">
                  {Object.entries(NAME_FORMATS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></td>
                <td><label className="small" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <input type="checkbox" className="check" checked={l.privacy?.perPlayer !== false} onChange={(e) => ul(l.id, (x) => { x.privacy = { ...x.privacy, perPlayer: e.target.checked }; })} />
                  toplinske mape, metri</label></td>
              </tr>))}</tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="ph"><h2>Sezone</h2></div>
        <div className="toolbar">
          {db.seasons.map((s) => <span key={s.id} className="pill">{s.name}</span>)}
          <span className="grow" />
          <form style={{ display: "flex", gap: 8 }} onSubmit={(e) => { e.preventDefault(); addSeason(); }}>
            <input className="input sm" style={{ width: 140 }} value={ns} onChange={(e) => setNs(e.target.value)} placeholder="npr. 2027" aria-label="Godina početka sezone" />
            <button className="btn sm" type="submit">{Icon.plus(14)} Dodaj sezonu</button>
          </form>
        </div>
      </section>
      <section className="panel">
        <div className="ph"><h2>Natjecanja</h2><span className="aside">liga u jednoj sezoni: klubovi i raspored</span></div>
        <div className="toolbar">
          <select className="select" value={nc.league} onChange={(e) => setNc({ ...nc, league: e.target.value })} aria-label="Liga">{db.leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          <select className="select" value={nc.season} onChange={(e) => setNc({ ...nc, season: e.target.value })} aria-label="Sezona">{db.seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <button className="btn sm" onClick={addComp} disabled={db.comps.some((c) => c.id === `${nc.league}-${nc.season}`)}>{Icon.plus(14)} Dodaj natjecanje</button>
        </div>
        {db.comps.map((c) => <CompEditor key={c.id} db={db} ix={ix} comp={c} />)}
      </section>
    </>
  );
}

function CompEditor({ db, ix, comp }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("");
  const n = db.matches.filter((m) => m.comp === comp.id).length;
  const uc = (fn) => update((d) => fn(d.comps.find((c) => c.id === comp.id)));
  const gen = () => {
    if (!start || n || comp.teams.length < 2) return;
    const sched = roundRobin(comp.teams), t0 = new Date(start);
    update((d) => {
      sched.forEach((pairs, ri) => pairs.forEach(([h, a]) => d.matches.push({ id: `${comp.id}-k${ri + 1}-${h}-${a}`, comp: comp.id, round: ri + 1,
        date: new Date(t0.getTime() + ri * 7 * 864e5).toISOString(), home: h, away: a, hall: d.clubs.find((c) => c.id === h).hall,
        status: "scheduled", youtube: "", roster: { home: null, away: null }, events: [], analysis: null })));
      d.comps.find((c) => c.id === comp.id).rounds = sched.length;
    });
  };
  return (
    <div style={{ borderTop: "1px solid var(--line)" }}>
      <button className="btn ghost" style={{ width: "100%", justifyContent: "space-between", padding: "12px 16px", borderRadius: 0 }} onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{compName(ix, comp.id)}</span>
        <span className="small muted" style={{ fontFamily: "var(--body)", fontWeight: 400 }}>{comp.teams.length} klubova, {comp.rounds} kola, {n} utakmica {open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="pb" style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {db.clubs.map((c) => {
              const on = comp.teams.includes(c.id);
              return <label key={c.id} className="tg" style={{ color: on ? "var(--fg)" : undefined }}>
                <input type="checkbox" checked={on} disabled={n > 0} onChange={() => uc((x) => { x.teams = on ? x.teams.filter((t) => t !== c.id) : [...x.teams, c.id]; })} />
                <Jersey kit={c.kit} size={16} />{c.name}</label>;
            })}
          </div>
          {n > 0 ? <div className="small muted">Raspored je napravljen, pa se popis klubova više ne mijenja ovdje. Pojedine utakmice uređuješ pod Utakmice.</div> : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
              <label className="field"><span>Prvo kolo</span><input className="input" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></label>
              <button className="btn primary" disabled={!start || comp.teams.length < 2} onClick={gen}>Napravi raspored (dvokružno)</button>
            </div>)}
        </div>)}
    </div>
  );
}
