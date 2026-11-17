import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useDB, useStore } from "./lib/store.js";
import { useRoute, href } from "./lib/router.js";
import { index } from "./lib/derive.js";
import { Brand } from "./components/ui.jsx";
import { Home } from "./pages/Home.jsx";
import { League } from "./pages/League.jsx";
import { Club } from "./pages/Club.jsx";
import { Match } from "./pages/Match.jsx";
import { Privacy } from "./pages/Privacy.jsx";
import { PlayerPage } from "./pages/PlayerPage.jsx";
import { Notice } from "./components/Notice.jsx";
import { InstallHint } from "./components/InstallHint.jsx";
import { Skeleton } from "./components/Skeleton.jsx";
// admin, objave i izrada slika učitavaju se tek kad zatrebaju (posjetitelji ih ne preuzimaju)
const Admin = lazy(() => import("./admin/Admin.jsx").then((m) => ({ default: m.Admin })));
const Posts = lazy(() => import("./admin/Posts.jsx").then((m) => ({ default: m.Posts })));
const Render = lazy(() => import("./pages/Render.jsx").then((m) => ({ default: m.Render })));
const Wait = () => <div className="page"><div className="panel loadpanel" role="status"><span className="spin" aria-hidden="true" />Učitavam…</div></div>;
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

// Zaglavlje na mobitelu: skrij pri skrolanju prema dolje, pokaži pri skrolanju prema gore ili blizu vrha.
function useHideOnScroll() {
  const [hide, setHide] = useState(false);
  useEffect(() => {
    let last = window.scrollY, ticking = false;
    const run = () => {
      ticking = false;
      const y = window.scrollY, d = y - last;
      if (y < 120) setHide(false);
      else if (d > 6) setHide(true);
      else if (d < -6) setHide(false);
      if (Math.abs(d) > 6 || y < 120) last = y;
    };
    const on = () => { if (!ticking) { ticking = true; requestAnimationFrame(run); } };
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return hide;
}

export default function App() {
  const db = useDB();
  // Dok baza ne odgovori, ne prikazuj ugrađene (stare) podatke iz koda: inače se par sekundi vidi staro stanje pa "skoči" na novo.
  // Ako se baza ne javi u 8 s, store prelazi na ugrađene podatke (status offline) i stranica se prikaže.
  const loading = useStore().status === "loading";
  const ix = useMemo(() => index(db), [db]);
  useEffect(() => { document.title = db.site?.name || "HMNL Statistika"; }, [db.site?.name]);
  const theme = useTheme();
  useEffect(() => {   // boja trake preglednika / statusne trake mobitela = boja zaglavlja u odabranoj temi
    const band = getComputedStyle(document.documentElement).getPropertyValue("--band").trim();
    if (band) document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.content = band; });
  }, [theme]);
  const r = useRoute();
  const [page, ...rest] = r;
  const hideTop = useHideOnScroll();
  const cur = db.seasons[0].id;
  let activeLeague = null;
  if (page === "liga") activeLeague = rest[0];
  if (page === "utakmica" && ix.match[rest[0]]) activeLeague = ix.comp[ix.match[rest[0]].comp].league;
  return (
    <>
      <header className={`top${hideTop ? " hide" : ""}`} onFocusCapture={(e) => e.currentTarget.classList.remove("hide")}>
        <div className="top-in">
          <Brand name={db.site?.name} />
          <nav className="lnav" aria-label="Lige">
            {db.leagues.filter((l) => db.comps.some((c) => c.league === l.id && c.season === cur)).map((l) => <a key={l.id} href={href("liga", l.id, cur)} aria-current={activeLeague === l.id ? "page" : undefined}><span className="ln-full">{l.name}</span><span className="ln-short">{l.id === "kup" ? "Kup" : l.name.replace(/^1\. HMNL /i, "")}</span></a>)}
          </nav>
          <ThemeToggle />
          <a className="adm" href={href("admin")} aria-current={page === "admin" || page === "objave" ? "page" : undefined}>Admin</a>
        </div>
      </header>
      {page !== "admin" && page !== "objave" && page !== "izrada" && (
        <div className="demo-bar"><div>Testna verzija. Podaci se još unose i mogu biti nepotpuni.</div></div>
      )}
      {page !== "admin" && page !== "objave" && page !== "izrada" && <InstallHint />}
      {loading && page !== "admin" && page !== "objave" && page !== "privatnost" && <Skeleton page={page} />}
      {!loading && !page && <Home db={db} ix={ix} />}
      {!loading && page === "liga" && <League db={db} ix={ix} leagueId={rest[0]} seasonId={rest[1] || cur} tab={rest[2]} roundArg={rest[3]} />}
      {!loading && page === "klub" && <Club key={rest[0]} db={db} ix={ix} id={rest[0]} />}
      {!loading && page === "utakmica" && <Match db={db} ix={ix} id={rest[0]} tab={rest[1]} />}
      {!loading && page === "igrac" && <PlayerPage key={rest[0]} db={db} ix={ix} id={rest[0]} />}
      {page === "admin" && <Suspense fallback={<Wait />}><Admin db={db} ix={ix} route={rest} /></Suspense>}
      {!loading && page === "izrada" && <Suspense fallback={null}><Render db={db} ix={ix} comp={rest[0]} round={rest[1]} mode={rest[2]} theme={rest[3]} /></Suspense>}
      {page === "objave" && <Suspense fallback={<Wait />}><Admin db={db} ix={ix} route={rest}><Posts db={db} ix={ix} comp={rest[0]} round={rest[1]} /></Admin></Suspense>}
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
