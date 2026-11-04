// Admin -> Objave: Instagram objava za odabrano kolo (raspored ili rezultati), preuzimanje kao PNG.
import { useEffect, useMemo, useRef, useState } from "react";
import { replaceGo } from "../lib/router.js";
import { currentRound, compName, roundName } from "../lib/derive.js";
import { buildPost, drawPage, loadFonts, W, H } from "../lib/igPost.js";

const pref = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const keep = (k, v) => { try { localStorage.setItem(k, v); } catch { /* */ } };

export function Posts({ db, ix, comp: comp0, round: round0 }) {
  const comps = db.comps.filter((c) => c.season === db.seasons[0].id);
  const comp = ix.comp[comp0] ? comp0 : comps[0].id, C = ix.comp[comp];
  // zadano: sljedeće kolo ako ima neodigranih utakmica, inače zadnje odigrano
  const cur = currentRound(db, comp);
  const next = db.matches.some((m) => m.comp === comp && m.round === cur && m.status !== "finished") ? cur : Math.min(C.rounds || cur + 1, cur + 1);
  const round = +round0 || next;
  const [mode, setMode] = useState("auto");
  const [theme, setTheme0] = useState(() => pref("ig-theme", "dark"));
  const setTheme = (t) => { setTheme0(t); keep("ig-theme", t); };
  const [ready, setReady] = useState(false);
  useEffect(() => { loadFonts().then(() => setReady(true)); }, []);
  const post = useMemo(() => buildPost(db, ix, comp, round, mode), [db, ix, comp, round, mode]);
  const L = ix.league[C.league];
  const nav = (c, r) => replaceGo("admin", "objave", c, r);
  const fname = (i) => `${comp}-${post.res ? "rezultati" : "raspored"}-${round}${post.pages.length > 1 ? `-${i + 1}` : ""}.png`;
  return (
    <>
      <div className="ahead"><h1>Objave</h1></div>
      <section className="panel">
        <div className="toolbar" style={{ paddingTop: 14, flexWrap: "wrap", gap: 10 }}>
          <select className="select" aria-label="Natjecanje" value={comp} onChange={(e) => nav(e.target.value, "")}>
            {comps.map((c) => <option key={c.id} value={c.id}>{compName(ix, c.id)}</option>)}
          </select>
          <select className="select" aria-label="Kolo" value={round} onChange={(e) => nav(comp, e.target.value)}>
            {Array.from({ length: Math.max(C.rounds || 0, round) }, (_, i) => <option key={i} value={i + 1}>{roundName(L, i + 1)}</option>)}
          </select>
          <div className="seg" role="group" aria-label="Vrsta objave">
            {[["auto", "Automatski"], ["raspored", "Raspored"], ["rezultati", "Rezultati"]].map(([k, n]) =>
              <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)}>{n}</button>)}
          </div>
          <div className="seg" role="group" aria-label="Tema">
            {[["dark", "Tamna"], ["light", "Svijetla"]].map(([k, n]) => <button key={k} type="button" aria-pressed={theme === k} onClick={() => setTheme(k)}>{n}</button>)}
          </div>
        </div>
        <div className="pb small muted" style={{ paddingTop: 0 }}>
          Automatski: rezultati kad su sve utakmice kola odigrane, inače raspored (odigrane utakmice i u rasporedu pokazuju rezultat).
          {post.pages.length > 1 && ` Kolo ima više od 6 utakmica, pa je objava podijeljena na ${post.pages.length} slike (karusel).`}
        </div>
        <div className="pb" style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
          {ready ? post.pages.map((_, i) => <Page key={i} post={post} i={i} theme={theme} name={fname(i)} />) : <div className="muted">Učitavam fontove…</div>}
        </div>
        {post.pages.length > 1 && ready && (
          <div className="pb" style={{ paddingTop: 0 }}>
            <button className="btn primary" onClick={() => document.querySelectorAll(".igpost a.btn").forEach((a, k) => setTimeout(() => a.click(), k * 400))}>Preuzmi sve ({post.pages.length})</button>
          </div>)}
      </section>
    </>
  );
}

function Page({ post, i, theme, name }) {
  const ref = useRef(null), [url, setUrl] = useState("");
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    drawPage(cv.getContext("2d"), post, i, theme);
    let u = ""; cv.toBlob((b) => { if (!b) return; u = URL.createObjectURL(b); setUrl(u); }, "image/png");
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [post, i, theme]);
  return (
    <div className="igpost" style={{ display: "grid", gap: 8, width: 360 }}>
      <canvas ref={ref} width={W} height={H} style={{ width: 360, height: 450, border: "1px solid var(--line)" }} />
      <a className="btn" href={url || undefined} download={name} aria-disabled={!url}>Preuzmi PNG{post.pages.length > 1 ? ` (${i + 1}/${post.pages.length})` : ""}</a>
    </div>
  );
}
