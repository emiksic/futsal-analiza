import { useState } from "react";
import { href } from "../lib/router.js";
import { resetDB } from "../lib/store.js";
import { Matches } from "./Matches.jsx";
import { MatchEdit } from "./MatchEdit.jsx";
import { Clubs, ClubEdit } from "./Clubs.jsx";
import { Leagues } from "./Leagues.jsx";
import { Halls } from "./Halls.jsx";

export function Admin({ db, ix, route }) {
  const [sec, a, b] = route;
  const s = sec || "utakmice";
  const queue = db.matches.filter((m) => ["queued", "processing"].includes(m.analysis?.status)).length;
  const NAV = [["utakmice", "Utakmice", queue ? `${queue} u redu` : ""], ["klubovi", "Klubovi i igrači"], ["lige", "Lige i sezone"], ["dvorane", "Dvorane"]];
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
      </main>
    </div>
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
