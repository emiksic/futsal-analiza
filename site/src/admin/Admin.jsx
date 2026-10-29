import { useState } from "react";
import { href } from "../lib/router.js";
import { resetDB } from "../lib/store.js";
import { Matches } from "./Matches.jsx";
import { MatchEdit } from "./MatchEdit.jsx";
import { Clubs, ClubEdit } from "./Clubs.jsx";
import { Leagues } from "./Leagues.jsx";
import { Halls } from "./Halls.jsx";
import { update } from "../lib/store.js";

export function Admin({ db, ix, route }) {
  const [sec, a, b] = route;
  const s = sec || "utakmice";
  const queue = db.matches.filter((m) => ["queued", "processing"].includes(m.analysis?.status)).length;
  const NAV = [["utakmice", "Utakmice", queue ? `${queue} u redu` : ""], ["klubovi", "Klubovi i igrači"], ["lige", "Lige i sezone"], ["dvorane", "Dvorane"], ["postavke", "Postavke stranice"]];
  const cur = s === "utakmica" ? "utakmice" : s === "klub" ? "klubovi" : s;
  return (
    <div className="admin">
      <aside className="col">
        <nav className="panel anav" aria-label="Admin">
          {NAV.map(([k, n, x]) => <a key={k} href={href("admin", k)} aria-current={cur === k ? "page" : undefined}>{n}{x && <small>{x}</small>}</a>)}
        </nav>
        <Local />
      </aside>
      <main className="col">
        {s === "utakmice" && <Matches db={db} ix={ix} />}
        {s === "utakmica" && <MatchEdit db={db} ix={ix} id={a} tab={b} />}
        {s === "klubovi" && <Clubs db={db} ix={ix} />}
        {s === "klub" && <ClubEdit db={db} ix={ix} id={a} />}
        {s === "lige" && <Leagues db={db} ix={ix} />}
        {s === "dvorane" && <Halls db={db} ix={ix} />}
        {s === "postavke" && <Settings db={db} />}
      </main>
    </div>
  );
}

function Settings({ db }) {
  const us = (fn) => update((d) => { d.site ||= {}; fn(d.site); });
  return (
    <>
      <div className="ahead"><h1>Postavke stranice</h1></div>
      <section className="panel">
        <div className="form-grid" style={{ paddingTop: 16 }}>
          <label className="field"><span>Naziv stranice</span><input className="input" placeholder="Futsal statistika" value={db.site?.name || ""} onChange={(e) => us((x) => { x.name = e.target.value; })} /></label>
          <label className="field"><span>Kontakt za ispravke i uklanjanje</span><input className="input" type="email" value={db.site?.contact || ""} placeholder="npr. kontakt@domena.hr" onChange={(e) => us((x) => { x.contact = e.target.value.trim(); })} />
            <small>Prikazuje se na stranici o privatnosti. Igrači, roditelji i klubovi tu traže uklanjanje podataka.</small></label>
        </div>
      </section>
    </>
  );
}

function Local() {
  const [ask, setAsk] = useState(false);
  return (
    <section className="panel">
      <div className="pb" style={{ paddingTop: 14, display: "grid", gap: 10 }}>
        <div className="small muted">Za sada se promjene spremaju samo u ovom pregledniku. Prijava i zajednička baza dolaze sa Supabaseom.</div>
        {!ask ? <button className="btn sm" onClick={() => setAsk(true)}>Vrati početne podatke</button> :
          <span className="confirm">Obrisati sve izmjene? <button className="btn sm danger" onClick={() => { resetDB(); setAsk(false); }}>Obriši</button>
            <button className="btn sm ghost" onClick={() => setAsk(false)}>Odustani</button></span>}
      </div>
    </section>
  );
}
