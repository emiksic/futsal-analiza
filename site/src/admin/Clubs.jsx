import { useState } from "react";
import { href, go } from "../lib/router.js";
import { update, uid } from "../lib/store.js";
import { Jersey, Icon } from "../components/ui.jsx";
import { surnameOf } from "../lib/derive.js";

export function Clubs({ db, ix }) {
  const cur = db.seasons[0].id;
  const add = () => { const id = uid("klub-"); update((d) => { d.clubs.push({ id, name: "Novi klub", short: "NOV", city: "", hall: d.halls[0]?.id, kit: { shirt: "#dddddd", trim: "#333333", num: "#111111" } }); }); go("admin", "klub", id); };
  return (
    <>
      <div className="ahead"><h1>Klubovi i igrači</h1><div className="r"><button className="btn primary" onClick={add}>{Icon.plus()} Novi klub</button></div></div>
      <section className="panel">
        <div className="tbl-wrap">
          <table className="atbl">
            <thead><tr><th>Klub</th><th>Kratica</th><th>Grad</th><th>Dvorana</th><th>Igrača ({db.seasons[0].name})</th><th>Natjecanja</th><th /></tr></thead>
            <tbody>{db.clubs.map((c) => {
              const n = db.players.filter((p) => p.club === c.id && p.season === cur).length;
              const comps = db.comps.filter((x) => x.season === cur && x.teams.includes(c.id)).map((x) => ix.league[x.league].category);
              return (
                <tr key={c.id}>
                  <td><span className="mt"><Jersey kit={c.kit} size={24} />{c.name}</span></td>
                  <td>{c.short}</td><td>{c.city}</td><td className="small">{ix.hall[c.hall]?.name}</td><td>{n}</td>
                  <td className="small">{comps.join(", ") || "—"}</td>
                  <td><a className="btn sm" href={href("admin", "klub", c.id)}>Uredi</a></td>
                </tr>);
            })}</tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export function ClubEdit({ db, ix, id }) {
  const c = ix.club[id];
  const cur = db.seasons[0].id;
  const cats = [...new Set(db.comps.filter((x) => x.season === cur && x.teams.includes(id)).map((x) => ix.league[x.league].category))];
  const [cat, setCat] = useState(cats[0] || "Seniori");
  const [nn, setNn] = useState(""); const [nm, setNm] = useState(""); const [g, setG] = useState(false);
  if (!c) return <div className="panel empty">Klub ne postoji.</div>;
  const uc = (fn) => update((d) => fn(d.clubs.find((x) => x.id === id)));
  const up = (pid, fn) => update((d) => fn(d.players.find((p) => p.id === pid)));
  const squad = db.players.filter((p) => p.club === id && p.season === cur && p.cat === cat).sort((a, b) => a.num - b.num);
  const add = () => { if (!nn) return; update((d) => { d.players.push({ id: uid(`${id}-`), club: id, season: cur, cat, num: nn, name: nm.trim(), gk: g }); }); setNn(""); setNm(""); setG(false); };
  const used = (pid) => db.matches.some((m) => m.roster.home?.players?.includes(pid) || m.roster.away?.players?.includes(pid) || m.events.some((e) => e.player === pid || e.assist === pid));
  return (
    <>
      <a className="back" href={href("admin", "klubovi")}>Svi klubovi</a>
      <div className="ahead"><h1 style={{ display: "flex", gap: 12, alignItems: "center" }}><Jersey kit={c.kit} size={40} />{c.name}</h1>
        <div className="r"><a className="btn" href={href("klub", id)}>Javna stranica {Icon.ext()}</a></div></div>
      <section className="panel">
        <div className="ph"><h2>Podaci kluba</h2></div>
        <div className="form-grid">
          <label className="field"><span>Naziv</span><input className="input" value={c.name} onChange={(e) => uc((x) => { x.name = e.target.value; })} /></label>
          <label className="field"><span>Kratica (3 slova)</span><input className="input" value={c.short} maxLength={4} onChange={(e) => uc((x) => { x.short = e.target.value.toUpperCase(); })} />
            <small>Koristi se u analizi i zapisniku.</small></label>
          <label className="field"><span>Grad</span><input className="input" value={c.city} onChange={(e) => uc((x) => { x.city = e.target.value; })} /></label>
          <label className="field"><span>Domaća dvorana</span>
            <select className="input" value={c.hall} onChange={(e) => uc((x) => { x.hall = e.target.value; })}>
              {db.halls.map((h) => <option key={h.id} value={h.id}>{h.name}, {h.city}</option>)}
            </select></label>
          <div className="field wide"><span>Boje dresa</span>
            <div className="kitpick">
              <Jersey kit={c.kit} size={56} num="10" />
              {[["shirt", "Dres"], ["trim", "Rukavi i ovratnik"], ["num", "Broj"]].map(([k, n]) => (
                <label key={k} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <input type="color" value={c.kit[k]} onChange={(e) => uc((x) => { x.kit[k] = e.target.value; })} aria-label={n} />{n}</label>))}
            </div>
            <small>Analiza koristi boju dresa kao početnu pretpostavku kod prepoznavanja ekipa.</small></div>
        </div>
      </section>
      <section className="panel">
        <div className="ph"><h2>Igrači, sezona {db.seasons[0].name}</h2>
          {cats.length > 1 && <div className="seg">{cats.map((k) => <button key={k} aria-pressed={cat === k} onClick={() => setCat(k)}>{k}</button>)}</div>}</div>
        <div className="tbl-wrap">
          <table className="atbl">
            <thead><tr><th>Broj</th><th>Ime i prezime</th><th>Prezime</th><th>Golman</th><th /></tr></thead>
            <tbody>{squad.map((p) => (
              <tr key={p.id}>
                <td><input className="input sm num" value={p.num} onChange={(e) => up(p.id, (q) => { q.num = e.target.value.replace(/\D/g, "").slice(0, 2); })} aria-label="Broj" /></td>
                <td><input className="input sm" value={p.name} placeholder="Ime i prezime" onChange={(e) => up(p.id, (q) => { q.name = e.target.value; })} aria-label={`Ime, broj ${p.num}`} /></td>
                <td><input className="input sm" value={p.last || ""} placeholder={surnameOf({ name: p.name }) || "prezime"} onChange={(e) => up(p.id, (q) => { q.last = e.target.value.trim() || undefined; })} aria-label={`Prezime, broj ${p.num}`} title="Upiši samo ako je automatska procjena prezimena kriva" /></td>
                <td><input type="checkbox" className="check" checked={p.gk} onChange={(e) => up(p.id, (q) => { q.gk = e.target.checked; })} aria-label="Golman" /></td>
                <td>{used(p.id) ? <span className="small muted">u zapisnicima</span> :
                  <button className="btn sm ghost danger" onClick={() => update((d) => { d.players = d.players.filter((q) => q.id !== p.id); })} aria-label={`Obriši igrača ${p.num}`}>{Icon.trash()}</button>}</td>
              </tr>))}</tbody>
          </table>
        </div>
        <form className="addp" style={{ gridTemplateColumns: "64px 1fr auto auto", borderRadius: "0 0 12px 12px" }} onSubmit={(e) => { e.preventDefault(); add(); }}>
          <input className="input sm num" value={nn} onChange={(e) => setNn(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="#" aria-label="Broj" />
          <input className="input sm" value={nm} onChange={(e) => setNm(e.target.value)} placeholder="Ime i prezime" aria-label="Ime" />
          <label className="small" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" className="check" checked={g} onChange={(e) => setG(e.target.checked)} />GK</label>
          <button className="btn sm" type="submit" disabled={!nn}>{Icon.plus(14)} Dodaj igrača</button>
        </form>
      </section>
    </>
  );
}
