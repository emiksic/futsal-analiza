import { update, uid } from "../lib/store.js";
import { Icon } from "../components/ui.jsx";
import { href } from "../lib/router.js";

export function Halls({ db }) {
  const uh = (id, fn) => update((d) => fn(d.halls.find((h) => h.id === id)));
  const add = () => update((d) => { d.halls.push({ id: uid("dv-"), name: "Nova dvorana", city: "", calibrated: false }); });
  return (
    <>
      <div className="ahead"><h1>Dvorane</h1><div className="r"><button className="btn primary" onClick={add}>{Icon.plus()} Nova dvorana</button></div></div>
      <section className="panel">
        <div className="pb" style={{ paddingTop: 14 }}>
          <div className="callout">Svaka dvorana se kalibrira jednom: na panorami terena klikneš stative i središnju liniju, a analiza onda zna gdje su linije na svakoj snimci iz te dvorane.</div>
        </div>
        <div className="tbl-wrap">
          <table className="atbl">
            <thead><tr><th>Naziv</th><th>Grad</th><th>Klubovi</th><th>Kalibracija</th><th /></tr></thead>
            <tbody>{db.halls.map((h) => (
              <tr key={h.id}>
                <td><input className="input sm" value={h.name} onChange={(e) => uh(h.id, (x) => { x.name = e.target.value; })} aria-label="Naziv dvorane" /></td>
                <td><input className="input sm" value={h.city} onChange={(e) => uh(h.id, (x) => { x.city = e.target.value; })} aria-label="Grad" /></td>
                <td className="small">{db.clubs.filter((c) => c.hall === h.id).map((c) => c.name).join(", ") || "—"}</td>
                <td>{h.calibrated ? <span className="pill done">kalibrirana</span> : <span className="pill queued">nije</span>}</td>
                <td><a className="btn sm" href={href("admin", "dvorana", h.id)}>Kalibriraj</a></td>
              </tr>))}</tbody>
          </table>
        </div>
      </section>
    </>
  );
}
