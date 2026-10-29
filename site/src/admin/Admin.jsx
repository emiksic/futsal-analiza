import { useState } from "react";
import { href } from "../lib/router.js";
import { resetDB, useStore, signIn, signOut, importSeed } from "../lib/store.js";
import { Matches } from "./Matches.jsx";
import { MatchEdit } from "./MatchEdit.jsx";
import { Clubs, ClubEdit } from "./Clubs.jsx";
import { Leagues } from "./Leagues.jsx";
import { Halls } from "./Halls.jsx";
import { update } from "../lib/store.js";

export function Admin({ db, ix, route }) {
  const st = useStore();
  if (st.status === "loading") return <div className="admin"><div /><div className="panel empty">Spajam se na bazu…</div></div>;
  if (st.mode === "remote" && !st.isAdmin) return <Login st={st} />;
  if (st.status === "empty") return <ImportSeed />;
  return <AdminInner db={db} ix={ix} route={route} />;
}

function Login({ st }) {
  const [email, setEmail] = useState(""); const [pw, setPw] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async (e) => { e.preventDefault(); setBusy(true); setErr("");
    try { await signIn(email.trim(), pw); } catch (x) { setErr(x.message === "Invalid login credentials" ? "Pogrešan email ili lozinka." : x.message); } setBusy(false); };
  return (
    <div className="admin" style={{ gridTemplateColumns: "minmax(0, 420px)", justifyContent: "center" }}>
      <section className="panel">
        <div className="ph"><h2>Prijava za admin</h2></div>
        {st.session ? (
          <div className="pb" style={{ display: "grid", gap: 10 }}>
            <p style={{ margin: 0 }}>Prijavljen si kao <b>{st.session.user.email}</b>, ali taj račun nema administratorska prava.</p>
            <div><button className="btn" onClick={signOut}>Odjava</button></div>
          </div>
        ) : (
          <form className="pb" style={{ display: "grid", gap: 12 }} onSubmit={go}>
            <label className="field"><span>Email</span><input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            <label className="field"><span>Lozinka</span><input className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></label>
            {err && <div className="callout warn">{err}</div>}
            <button className="btn primary" type="submit" disabled={busy}>{busy ? "Prijavljujem…" : "Prijava"}</button>
          </form>)}
      </section>
    </div>
  );
}

function ImportSeed() {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  return (
    <div className="admin" style={{ gridTemplateColumns: "minmax(0, 560px)", justifyContent: "center" }}>
      <section className="panel">
        <div className="ph"><h2>Baza je prazna</h2></div>
        <div className="pb" style={{ display: "grid", gap: 12 }}>
          <p style={{ margin: 0 }}>Spojen si na bazu, ali u njoj još nema podataka. Uvezi postojeće podatke (lige, klubovi, raspored, rezultati, postave seniora). Nakon toga se sve uređuje ovdje i sprema izravno u bazu.</p>
          {err && <div className="callout warn">{err}</div>}
          <div><button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); setErr(""); try { await importSeed(); } catch (x) { setErr(x.message); } setBusy(false); }}>
            {busy ? "Uvozim…" : "Uvezi početne podatke"}</button></div>
        </div>
      </section>
    </div>
  );
}

function AdminInner({ db, ix, route }) {
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
  const st = useStore();
  if (st.mode === "remote") {
    const L = { idle: "Sve je spremljeno u bazu.", saving: "Spremam…", saved: "Spremljeno u bazu.", error: `Greška pri spremanju: ${st.syncError}` };
    return (
      <section className="panel">
        <div className="pb" style={{ paddingTop: 12, display: "grid", gap: 10 }}>
          <div className="small" style={{ color: st.sync === "error" ? "var(--live)" : "var(--muted)" }} role="status">{L[st.sync]}</div>
          <div className="small muted">{st.session?.user?.email}</div>
          <div><button className="btn sm" onClick={signOut}>Odjava</button></div>
        </div>
      </section>);
  }
  return (
    <section className="panel">
      <div className="pb" style={{ paddingTop: 14, display: "grid", gap: 10 }}>
        <div className="small muted">Baza nije dostupna, pa se promjene spremaju samo u ovom pregledniku.</div>
        {!ask ? <button className="btn sm" onClick={() => setAsk(true)}>Vrati početne podatke</button> :
          <span className="confirm">Obrisati sve izmjene? <button className="btn sm danger" onClick={() => { resetDB(); setAsk(false); }}>Obriši</button>
            <button className="btn sm ghost" onClick={() => setAsk(false)}>Odustani</button></span>}
      </div>
    </section>
  );
}
