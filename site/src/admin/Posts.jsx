// Admin -> Objave: Instagram/Facebook objava za odabrano kolo (raspored ili rezultati + tablica i strijelci),
// pregled, opis s hashtagovima, preuzimanje PNG-ova i objava jednim klikom (kad je Meta spojena).
import { useEffect, useMemo, useRef, useState } from "react";
import { replaceGo } from "../lib/router.js";
import { currentRound, compName, roundName } from "../lib/derive.js";
import { buildPost, drawPage, loadFonts, W, H } from "../lib/igPost.js";
import { publishSocial } from "../lib/store.js";

const pref = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const keep = (k, v) => { try { localStorage.setItem(k, v); } catch { /* */ } };
const KIND = { matches: "", table: "tablica", scorers: "strijelci" };

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
  const [cap, setCap] = useState(post.caption);
  useEffect(() => setCap(post.caption), [post.caption]);
  const blobs = useRef([]);
  const L = ix.league[C.league], n = post.slides.length;
  const nav = (c, r) => replaceGo("admin", "objave", c, r);
  const fname = (i) => `${comp}-${post.res ? "rezultati" : "raspored"}-${round}${KIND[post.slides[i].kind] ? "-" + KIND[post.slides[i].kind] : n > 1 ? `-${i + 1}` : ""}.png`;
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
            {[["auto", "Automatski"], ["raspored", "Raspored"], ["rezultati", "Rezultati"]].map(([k, t]) =>
              <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)}>{t}</button>)}
          </div>
          <div className="seg" role="group" aria-label="Tema">
            {[["dark", "Tamna"], ["light", "Svijetla"]].map(([k, t]) => <button key={k} type="button" aria-pressed={theme === k} onClick={() => setTheme(k)}>{t}</button>)}
          </div>
        </div>
        <div className="pb small muted" style={{ paddingTop: 0 }}>
          Automatski: rezultati kad su sve utakmice kola odigrane, inače raspored (odigrane utakmice i u rasporedu pokazuju rezultat).
          Uz rezultate idu i tablica nakon kola, a za seniore i strijelci. Kola s više od 6 utakmica dijele se na više slika.
          {n > 1 && ` Ova objava je karusel od ${n} slika.`}
        </div>
        <div className="pb" style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
          {ready ? post.slides.map((_, i) => <Page key={i} post={post} i={i} theme={theme} name={fname(i)} onBlob={(b) => { blobs.current[i] = b; }} />)
            : <div className="muted">Učitavam fontove…</div>}
        </div>
        {n > 1 && ready && (
          <div className="pb" style={{ paddingTop: 0 }}>
            <button className="btn" onClick={() => document.querySelectorAll(".igpost a.btn").forEach((a, k) => setTimeout(() => a.click(), k * 400))}>Preuzmi sve ({n})</button>
          </div>)}
      </section>
      <section className="panel">
        <div className="ph"><h2>Opis objave</h2><span className="aside">možeš ga urediti prije objave</span></div>
        <div className="pb" style={{ display: "grid", gap: 10 }}>
          <textarea className="input" rows={14} value={cap} onChange={(e) => setCap(e.target.value)} style={{ fontFamily: "var(--body)", lineHeight: 1.45 }} />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn" onClick={() => navigator.clipboard?.writeText(cap)}>Kopiraj opis</button>
            <button className="btn ghost" onClick={() => setCap(post.caption)}>Vrati predložak</button>
            <span className="small muted">{cap.length} / 2200 znakova · {(cap.match(/#\S+/g) || []).length} / 30 hashtagova</span>
          </div>
        </div>
      </section>
      <Publish key={`${comp}-${round}-${mode}-${theme}`} n={n} cap={cap} blobs={blobs} folder={`${comp}/${round}`} />
    </>
  );
}

function Page({ post, i, theme, name, onBlob }) {
  const ref = useRef(null), [url, setUrl] = useState("");
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    drawPage(cv.getContext("2d"), post, i, theme);
    let u = ""; cv.toBlob((b) => { if (!b) return; onBlob(b); u = URL.createObjectURL(b); setUrl(u); }, "image/png");
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [post, i, theme]);
  const k = post.slides[i].kind;
  return (
    <div className="igpost" style={{ display: "grid", gap: 8, width: 360 }}>
      <canvas ref={ref} width={W} height={H} style={{ width: 360, height: 450, border: "1px solid var(--line)" }} />
      <a className="btn" href={url || undefined} download={name} aria-disabled={!url}>Preuzmi PNG{post.slides.length > 1 ? ` (${i + 1}/${post.slides.length}${KIND[k] ? ", " + KIND[k] : ""})` : ""}</a>
    </div>
  );
}

// objava na Instagram i Facebook (preko Edge funkcije "objavi"); traži potvrdu prije slanja
function Publish({ n, cap, blobs, folder }) {
  const [t, setT] = useState({ ig: true, fb: true });
  const [ask, setAsk] = useState(false), [busy, setBusy] = useState(false), [msg, setMsg] = useState(null);
  const targets = Object.keys(t).filter((k) => t[k]);
  const where = targets.map((k) => (k === "ig" ? "Instagram" : "Facebook")).join(" i ");
  const go = async () => {
    setAsk(false); setBusy(true); setMsg(null);
    try {
      const b = blobs.current.slice(0, n); if (b.length < n || b.some((x) => !x)) throw new Error("Slike još nisu spremne, pričekaj sekundu.");
      const r = await publishSocial(b, cap, targets, folder);
      setMsg({ ok: true, text: `Objavljeno: ${Object.entries(r?.results || {}).map(([k, v]) => `${k === "ig" ? "Instagram" : "Facebook"} ${v.ok ? "✓" : "✗ " + v.error}`).join(", ") || "gotovo"}` });
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    setBusy(false);
  };
  return (
    <section className="panel">
      <div className="ph"><h2>Objava na mreže</h2><span className="aside">Instagram i Facebook stranica</span></div>
      <div className="pb" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {[["ig", "Instagram"], ["fb", "Facebook"]].map(([k, l]) => (
            <label key={k} className="small" style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={t[k]} onChange={(e) => setT({ ...t, [k]: e.target.checked })} />{l}</label>))}
        </div>
        {n > 10 && <div className="callout warn">Instagram karusel ima najviše 10 slika, a ova objava ima {n}.</div>}
        {!ask ? <div><button className="btn primary" disabled={busy || !targets.length || n > 10} onClick={() => setAsk(true)}>{busy ? "Objavljujem…" : `Objavi (${n} ${n === 1 ? "slika" : n < 5 ? "slike" : "slika"})`}</button></div>
          : <span className="confirm">Objaviti {n === 1 ? "sliku" : `${n} slika`} s ovim opisom na {where}?
            <button className="btn sm primary" onClick={go}>Objavi</button>
            <button className="btn sm ghost" onClick={() => setAsk(false)}>Odustani</button></span>}
        {msg && <div className={"callout" + (msg.ok ? "" : " warn")} role="status">{msg.text}</div>}
        <div className="small muted">Slike se spremaju u javni bucket „objave” (Instagram traži javni link), a objavljuje ih funkcija na serveru. Dok Meta nije spojena, gumb javlja da nedostaju postavke.</div>
      </div>
    </section>
  );
}
