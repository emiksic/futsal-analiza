// #/objave (samo admin): Instagram/Facebook objava za odabrano kolo (raspored ili rezultati + tablica i strijelci),
// pregled, opis s hashtagovima, preuzimanje PNG-ova i objava jednim klikom (kad je Meta spojena).
import { useEffect, useMemo, useRef, useState } from "react";
import { replaceGo, href } from "../lib/router.js";
import { currentRound, compName, roundName } from "../lib/derive.js";
import { buildPost, drawPage, loadFonts, W, H, FACTS, FACTS_DEFAULT, FACTS_MAX_ROWS } from "../lib/igPost.js";
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
  // odabrane brojke kola (redoslijed = redoslijed na slici); pamti se u ovom pregledniku
  const [fk, setFk0] = useState(() => { try { const v = JSON.parse(localStorage.getItem("ig-facts")); return Array.isArray(v) ? v : FACTS_DEFAULT; } catch { return FACTS_DEFAULT; } });
  const setFk = (v) => { setFk0(v); keep("ig-facts", JSON.stringify(v)); };
  const post = useMemo(() => buildPost(db, ix, comp, round, mode, fk), [db, ix, comp, round, mode, fk]);
  const [cap, setCap] = useState(post.caption);
  useEffect(() => setCap(post.caption), [post.caption]);
  const blobs = useRef([]);
  const [urls, setUrls] = useState([]);
  const L = ix.league[C.league], n = post.slides.length;
  const nav = (c, r) => replaceGo("objave", c, r);
  const fname = (i) => `${comp}-${post.res ? "rezultati" : "raspored"}-${round}${KIND[post.slides[i].kind] ? "-" + KIND[post.slides[i].kind] : n > 1 ? `-${i + 1}` : ""}.png`;
  const onBlob = (i, b, u) => { blobs.current[i] = b; setUrls((x) => { const y = [...x]; y[i] = u; return y; }); };
  return (
    <div className="posts-page">
      <div className="posts-main">
        <div className="ahead"><h1>Objave</h1><div className="r"><a className="btn" href={href("admin")}>Natrag u admin</a></div></div>
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
            Automatski: rezultati kad su sve utakmice kola odigrane, inače raspored. Uz rezultate idu brojke kola, tablica, a za seniore i strijelci.
            {n > 1 && ` Ova objava je karusel od ${n} slika.`}
          </div>
          <div className="pb igstrip">
            {ready ? post.slides.map((_, i) => <Page key={i} post={post} i={i} theme={theme} name={fname(i)} onBlob={onBlob} />)
              : <div className="muted">Učitavam fontove…</div>}
          </div>
          {n > 1 && ready && (
            <div className="pb" style={{ paddingTop: 0 }}>
              <button className="btn" onClick={() => document.querySelectorAll(".igpost a.btn").forEach((a, k) => setTimeout(() => a.click(), k * 400))}>Preuzmi sve ({n})</button>
            </div>)}
        </section>
        {post.res && post.factsAll && <FactPicker all={post.factsAll} keys={fk} setKeys={setFk} />}
        <section className="panel">
          <div className="ph"><h2>Opis objave</h2><span className="aside">pregled desno se mijenja dok pišeš</span></div>
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
      </div>
      <aside className="posts-side"><Preview urls={urls.slice(0, n)} cap={cap} /></aside>
    </div>
  );
}

function Page({ post, i, theme, name, onBlob }) {
  const ref = useRef(null), [url, setUrl] = useState("");
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    drawPage(cv.getContext("2d"), post, i, theme);
    let u = "", alive = true;
    cv.toBlob((b) => { if (!b || !alive) return; u = URL.createObjectURL(b); setUrl(u); onBlob(i, b, u); }, "image/png");
    return () => { alive = false; if (u) setTimeout(() => URL.revokeObjectURL(u), 1000); };
  }, [post, i, theme]);
  const k = post.slides[i].kind;
  return (
    <div className="igpost">
      <canvas ref={ref} width={W} height={H} />
      <a className="btn sm" href={url || undefined} download={name} aria-disabled={!url}>PNG{post.slides.length > 1 ? ` ${i + 1}/${post.slides.length}${KIND[k] ? " · " + KIND[k] : ""}` : ""}</a>
    </div>
  );
}

// ---------- pregled kako će objava izgledati (Instagram / Facebook), samo za admina ----------
const AVATAR = "hmnl-avatar.png";
const rich = (t) => t.split(/(#[\p{L}\p{N}_]+)/u).map((x, i) => (x.startsWith("#") ? <span key={i} className="tag">{x}</span> : x));
const Ico = {
  heart: <path d="M12 20.5s-7.5-4.6-9.2-9.3C1.6 7.7 3.9 4.5 7.3 4.5c2 0 3.6 1.1 4.7 2.7 1.1-1.6 2.7-2.7 4.7-2.7 3.4 0 5.7 3.2 4.5 6.7-1.7 4.7-9.2 9.3-9.2 9.3Z" />,
  comment: <path d="M20.5 11.6a8.4 8.4 0 0 1-12.3 7.4L3.5 20.5l1.5-4.6a8.4 8.4 0 1 1 15.5-4.3Z" />,
  share: <><path d="M21.5 3.5 10 14" /><path d="M21.5 3.5 14.5 20.5 10 14 3.5 9.5Z" /></>,
  save: <path d="M19 21.5 12 16l-7 5.5V3.5h14Z" />,
};
const Svg = ({ k }) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">{Ico[k]}</svg>;

function Preview({ urls, cap }) {
  const [net, setNet0] = useState(() => pref("pv-net", "ig"));
  const setNet = (v) => { setNet0(v); keep("pv-net", v); };
  const [dark, setDark0] = useState(() => pref("pv-dark", "1") === "1");
  const setDark = (v) => { setDark0(v); keep("pv-dark", v ? "1" : "0"); };
  return (
    <div className="pv">
      <div className="pv-bar">
        <div className="seg" role="group" aria-label="Mreža">
          {[["ig", "Instagram"], ["fb", "Facebook"]].map(([k, t]) => <button key={k} type="button" aria-pressed={net === k} onClick={() => setNet(k)}>{t}</button>)}
        </div>
        <button className="btn sm ghost" onClick={() => setDark(!dark)}>{dark ? "Svijetli" : "Tamni"} prikaz</button>
      </div>
      <div className={"phone " + (dark ? "pdark" : "plight")}>
        {net === "ig" ? <IgPost urls={urls} cap={cap} /> : <FbPost urls={urls} cap={cap} />}
      </div>
      <div className="small muted" style={{ textAlign: "center" }}>Pregled je približan; aplikacije se razlikuju po uređaju.</div>
    </div>
  );
}

function IgPost({ urls, cap }) {
  const [i, setI] = useState(0), [more, setMore] = useState(false), ref = useRef(null);
  useEffect(() => { setI(0); ref.current?.scrollTo({ left: 0 }); }, [urls.length]);
  const go = (k) => { const el = ref.current; if (!el) return; el.scrollTo({ left: k * el.clientWidth, behavior: "smooth" }); };
  const n = urls.length;
  const short = cap.split("\n")[0].slice(0, 90);
  return (
    <div className="ig">
      <div className="ig-head"><img src={AVATAR} alt="" /><b>hmnl.hr</b><span className="dots">•••</span></div>
      <div className="ig-media">
        <div className="ig-track" ref={ref} onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
          {urls.map((u, k) => (u ? <img key={k} src={u} alt={`Slika ${k + 1}`} /> : <div key={k} className="ig-ph" />))}
        </div>
        {n > 1 && <span className="ig-count">{i + 1}/{n}</span>}
        {n > 1 && i > 0 && <button className="ig-nav l" aria-label="Prethodna" onClick={() => go(i - 1)}>‹</button>}
        {n > 1 && i < n - 1 && <button className="ig-nav r" aria-label="Sljedeća" onClick={() => go(i + 1)}>›</button>}
      </div>
      <div className="ig-actions">
        <Svg k="heart" /><Svg k="comment" /><Svg k="share" />
        <span className="ig-dots">{n > 1 && urls.map((_, k) => <i key={k} className={k === i ? "on" : ""} />)}</span>
        <Svg k="save" />
      </div>
      <div className="ig-cap">
        <b>hmnl.hr</b>{" "}
        {more ? <span className="pre">{rich(cap)}</span> : <>{rich(short)}{cap.length > short.length && <button className="more" onClick={() => setMore(true)}>… više</button>}</>}
      </div>
      <div className="ig-time">Upravo sada</div>
    </div>
  );
}

function FbPost({ urls, cap }) {
  const [more, setMore] = useState(false);
  const n = urls.length, cut = cap.length > 240 && !more;
  const grid = n <= 1 ? "g1" : n === 2 ? "g2" : n === 3 ? "g3" : "g4";
  return (
    <div className="fb">
      <div className="fb-head"><img src={AVATAR} alt="" /><div><b>HMNL Statistika</b><small>Upravo sada · 🌐</small></div><span className="dots">•••</span></div>
      <div className="fb-text pre">{rich(cut ? cap.slice(0, 220).trimEnd() : cap)}{cut && <button className="more" onClick={() => setMore(true)}>… Prikaži više</button>}</div>
      <div className={"fb-grid " + grid}>
        {urls.slice(0, 4).map((u, k) => (
          <div key={k} className="cell">{u && <img src={u} alt={`Slika ${k + 1}`} />}{k === 3 && n > 4 && <span className="plus">+{n - 4}</span>}</div>))}
      </div>
      <div className="fb-actions"><span>👍 Sviđa mi se</span><span>💬 Komentiraj</span><span>↗ Podijeli</span></div>
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

// odabir brojki kola: uključi/isključi i redoslijed; prikazuje što bi pisalo za ovo kolo
function FactPicker({ all, keys, setKeys }) {
  const rows = keys.reduce((a, k) => a + (all[k]?.length || 0), 0);
  const move = (k, d) => { const i = keys.indexOf(k), j = i + d; if (j < 0 || j >= keys.length) return; const n = [...keys]; [n[i], n[j]] = [n[j], n[i]]; setKeys(n); };
  const line = (r) => [r.a ? `${r.a.name} – ${r.b.name}` : r.text, r.value, r.note].filter(Boolean).join(" · ");
  const order = [...keys.filter((k) => FACTS.some((f) => f[0] === k)), ...FACTS.map((f) => f[0]).filter((k) => !keys.includes(k))];
  return (
    <section className="panel">
      <div className="ph"><h2>Brojke kola</h2><span className="aside" style={{ color: rows > FACTS_MAX_ROWS ? "var(--live)" : undefined }}>
        {rows} / {FACTS_MAX_ROWS} redaka{rows > FACTS_MAX_ROWS ? ", višak se ne prikazuje" : ""}</span></div>
      <div className="pb" style={{ display: "grid", gap: 6, paddingTop: 0 }}>
        <div className="small muted">Uključi brojke koje želiš na slici. Izjednačene (npr. dvije jednako velike pobjede) zauzimaju više redaka. Odabir se pamti za sljedeća kola.</div>
        {order.map((k) => {
          const on = keys.includes(k), r = all[k], name = FACTS.find((f) => f[0] === k)[1];
          return (
            <div key={k} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "6px 0", borderTop: "1px solid var(--line)", opacity: r ? 1 : 0.5 }}>
              <input type="checkbox" checked={on} disabled={!r && !on} aria-label={name} style={{ marginTop: 3 }}
                onChange={(e) => setKeys(e.target.checked ? [...keys, k] : keys.filter((x) => x !== k))} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontWeight: 600 }}>{name}</b>{r && r.length > 1 && <span className="small muted"> · {r.length} izjednačena</span>}
                <div className="small muted">{r ? r.map(line).join(" | ") : "nema podataka za ovo kolo"}</div>
              </div>
              {on && <span style={{ display: "flex", gap: 4 }}>
                <button className="btn sm ghost" aria-label="Gore" onClick={() => move(k, -1)}>↑</button>
                <button className="btn sm ghost" aria-label="Dolje" onClick={() => move(k, 1)}>↓</button></span>}
            </div>);
        })}
        <div><button className="btn sm ghost" onClick={() => setKeys(FACTS_DEFAULT)}>Vrati zadano</button></div>
      </div>
    </section>
  );
}
