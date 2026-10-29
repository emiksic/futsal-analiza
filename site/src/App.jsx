import { useMemo } from "react";
import { useDB } from "./lib/store.js";
import { useRoute, href } from "./lib/router.js";
import { index } from "./lib/derive.js";
import { Brand } from "./components/ui.jsx";
import { Home } from "./pages/Home.jsx";
import { League } from "./pages/League.jsx";
import { Club } from "./pages/Club.jsx";
import { Match } from "./pages/Match.jsx";
import { Admin } from "./admin/Admin.jsx";
import { Privacy } from "./pages/Privacy.jsx";
import { Notice } from "./components/Notice.jsx";

export default function App() {
  const db = useDB();
  const ix = useMemo(() => index(db), [db]);
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
          <Brand />
          <nav className="lnav" aria-label="Lige">
            {db.leagues.filter((l) => db.comps.some((c) => c.league === l.id && c.season === cur)).map((l) => <a key={l.id} href={href("liga", l.id, cur)} aria-current={activeLeague === l.id ? "page" : undefined}>{l.name}</a>)}
          </nav>
          <a className="adm" href={href("admin")} aria-current={page === "admin" ? "page" : undefined}>Admin</a>
        </div>
      </header>
      {page !== "admin" && (
        <div className="demo-bar"><div>Testna verzija. Podaci se još unose i mogu biti nepotpuni.</div></div>
      )}
      {!page && <Home db={db} ix={ix} />}
      {page === "liga" && <League db={db} ix={ix} leagueId={rest[0]} seasonId={rest[1] || cur} tab={rest[2]} roundArg={rest[3]} />}
      {page === "klub" && <Club key={rest[0]} db={db} ix={ix} id={rest[0]} />}
      {page === "utakmica" && <Match db={db} ix={ix} id={rest[0]} tab={rest[1]} />}
      {page === "admin" && <Admin db={db} ix={ix} route={rest} />}
      {page === "privatnost" && <Privacy db={db} />}
      {page !== "admin" && page !== "privatnost" && <Notice name={db.site?.name || "Ova stranica"} />}
      {page !== "admin" && (
        <footer className="site-foot">
          <span>Neslužbena stranica, nije povezana s HNS-om ni s klubovima. Video prijenosi pripadaju njihovim vlasnicima i prikazuju se kroz YouTube player.</span>
          <a href={href("privatnost")}>Privatnost i uklanjanje podataka</a>
        </footer>)}
    </>
  );
}
