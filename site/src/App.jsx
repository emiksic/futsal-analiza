import { useEffect, useMemo } from "react";
import { useDB, useStore } from "./lib/store.js";
import { useRoute, href } from "./lib/router.js";
import { index } from "./lib/derive.js";
import { Brand } from "./components/ui.jsx";
import { Home } from "./pages/Home.jsx";
import { League } from "./pages/League.jsx";
import { Club } from "./pages/Club.jsx";
import { Match } from "./pages/Match.jsx";
import { Admin } from "./admin/Admin.jsx";
import { Posts } from "./admin/Posts.jsx";
import { Render } from "./pages/Render.jsx";
import { Privacy } from "./pages/Privacy.jsx";
import { Notice } from "./components/Notice.jsx";
import { useTheme, toggleTheme } from "./lib/theme.js";

function ThemeToggle() {
  const t = useTheme(), dark = t === "dark";
  return (
    <button type="button" className="theme" onClick={toggleTheme} aria-label={dark ? "Prebaci na svijetli način" : "Prebaci na tamni način"} title={dark ? "Svijetli način" : "Tamni način"}>
      {dark
        ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></svg>
        : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" /></svg>}
    </button>
  );
}

export default function App() {
  const db = useDB();
  // Dok baza ne odgovori, ne prikazuj ugrađene (stare) podatke iz koda: inače se par sekundi vidi staro stanje pa "skoči" na novo.
  // Ako se baza ne javi u 8 s, store prelazi na ugrađene podatke (status offline) i stranica se prikaže.
  const loading = useStore().status === "loading";
  const ix = useMemo(() => index(db), [db]);
  useEffect(() => { document.title = db.site?.name || "HMNL Statistika"; }, [db.site?.name]);
  const r = useRoute();
  const [page, ...rest] = r;
  const cur = db.seasons[0].id;
  let activeLeague = null;
  if (page === "liga") activeLeague = rest[0];
  if (page === "utakmica" && ix.match[rest[0]]) activeLeague = ix.comp[ix.match[rest[0]].comp].league;
  return (
    <>
      <header className="top">
        <div className="top-in">
          <Brand name={db.site?.name} />
          <nav className="lnav" aria-label="Lige">
            {db.leagues.filter((l) => db.comps.some((c) => c.league === l.id && c.season === cur)).map((l) => <a key={l.id} href={href("liga", l.id, cur)} aria-current={activeLeague === l.id ? "page" : undefined}>{l.name}</a>)}
          </nav>
          <ThemeToggle />
          <a className="adm" href={href("admin")} aria-current={page === "admin" || page === "objave" ? "page" : undefined}>Admin</a>
        </div>
      </header>
      {page !== "admin" && page !== "objave" && page !== "izrada" && (
        <div className="demo-bar"><div>Testna verzija. Podaci se još unose i mogu biti nepotpuni.</div></div>
      )}
      {loading && page !== "admin" && page !== "objave" && page !== "privatnost" && <div className="page"><div className="panel loadpanel" role="status"><span className="spin" aria-hidden="true" />Učitavam podatke…</div></div>}
      {!loading && !page && <Home db={db} ix={ix} />}
      {!loading && page === "liga" && <League db={db} ix={ix} leagueId={rest[0]} seasonId={rest[1] || cur} tab={rest[2]} roundArg={rest[3]} />}
      {!loading && page === "klub" && <Club key={rest[0]} db={db} ix={ix} id={rest[0]} />}
      {!loading && page === "utakmica" && <Match db={db} ix={ix} id={rest[0]} tab={rest[1]} />}
      {page === "admin" && <Admin db={db} ix={ix} route={rest} />}
      {!loading && page === "izrada" && <Render db={db} ix={ix} comp={rest[0]} round={rest[1]} mode={rest[2]} theme={rest[3]} />}
      {page === "objave" && <Admin db={db} ix={ix} route={rest}><Posts db={db} ix={ix} comp={rest[0]} round={rest[1]} /></Admin>}
      {page === "privatnost" && <Privacy db={db} />}
      {page !== "admin" && page !== "objave" && page !== "izrada" && page !== "privatnost" && <Notice name={db.site?.name || "Ova stranica"} />}
      {page !== "admin" && page !== "objave" && page !== "izrada" && (
        <footer className="site-foot">
          <span>Neslužbena stranica, nije povezana s HNS-om ni s klubovima. Video prijenosi pripadaju njihovim vlasnicima i prikazuju se kroz YouTube player.</span>
          <a href={href("privatnost")}>Privatnost i uklanjanje podataka</a>
        </footer>)}
    </>
  );
}
