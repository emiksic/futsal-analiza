import { Fragment, useState, useRef, useEffect } from "react";
import { href, go, replaceClick, setLeaveGuard } from "../lib/router.js";
import { update, uid, useStore, holdStart, holdDiscard, holdCommit, isHolding } from "../lib/store.js";
import { score, absSec, minute, playerName, compName, ANALYSIS_LABEL, withMatchNumbers } from "../lib/derive.js";
import { useAnalysis } from "../lib/analysis.js";
import { Jersey, Icon, Toast, NumInput, DateTimeInput } from "../components/ui.jsx";
import { ShotTagger } from "./ShotTagger.jsx";
import { GoalSketch } from "../components/GoalSketch.jsx";
import { Player, fmtVT } from "../components/Player.jsx";

// Video ispod skice gola: YouTube na trenutku gola (e.vt, s TV trake), da se vidi gdje su bili strijelac i dodavač.
function GoalVideo({ m, e, upd }) {
  const P = useRef(null);
  const setVt = (v) => upd((x) => { const q = x.events.find((z) => z.id === e.id); if (v == null) delete q.vt; else q.vt = Math.round(v * 10) / 10; });
  if (!m.youtube) return <div className="callout warn">Utakmica nema YouTube snimku, pa video nije moguć.</div>;
  const at = (d) => { if (e.vt == null) return; P.current?.seek(e.vt + d); P.current?.play(); };
  const nudge = (d) => { const t = P.current?.time(); if (t != null) { P.current.seek(t + d); P.current.pause(); } };
  return (
    <div style={{ width: "100%", maxWidth: 720 }}>
      <Player ref={P} key={e.id} youtube={m.youtube} start={e.vt != null ? e.vt - 6 : 0} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6, alignItems: "center" }}>
        <button className="btn sm" disabled={e.vt == null} onClick={() => at(-6)}>{Icon.play(12)} Akcija (−6 s)</button>
        <button className="btn sm ghost" disabled={e.vt == null} onClick={() => { P.current?.seek(e.vt); P.current?.pause(); }}>Trenutak gola</button>
        <button className="btn sm ghost" onClick={() => nudge(-1)}>−1 s</button>
        <button className="btn sm ghost" onClick={() => nudge(-0.2)}>−0,2 s</button>
        <button className="btn sm ghost" onClick={() => nudge(0.2)}>+0,2 s</button>
        <button className="btn sm ghost" onClick={() => nudge(1)}>+1 s</button>
        <button className="btn sm ghost" onClick={() => { const t = P.current?.time(); if (t != null) setVt(t); }}>Ovdje je gol</button>
        <span className="muted small">{e.vt != null ? `gol u snimci: ${fmtVT(e.vt)}` : "Vrijeme u snimci nije poznato: nađi gol i klikni „Ovdje je gol”."}</span>
      </div>
    </div>
  );
}

const toLocal = (iso) => { const d = new Date(iso), p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const MAX_ROSTER = 14;
// vrijeme gola: upisuju se samo znamenke, dvotočka ide sama ("0344" → "03:44", "512" → "5:12")
const fmtClock = (t) => { const d = t.replace(/\D/g, "").slice(0, 4); return d.length > 2 ? d.slice(0, -2) + ":" + d.slice(-2) : d; };
const fmtHms = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };
const parseHms = (t) => { if (!t.trim()) return null; const p = t.trim().split(":").map(Number); if (p.some(isNaN)) return null; return p.reduce((a, b) => a * 60 + b, 0); };

export function MatchEdit(props) {
  // svaka utakmica kreće iznova (zadano: upis bez slanja u bazu)
  return <MatchEditInner key={props.id} {...props} />;
}

// Dupli broj na dresu unutar jednog zapisnika (broj s ove utakmice) → [{ side, nums }]
const numsOf = (m, side, players) => { const R = m.roster?.[side]; return (R?.players || []).map((pid) => String(R.num?.[pid] ?? players.find((p) => p.id === pid)?.num ?? "")).filter(Boolean); };
export function rosterDups(m, players) {
  return ["home", "away"].map((side) => { const n = numsOf(m, side, players); return { side, nums: [...new Set(n.filter((x, i) => n.indexOf(x) !== i))] }; }).filter((d) => d.nums.length);
}

// Prekidač "Uživo": isključen = izmjene ostaju samo u ovom pregledniku dok se ne klikne "Spremi u bazu".
// Odlazak na drugu stranicu (ili zatvaranje kartice) s nespremljenim izmjenama pita za potvrdu i odbacuje ih.
function useHold(id) {
  const st = useStore();
  const [live, setLive] = useState(false);
  const remote = st.mode === "remote";
  useEffect(() => {
    if (!remote || live) return;
    holdStart(id);
    return () => holdDiscard();
  }, [id, live, remote]);
  useEffect(() => {
    const msg = () => `Upisano je ${st.held} ${st.held === 1 ? "izmjena koja nije spremljena" : "izmjena koje nisu spremljene"} u bazu. Ako odeš s ove stranice, sve će se izgubiti.\n\nNastaviti?`;
    const off = setLeaveGuard((r) => (r[0] === "admin" && r[1] === "utakmica" && r[2] === id) || !isHolding() || confirm(msg()));
    const unload = (e) => { if (isHolding()) { e.preventDefault(); e.returnValue = ""; } };
    addEventListener("beforeunload", unload);
    return () => { off(); removeEventListener("beforeunload", unload); };
  }, [id, st.held]);
  const toLive = async () => {
    if (st.held > 0 && h.dups?.length) { alert("Dva igrača u zapisniku imaju isti broj. Ispravi to prije spremanja u bazu."); return; }
    if (st.held > 0) {
      if (!confirm(`Spremiti ${st.held} neposlanih izmjena u bazu i nastaviti uživo?`)) return;
      try { await holdCommit(); } catch { return; }
    }
    setLive(true);
  };
  const h = { st, remote, live, toLive, toHold: () => setLive(false) };
  return h;
}

function LiveBar({ h, ix }) {
  const { st, live } = h;
  const bad = h.dups || [];
  const [busy, setBusy] = useState(false);
  if (!h.remote) return null;
  const save = async () => { setBusy(true); try { await holdCommit(true); } catch { /* poruka je u st.syncError */ } setBusy(false); };
  return (
    <section className={"panel livebar" + (live ? " on" : "")}>
      <label className="sw">
        <input type="checkbox" role="switch" checked={live} onChange={(e) => (e.target.checked ? h.toLive() : h.toHold())} />
        <span className="sw-t" aria-hidden="true" />
        <span><b>{live ? "Uživo" : "Nije uživo"}</b><small>{live ? "svaka izmjena odmah ide u bazu i na stranicu" : "izmjene su samo u ovom pregledniku"}</small></span>
      </label>
      {!live && (
        <div className="lb-r">
          <span className="small" role="status" style={{ color: st.sync === "error" ? "var(--live)" : undefined }}>
            {st.sync === "error" ? `Greška: ${st.syncError}` : st.held ? `${st.held} ${st.held === 1 ? "izmjena nije spremljena" : "izmjena nije spremljeno"}` : "Nema neposlanih izmjena"}</span>
          <button className="btn sm ghost" disabled={!st.held || busy} onClick={() => { if (confirm("Odbaciti sve neposlane izmjene?")) { holdDiscard(); h.toHold(); holdStart(h.id); } }}>Odbaci</button>
          {bad.length > 0 && <span className="pill bad">Isti broj ({bad.map((d) => `${ix.club[h.m[d.side]].name}: ${d.nums.join(", ")}`).join("; ")}) — ispravi prije spremanja</span>}
          <button className="btn sm primary" disabled={!st.held || busy || bad.length > 0} title={bad.length ? "Dva igrača u zapisniku imaju isti broj" : undefined} onClick={save}>{busy ? "Spremam…" : "Spremi u bazu"}</button>
        </div>)}
    </section>
  );
}

function MatchEditInner({ db, ix: ix0, id, tab = "osnovno" }) {
  const h = useHold(id); h.id = id;
  const m = ix0.match[id];
  if (!m) return <div className="panel empty">Utakmica ne postoji.</div>;
  const ix = withMatchNumbers(ix0, m);   // broj na dresu iz zapisnika ove utakmice
  h.m = m; h.dups = rosterDups(m, db.players);
  const upd = (fn) => update((d) => fn(d.matches.find((x) => x.id === id), d));
  const s = score(m);
  const TABS = [["osnovno", "Osnovno"], ["zapisnik", "Zapisnik"], ["dogadaji", "Događaji"], ["udarci", "Udarci"], ["analiza", "Video analiza"]];
  return (
    <>
      <a className="back" href={href("admin", "utakmice")}>Sve utakmice</a>
      <div className="ahead">
        <h1 style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Jersey kit={ix.club[m.home].kit} size={30} />{ix.club[m.home].name} {s ? `${s[0]}:${s[1]}` : "–"} {ix.club[m.away].name}<Jersey kit={ix.club[m.away].kit} size={30} />
        </h1>
        <div className="r">
          {m.draft ? (
            <>
              <button className="btn primary" disabled={h.dups.length > 0} title={h.dups.length ? "Dva igrača u zapisniku imaju isti broj" : undefined} onClick={async () => { upd((x) => { delete x.draft; }); try { await holdCommit(); } catch { return; } go("admin", "utakmice"); }}>Dodaj utakmicu</button>
              <button className="btn" onClick={() => { holdDiscard(); update((d) => { d.matches = d.matches.filter((x) => x.id !== id); }); go("admin", "utakmice"); }}>Odustani</button>
            </>
          ) : (
            <>
              <a className="btn" href={href("utakmica", m.id)}>Javna stranica {Icon.ext()}</a>
              <DeleteMatch onDelete={() => { holdDiscard(); update((d) => { d.matches = d.matches.filter((x) => x.id !== id); }); go("admin", "utakmice"); }} />
            </>
          )}
        </div>
      </div>
      <LiveBar h={h} ix={ix} />
      <section className="panel" key={h.st.holdRev}>
        <nav className="tabs" aria-label="Uređivanje">
          {TABS.map(([k, n]) => <a key={k} href={href("admin", "utakmica", id, k)} onClick={replaceClick} aria-current={tab === k ? "page" : undefined}>{n}</a>)}
        </nav>
        <div style={{ height: 14 }} />
        {tab === "osnovno" && <Basic db={db} ix={ix} m={m} upd={upd} />}
        {tab === "zapisnik" && <Roster db={db} ix={ix} m={m} upd={upd} />}
        {tab === "dogadaji" && <Events ix={ix} m={m} upd={upd} />}
        {tab === "analiza" && <Analysis ix={ix} m={m} upd={upd} />}
        {tab === "udarci" && <ShotTagger ix={ix} m={m} upd={upd} />}
      </section>
    </>
  );
}

function DeleteMatch({ onDelete }) {
  const [ask, setAsk] = useState(false);
  if (!ask) return <button className="btn danger" onClick={() => setAsk(true)}>{Icon.trash()} Obriši utakmicu</button>;
  return (
    <span className="confirm">Obrisati utakmicu sa svim događajima?
      <button className="btn sm danger" onClick={onDelete}>Obriši</button>
      <button className="btn sm ghost" onClick={() => setAsk(false)}>Odustani</button>
    </span>);
}

// Ručni rezultat: polja se čuvaju kao tekst; spremi se tek kad su oba broja upisana, a kad su oba prazna, rezultat se briše.
function ResultField({ m, upd }) {
  const [v, setV] = useState([m.result?.[0] ?? "", m.result?.[1] ?? ""].map(String));
  const change = (k, raw) => {
    const n = [...v]; n[k] = raw.replace(/\D/g, "").slice(0, 2); setV(n);
    if (n[0] === "" && n[1] === "") upd((x) => { delete x.result; });
    else if (n[0] !== "" && n[1] !== "") upd((x) => { x.result = [+n[0], +n[1]]; });
  };
  const clear = () => { setV(["", ""]); upd((x) => { delete x.result; if (x.status === "finished" && !x.events.some((e) => e.type === "goal" || e.type === "owngoal")) x.status = "scheduled"; }); };
  return (
    <div className="field"><span>Rezultat (ručno)</span>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input className="input num" inputMode="numeric" value={v[0]} aria-label="Golovi domaćina" onChange={(e) => change(0, e.target.value)} />
        <b>:</b>
        <input className="input num" inputMode="numeric" value={v[1]} aria-label="Golovi gosta" onChange={(e) => change(1, e.target.value)} />
        {(m.result || v[0] !== "" || v[1] !== "") && <button className="btn sm ghost" onClick={clear}>Obriši rezultat</button>}
      </div>
      <small>Ako je upisan, vrijedi ovaj rezultat. Inače se računa iz golova pod Događaji. „Obriši rezultat” vraća utakmicu bez rezultata (i na „Zakazano” ako nema golova).</small></div>
  );
}

function Basic({ db, ix, m, upd }) {
  const C = ix.comp[m.comp];
  return (
    <div className="form-grid">
      <label className="field"><span>Natjecanje</span>
        <select className="input" value={m.comp} onChange={(e) => upd((x) => { x.comp = e.target.value; })}>
          {db.comps.map((c) => <option key={c.id} value={c.id}>{compName(ix, c.id)}</option>)}
        </select></label>
      <label className="field"><span>Kolo</span>
        <NumInput className="input" value={m.round} empty={m.round || 1} onChange={(v) => upd((x) => { x.round = Math.max(1, v); })} /></label>
      <div className="field"><span>Datum i vrijeme</span>
        <DateTimeInput value={toLocal(m.date)} onChange={(v) => upd((x) => { x.date = new Date(v).toISOString(); delete x.timeTbd; })} />
        <label className="small" style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={!!m.timeTbd} onChange={(e) => upd((x) => { if (e.target.checked) x.timeTbd = true; else delete x.timeTbd; })} />
          Termin još nije objavljen (na stranici piše vikend pet – ned)</label></div>
      <label className="field"><span>Status</span>
        <select className="input" value={m.status} onChange={(e) => upd((x) => { x.status = e.target.value; })}>
          <option value="scheduled">Zakazano</option><option value="finished">Odigrano</option>
        </select></label>
      <label className="field"><span>Domaćin</span>
        <select className="input" value={m.home} onChange={(e) => upd((x) => { x.home = e.target.value; x.hall = ix.club[e.target.value].hall; x.roster.home = null; })}>
          {C.teams.map((t) => <option key={t} value={t}>{ix.club[t].name}</option>)}
        </select></label>
      <label className="field"><span>Gost</span>
        <select className="input" value={m.away} onChange={(e) => upd((x) => { x.away = e.target.value; x.roster.away = null; })}>
          {C.teams.map((t) => <option key={t} value={t}>{ix.club[t].name}</option>)}
        </select></label>
      <label className="field"><span>Dvorana</span>
        <select className="input" value={m.hall} onChange={(e) => upd((x) => { x.hall = e.target.value; })}>
          {db.halls.map((h) => <option key={h.id} value={h.id}>{h.name}, {h.city}</option>)}
        </select></label>
      <ResultField key={m.id} m={m} upd={upd} />

      <div className="field wide"><span>Prijenos</span>
        <div className="seg">
          {[["yt", "YouTube"], ["max", "MAXsport"], ["none", "Nema"]].map(([k, n]) => {
            const cur = m.tv === "MAXsport" ? "max" : (m.youtube || m.tv === "YouTube") ? "yt" : "none";
            return <button type="button" key={k} aria-pressed={cur === k}
              onClick={() => upd((x) => { if (k === "yt") x.tv = "YouTube"; if (k === "max") { x.youtube = ""; x.tv = "MAXsport"; } if (k === "none") { x.youtube = ""; delete x.tv; } })}>{n}</button>;
          })}
        </div>
        {(m.youtube || m.tv === "YouTube") && <input className="input" type="url" placeholder="https://www.youtube.com/watch?v=…" value={m.youtube || ""} onChange={(e) => upd((x) => { x.youtube = e.target.value.trim(); })} />}
        {m.tv === "YouTube" && !m.youtube && <div className="callout warn">Nema linka. Dodaj link prijenosa, ili prebaci na MAXsport ako se utakmica ne prenosi na YouTubeu.</div>}
        <small>{m.tv === "MAXsport" ? "TV prijenos: na stranici piše gdje se gleda, bez videa i analize." : "Iz YouTube linka se prikazuje snimka i preuzima video za analizu."}</small></div>
      <label className="field wide"><span>Službeni sažetak (YouTube link)</span>
        <input className="input" type="url" placeholder="https://www.youtube.com/watch?v=…" value={m.highlights || ""} onChange={(e) => upd((x) => { const v = e.target.value.trim(); if (v) x.highlights = v; else delete x.highlights; })} />
        {m.highlights && !/^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//.test(m.highlights) && <small style={{ color: "var(--live)" }}>To nije YouTube link, na stranici se neće prikazati.</small>}
        <small>Ako postoji, na utakmici se pojavi kartica „Sažetak”. Korisno i za utakmice s TV prijenosom.</small></label>
      <div className="wide small muted">Promjene se spremaju odmah.</div>
    </div>
  );
}

function Roster({ db, ix, m, upd }) {
  const C = ix.comp[m.comp], cat = ix.league[C.league].category;
  return (
    <div className="rost">
      {["home", "away"].map((side) => <RosterCol key={side} db={db} ix={ix} m={m} upd={upd} side={side} season={C.season} cat={cat} />)}
    </div>
  );
}

// Broj na dresu pamti se po utakmici (roster[side].num = {igrač: broj}), pa promjena u novom kolu ne mijenja stare utakmice.
// Igračev glavni broj (players.num, za nove zapisnike i popis kluba) mijenja se samo ako je ovo njegova najnovija utakmica.
function RosterCol({ db, ix, m, upd, side, season, cat }) {
  const club = ix.club[m[side]];
  const [nn, setNn] = useState(""); const [nm, setNm] = useState("");
  const [q, setQ] = useState(""); const [del, setDel] = useState(null);
  const r = m.roster[side] || { players: [], start: [], gk: [] };
  const base = (pid) => db.players.find((p) => p.id === pid);
  const numOf = (p) => r.num?.[p.id] ?? p.num;
  const squad = db.players.filter((p) => p.club === club.id && p.season === season && p.cat === cat).sort((a, b) => numOf(a) - numOf(b));
  const on = new Set(r.players), st = new Set(r.start), gk = new Set(r.gk);
  const fix = (R) => { R.num = Object.fromEntries(R.players.map((pid) => [pid, R.num?.[pid] ?? base(pid)?.num ?? ""])); };
  const ed = (fn) => upd((x) => { x.roster[side] ||= { players: [], start: [], gk: [] }; fn(x.roster[side], x); fix(x.roster[side]); });
  const takenBy = (num, except) => r.players.filter((pid) => pid !== except).map((pid) => db.players.find((p) => p.id === pid)).find((p) => p && String(r.num?.[p.id] ?? p.num) === String(num));
  const okNum = (num, except) => { const t = takenBy(num, except); return !t || confirm(`Broj ${num} u ovom zapisniku već ima ${t.name || "drugi igrač"}. Dva igrača ne smiju imati isti broj, pa spremanje neće biti moguće dok to ne ispraviš.\n\nDodati svejedno?`); };
  const togglePlayer = (p) => { if (!on.has(p.id) && !okNum(numOf(p), p.id)) return; ed((R) => {
    if (R.players.includes(p.id)) { R.players = R.players.filter((i) => i !== p.id); R.start = R.start.filter((i) => i !== p.id); R.gk = R.gk.filter((i) => i !== p.id); if (R.cap === p.id) delete R.cap; }
    else if (R.players.length < MAX_ROSTER) { R.players.push(p.id); if (p.gk) R.gk.push(p.id); if (R.start.length < 5) R.start.push(p.id); }   // prvih 5 dodanih = početna petorka
  }); };
  const toggleCap = (p) => ed((R) => { if (R.cap === p.id) delete R.cap; else R.cap = p.id; });   // jedan kapetan po ekipi, po utakmici
  const toggle = (key, p) => ed((R) => { if (R[key].includes(p.id)) R[key] = R[key].filter((i) => i !== p.id); else if (key !== "start" || R.start.length < 5) R[key].push(p.id); });
  const setPlayer = (pid, fn) => update((d) => fn(d.players.find((p) => p.id === pid)));
  const latest = (pid) => !db.matches.some((q) => q.id !== m.id && q.date > m.date && ["home", "away"].some((sd) => q.roster?.[sd]?.players?.includes(pid)));
  const setNum = (p, raw) => {
    const n = raw.replace(/\D/g, "").slice(0, 2);
    update((d) => {
      const x = d.matches.find((q) => q.id === m.id);
      if (on.has(p.id)) { x.roster[side].num ||= {}; x.roster[side].num[p.id] = n; }
      if (!on.has(p.id) || latest(p.id)) d.players.find((q) => q.id === p.id).num = n;
    });
  };
  const addPlayer = () => {
    const num = nn.trim(); if (!num || !okNum(num)) return;
    const id = uid(`${club.id}-`);
    update((d) => { d.players.push({ id, club: club.id, season, cat, num, name: nm.trim(), gk: false });
      const x = d.matches.find((q) => q.id === m.id); x.roster[side] ||= { players: [], start: [], gk: [] };
      const R = x.roster[side];
      if (R.players.length < MAX_ROSTER) { R.players.push(id); R.num = { ...(R.num || {}), [id]: num }; if (R.start.length < 5) R.start.push(id); } });
    setNn(""); setNm(""); setQ("");
  };
  const copyPrev = () => {
    const prev = db.matches.filter((q) => q.id !== m.id && q.comp === m.comp && q.date < m.date && (q.home === club.id || q.away === club.id))
      .sort((a, b) => b.date.localeCompare(a.date)).find((q) => q.roster[q.home === club.id ? "home" : "away"]?.players?.length);
    if (!prev) return;
    const src = prev.roster[prev.home === club.id ? "home" : "away"];
    ed((R) => { R.players = [...src.players]; R.start = [...src.start]; R.gk = [...src.gk]; R.num = {}; if (src.cap) R.cap = src.cap; else delete R.cap; });   // brojevi: igračev sadašnji
  };
  // pretraga: po imenu (bez obzira na kvačice i velika slova) ili broju
  const norm = (t) => (t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
  const terms = norm(q).trim().split(/\s+/).filter(Boolean);
  const shown = terms.length ? squad.filter((p) => terms.every((t) => norm(p.name).includes(t) || String(numOf(p)) === t)) : squad;
  // brisanje igrača: miče ga iz svih zapisnika; nije dopušteno ako ima gol, asistenciju, karton ili udarac na nekoj utakmici
  const usedIn = (pid) => db.matches.filter((x) => JSON.stringify({ ...x, roster: null }).includes(`"${pid}"`));
  const inRosters = (pid) => db.matches.filter((x) => ["home", "away"].some((sd) => x.roster?.[sd]?.players?.includes(pid))).length;
  const removePlayer = (pid) => {
    update((d) => {
      d.players = d.players.filter((p) => p.id !== pid);
      for (const x of d.matches) for (const sd of ["home", "away"]) {
        const R = x.roster?.[sd]; if (!R?.players?.includes(pid)) continue;
        R.players = R.players.filter((i) => i !== pid); R.start = (R.start || []).filter((i) => i !== pid); R.gk = (R.gk || []).filter((i) => i !== pid); if (R.cap === pid) delete R.cap;
        if (R.num) delete R.num[pid];
      }
    });
    setDel(null);
  };
  const gkStart = r.start.filter((p) => gk.has(p)).length;
  const ok5 = r.start.length === 5, okGk = gkStart === 1;
  const dup = rosterDups(m, db.players).find((d) => d.side === side)?.nums || [];
  return (
    <div className="rcol">
      <div className="rcol-h">
        <Jersey kit={club.kit} size={26} /><b>{club.name}</b>
        <span className="cnt">
          <span className={"pill " + (r.players.length ? "ok" : "")}>{r.players.length}/{MAX_ROSTER} u zapisniku</span>
          <span className={"pill " + (ok5 ? "ok" : r.start.length ? "bad" : "")}>{r.start.length}/5 početna</span>
          {r.players.length > 0 && !r.cap && <span className="pill warn">nema kapetana</span>}
          {r.start.length > 0 && <span className={"pill " + (okGk ? "ok" : "bad")}>{okGk ? "golman u petorci" : "petorka bez jednog golmana"}</span>}
          {dup.length > 0 && <span className="pill bad">isti broj: {[...new Set(dup)].join(", ")}</span>}
        </span>
      </div>
      <div className="toolbar" style={{ padding: "8px 12px", borderBottom: "1px solid var(--line)" }}>
        <button className="btn sm" onClick={copyPrev}>Kopiraj s prošle utakmice</button>
        <button className="btn sm ghost" onClick={() => ed((R) => { R.players = squad.slice(0, MAX_ROSTER).map((p) => p.id); R.gk = squad.filter((p) => p.gk).map((p) => p.id).filter((i) => R.players.includes(i)); })}>Označi sve</button>
        <button className="btn sm ghost" onClick={() => ed((R) => { R.players = []; R.start = []; R.gk = []; delete R.cap; })}>Očisti</button>
      </div>
      <div className="rsearch">
        <input className="input sm" type="search" value={q} placeholder="Traži igrača (ime ili broj)…" aria-label={`Traži igrača: ${club.name}`}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQ("");
            if (e.key === "Enter" && shown.length === 1) { e.preventDefault(); if (!on.has(shown[0].id)) togglePlayer(shown[0]); setQ(""); }
          }} />
        {terms.length > 0 && <span className="small muted">{shown.length === 1 ? "Enter dodaje u zapisnik" : `${shown.length} igrača`}</span>}
      </div>
      {shown.length === 0 && <div className="rline-empty small muted">Nema igrača „{q}”. Dodaj ga ispod.</div>}
      {shown.map((p) => {
        const inR = on.has(p.id);
        if (del === p.id) {
          const used = usedIn(p.id), nR = inRosters(p.id);
          return (
            <div key={p.id} className="rline rdel" role="alertdialog" aria-label="Brisanje igrača">
              {used.length ? (
                <><span>Igrač <b>#{numOf(p)} {p.name || ""}</b> ima golove, kartone ili udarce na {used.length} {used.length === 1 ? "utakmici" : "utakmica"}, pa se ne može obrisati. Makni ga iz tih događaja prvo.</span>
                  <button className="btn sm" onClick={() => setDel(null)}>U redu</button></>
              ) : (
                <><span><b>Jesi li siguran?</b> Igrač <b>#{numOf(p)} {p.name || "(bez imena)"}</b> briše se iz kluba{nR ? ` i iz ${nR} ${nR === 1 ? "zapisnika" : "zapisnika"}` : ""}. Ovo se ne može vratiti.</span>
                  <span className="rdel-b"><button className="btn sm danger" onClick={() => removePlayer(p.id)}>{Icon.trash()} Obriši</button>
                    <button className="btn sm ghost" autoFocus onClick={() => setDel(null)}>Odustani</button></span></>
              )}
            </div>);
        }
        return (
          <div key={p.id} className={"rline" + (inR ? "" : " off") + (inR && dup.includes(String(numOf(p))) ? " dupn" : "")} title={inR && dup.includes(String(numOf(p))) ? `Broj ${numOf(p)} ima više igrača u ovom zapisniku` : undefined}>
            <input type="checkbox" className="check" checked={inR} onChange={() => togglePlayer(p)} aria-label={`U zapisniku: broj ${p.num}`} />
            <input className="input sm num" value={numOf(p)} onChange={(e) => setNum(p, e.target.value)} aria-label="Broj na dresu" title={inR && r.num?.[p.id] != null && r.num[p.id] !== p.num ? `Na ovoj utakmici #${r.num[p.id]}, sada nosi #${p.num}` : undefined} />
            <input className="input sm" value={p.name} placeholder="Ime i prezime" onChange={(e) => setPlayer(p.id, (q) => { q.name = e.target.value; })} aria-label={`Ime igrača s brojem ${p.num}`} />
            <button className="tgl" aria-pressed={st.has(p.id)} disabled={!inR || (!st.has(p.id) && r.start.length >= 5)} onClick={() => toggle("start", p)} title="Početna petorka">5</button>
            <button className="tgl gk" aria-pressed={gk.has(p.id)} disabled={!inR} onClick={() => toggle("gk", p)} title="Golman">GK</button>
            <button className="tgl cap" aria-pressed={r.cap === p.id} disabled={!inR} onClick={() => toggleCap(p)} title="Kapetan">K</button>
            <button className="rdel-x" onClick={() => setDel(p.id)} title="Obriši igrača" aria-label={`Obriši igrača ${p.name || "#" + numOf(p)}`}>{Icon.trash()}</button>
          </div>);
      })}
      <form className="addp" onSubmit={(e) => { e.preventDefault(); addPlayer(); }}>
        <input className="input sm num" value={nn} onChange={(e) => setNn(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="#" aria-label="Broj novog igrača" />
        <input className="input sm" value={nm} onChange={(e) => setNm(e.target.value)} placeholder="Ime novog igrača (može i kasnije)" aria-label="Ime novog igrača" />
        <button className="btn sm" type="submit" disabled={!nn}>{Icon.plus(14)} Dodaj</button>
      </form>
    </div>
  );
}

const ETYPES = [["goal", "Gol"], ["owngoal", "Autogol"], ["penmiss", "Promašen penal"], ["foul", "Prekršaj"], ["yellow", "Žuti"], ["red", "Crveni"], ["timeout", "Time-out"]];
function Events({ ix, m, upd }) {
  const empty = { type: "goal", side: "home", period: 1, time: "", player: "", assist: "", pen: false, dist: "" };
  const [f, setF] = useState(empty);
  const [editing, setEditing] = useState(null);   // id događaja koji se uređuje
  const [sketch, setSketch] = useState(null);     // id gola čija se skica crta
  const set = (k, v) => setF((o) => ({ ...o, [k]: v, ...(k === "side" || k === "type" ? { player: "", assist: "" } : {}) }));
  const roster = (side) => (m.roster[side]?.players || []).map((p) => ix.player[p]).filter(Boolean).sort((a, b) => a.num - b.num);
  // vrijeme se upisuje kao ukupno vrijeme utakmice (22:10 = 2. poluvrijeme, 2:10), poluvrijeme se određuje samo:
  // do 20:00 prvo, do 40:00 drugo, do 50:00 produžeci
  const parse = (t) => {
    const mm = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(t.trim()); if (!mm || +(mm[2] || 0) > 59) return null;
    const tot = +mm[1] * 60 + (+mm[2] || 0); if (tot > 3000) return null;
    const period = tot <= 1200 ? 1 : tot <= 2400 ? 2 : 3;
    return { period, sec: tot - (period - 1) * 1200 };
  };
  const pt = parse(f.time), sec = pt?.sec ?? null;
  // upisane sekunde (npr. 22:10) → vrijeme je točno i prikazuje se s mm:ss; samo minuta (npr. 22) → prikaz minute
  const exactF = () => (/:\d/.test(f.time) ? { exact: true } : {});
  const needsPlayer = !["timeout"].includes(f.type);
  // kazneni udarac: gol iz penala (pen) ili promašen penal; udaljenost 6 m ili 10 m (deseterac) nije obavezna
  const penFields = () => (f.type === "penmiss" || (f.type === "goal" && f.pen) ? { ...(f.type === "goal" ? { pen: true } : {}), ...(f.dist ? { dist: +f.dist } : {}) } : {});
  const add = () => {
    if (sec == null) return;
    const side = f.type === "owngoal" ? other(f.side) : f.side;   // autogol: f.side = ekipa kojoj se pripisuje
    if (editing) {
      upd((x) => { x.events = x.events.map((q) => q.id !== editing ? q : { ...Object.fromEntries(Object.entries(q).filter(([k]) => !["player", "assist", "exact", "pen", "dist"].includes(k))),
        type: f.type, side, period: pt?.period, sec, ...(needsPlayer && f.player ? { player: f.player } : {}), ...(f.type === "goal" && !f.pen && f.assist ? { assist: f.assist } : {}), ...penFields(), ...exactF() }); });
      setEditing(null); setF((o) => ({ ...empty, side: o.side })); return;   // nakon upisa uvijek natrag na Gol
    }
    upd((x) => { x.events.push({ id: uid("e"), type: f.type, side, period: pt?.period, sec, ...(needsPlayer && f.player ? { player: f.player } : {}), ...(f.type === "goal" && !f.pen && f.assist ? { assist: f.assist } : {}), ...penFields(), ...exactF() });
      if (f.type === "goal" || f.type === "owngoal") x.status = x.status === "scheduled" ? "finished" : x.status; });
    setF((o) => ({ ...empty, side: o.side }));   // nakon upisa vrsta se vraća na Gol (da prekršaj ne ostane odabran)
  };
  // najnovije gore; u istoj minuti/sekundi ono upisano kasnije ide iznad (redoslijed upisa = redoslijed u utakmici)
  const order = new Map(m.events.map((e, i) => [e.id, i]));
  const evs = m.events.filter((e) => e.type !== "shot").sort((a, b) => absSec(b) - absSec(a) || order.get(b.id) - order.get(a.id));
  const edit = (e) => {
    setEditing(e.id);
    setF({ type: e.type, side: e.type === "owngoal" ? (e.side === "home" ? "away" : "home") : e.side, period: e.period,
      // točno vrijeme (exact) kao mm:ss; inače samo minuta (37:30 sa Semafora → "38"), da uređivanje ne izmisli sekunde
      time: (() => { const t = (e.period - 1) * 1200 + e.sec; return e.exact ? `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}` : String(parseInt(minute(e), 10)); })(), player: e.player || "", assist: e.assist || "", pen: !!e.pen, dist: e.dist ? String(e.dist) : "" });
    document.querySelector(".evform")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const setPlayer = (id, pid) => upd((x) => { x.events = x.events.map((q) => q.id !== id ? q : (pid ? { ...q, player: pid } : Object.fromEntries(Object.entries(q).filter(([k]) => k !== "player")))); });
  const other = (s) => (s === "home" ? "away" : "home");
  const plSide = f.type === "owngoal" ? other(f.side) : f.side;
  const pl = roster(plSide);
  const L = Object.fromEntries(ETYPES);
  return (
    <>
      <form className="evform" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <div className="field" style={{ gridColumn: "1 / -1" }}><span>Vrsta</span>
          <div className="seg">{ETYPES.map(([k, n]) => <button type="button" key={k} aria-pressed={f.type === k} onClick={() => set("type", k)}>{n}</button>)}</div></div>
        <div className="field"><span>{f.type === "owngoal" ? "Gol se pripisuje" : "Ekipa"}</span>
          <div className="seg">{["home", "away"].map((s) => <button type="button" key={s} aria-pressed={f.side === s} onClick={() => set("side", s)}>{ix.club[m[s]].short}</button>)}</div></div>
        <label className="field"><span>Minuta utakmice (mm:ss)</span>
          <input className="input" value={f.time} onChange={(e) => set("time", fmtClock(e.target.value))} placeholder="12:34" inputMode="numeric" aria-invalid={f.time && sec == null} />
          <small>{f.time && sec == null ? "Upiši vrijeme do 50:00 (sekunde 00–59)." : pt ? ["", "1. poluvrijeme", "2. poluvrijeme", "produžeci"][pt.period] : "npr. 2210 = 22:10, 2. poluvrijeme"}</small></label>
        {needsPlayer && <label className="field"><span>{f.type === "owngoal" ? `Zabio u svoju mrežu (${ix.club[m[plSide]].short})` : "Igrač"}</span>
          <select className="input" value={f.player} onChange={(e) => set("player", e.target.value)}>
            <option value="">—</option>{pl.map((p) => <option key={p.id} value={p.id}>{p.num} {p.name}</option>)}
          </select></label>}
        {f.type === "goal" && !f.pen && <label className="field"><span>Asistencija</span>
          <select className="input" value={f.assist} onChange={(e) => set("assist", e.target.value)}>
            <option value="">—</option>{pl.filter((p) => p.id !== f.player).map((p) => <option key={p.id} value={p.id}>{p.num} {p.name}</option>)}
          </select></label>}
        <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
          <button className="btn primary" type="submit" disabled={sec == null}>{editing ? "Spremi izmjene" : "Dodaj događaj"}</button>
          {editing && <button className="btn ghost" type="button" onClick={() => { setEditing(null); setF(empty); }}>Odustani</button>}
        </div>
        {(f.type === "penmiss" || f.type === "goal") && <div className="field" style={{ gridColumn: "1 / -1" }}><span>Kazneni udarac</span>
          <div className="seg">
            {f.type === "goal" && <button type="button" aria-pressed={!f.pen} onClick={() => setF((o) => ({ ...o, pen: false, dist: "" }))}>Ne</button>}
            {[["", f.type === "goal" ? "Da" : "Nepoznato"], ["6", "6 m"], ["10", "10 m"]].map(([k, n]) => (
              <button type="button" key={k} aria-pressed={(f.type === "penmiss" || f.pen) && f.dist === k} onClick={() => setF((o) => ({ ...o, pen: true, dist: k }))}>{n}</button>))}
          </div></div>}
      </form>
      {!pl.length && needsPlayer && <div className="pb"><div className="callout warn">Zapisnik za {ix.club[m[plSide]].name} nije unesen, pa igrača nije moguće odabrati.</div></div>}
      <EventTimeline ix={ix} m={m} evs={evs} order={order} roster={roster} editing={editing} edit={edit} setPlayer={setPlayer}
        sketch={sketch} setSketch={setSketch} upd={upd}
        onDelete={(e) => { if (editing === e.id) { setEditing(null); setF(empty); } upd((x) => { x.events = x.events.filter((q) => q.id !== e.id); }); }} />
    </>
  );
}

function Analysis({ ix, m, upd }) {
  const a = m.analysis || { status: "none" };
  const A = useAnalysis(m);
  const [toast, setToast] = useState("");
  const flash = (t) => { setToast(t); setTimeout(() => setToast(""), 1800); };
  const H = ix.club[m.home], Aw = ix.club[m.away];
  const ua = (fn) => upd((x) => { x.analysis ||= { status: "none" }; fn(x.analysis); });
  const team = (side) => {
    const r = m.roster[side]; const c = ix.club[m[side]];
    const nums = (ids) => (ids || []).map((p) => ix.player[p]?.num).filter(Boolean);
    return { name: c.name, players: nums(r?.players), gk: nums(r?.gk), start: nums(r?.start), kit: c.kit.shirt, number: c.kit.num };
  };
  const cfg = { match: m.id, youtube: m.youtube || null, hall: m.hall, competition: m.comp, round: m.round,
    roster: { [H.short]: team("home"), [Aw.short]: team("away") } };
  const json = JSON.stringify(cfg, null, 2);
  const copy = async () => { try { await navigator.clipboard.writeText(json); flash("Kopirano"); } catch { flash("Kopiranje nije dopušteno, označi tekst ručno"); } };
  const detected = A.D ? A.D.teams.slice(0, 2) : null;
  return (
    <div className="form-grid">
      <label className="field"><span>Status analize</span>
        <select className="input" value={a.status} onChange={(e) => ua((x) => { x.status = e.target.value; })}>
          {Object.entries(ANALYSIS_LABEL).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
        {a.error && <small style={{ color: "var(--danger, #e5484d)" }}>Zadnja obrada: {a.error}</small>}</label>
      <div className="field"><span>Red za obradu</span>
        <button className="btn primary" disabled={!m.youtube || a.status === "queued" || a.status === "processing"} onClick={() => ua((x) => { x.status = "queued"; })}>
          {Icon.video()} Stavi u red</button>
        <small>{m.youtube ? "Obrada kreće kad na računalu pokreneš python red.py." : "Prvo dodaj link snimke pod Osnovno."}</small></div>
      <div className="field wide"><span>Prava na video</span>
        <div className="seg">
          <button type="button" aria-pressed={(a.rights || "embed") === "embed"} onClick={() => ua((x) => { x.rights = "embed"; })}>Samo YouTube embed</button>
          <button type="button" aria-pressed={a.rights === "overlay"} onClick={() => ua((x) => { x.rights = "overlay"; })}>Imamo pisanu dozvolu</button>
        </div>
        <small>{a.rights === "overlay" ? "Prikazuje se vlastiti video s ucrtanim oznakama. Zapiši tko je dao dozvolu i kada." : "Javno se prikazuje originalni YouTube player, a analiza je u panelu i na mini-mapi pored njega. Ovo ne traži dozvolu."}</small>
        {a.rights === "overlay" && <input className="input" value={a.rightsNote || ""} placeholder="npr. Dozvola: MNK Rijeka, mail 30. 10. 2026." onChange={(e) => ua((x) => { x.rightsNote = e.target.value; })} />}
      </div>
      <label className="field"><span>Početak analize na YouTubeu (mm:ss ili h:mm:ss)</span>
        <input className="input" defaultValue={a.ytOffset == null ? "" : fmtHms(a.ytOffset)} placeholder="npr. 12:40"
          onBlur={(e) => { const v = parseHms(e.target.value); ua((x) => { x.ytOffset = v; }); }} />
        <small>Trenutak u YouTube snimci koji odgovara početku analiziranog videa. analyze.py ga upisuje sam kad video preuzme s YouTubea.</small></label>
      <label className="field"><span>Video za preglednik</span>
        <input className="input" value={a.video || ""} placeholder="https://video.…/utakmica.mp4" onChange={(e) => ua((x) => { x.video = e.target.value.trim(); })} />
        <small>Samo uz dozvolu: čisti video s vlastitog hostinga (npr. Cloudflare R2).</small></label>
      <label className="field"><span>Podaci analize</span>
        <input className="input" value={a.data || ""} placeholder="https://…/analiza.json" onChange={(e) => ua((x) => { x.data = e.target.value.trim(); })} /></label>
      <div className="field wide"><span>Koja je ekipa koja boja</span>
        {detected ? (
          <div className="kitpick">
            {["home", "away"].map((side) => {
              const code = Object.entries(a.teamMap || {}).find(([, v]) => v === side)?.[0];
              const t = detected.find((x) => x.name === code);
              return <span key={side} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 22, height: 22, borderRadius: 5, background: t?.color || "var(--line)", boxShadow: "inset 0 0 0 1px rgba(0,0,0,.25)" }} />
                <b>{ix.club[m[side]].name}</b><span className="muted small">({side === "home" ? "domaćin" : "gost"})</span></span>;
            })}
            <button className="btn sm" onClick={() => ua((x) => { const tm = x.teamMap || {}; x.teamMap = Object.fromEntries(Object.entries(tm).map(([k, v]) => [k, v === "home" ? "away" : "home"])); x.kitUnconfirmed = false; })}>
              {Icon.swap()} Zamijeni</button>
            {a.kitUnconfirmed ? <button className="btn sm primary" onClick={() => ua((x) => { x.kitUnconfirmed = false; })}>Potvrdi</button> : <span className="pill done">potvrđeno</span>}
          </div>) : <small>Boje se pojave kad analiza prepozna dresove.</small>}
      </div>
      <div className="field wide"><span>Postavke za analyze.py</span>
        <pre className="code" tabIndex={0}>{json}</pre>
        <div><button className="btn sm" onClick={copy}>Kopiraj</button></div>
        <small>Dok nema zajedničke baze, ovo se sprema kao JSON uz video. Kasnije ga skripta sama povlači.</small></div>
      <Toast msg={toast} />
    </div>
  );
}

// Popis događaja kao na javnoj stranici: domaći lijevo, gosti desno, minuta u sredini, najnovije gore.
// Uz gol stanje rezultata, uz prekršaj redni broj u poluvremenu (od 5. upozorenje za udarac s 10 m).
function EventTimeline({ ix, m, evs, order, roster, editing, edit, setPlayer, sketch, setSketch, upd, onDelete }) {
  const [ask, setAsk] = useState(null);           // id događaja za koji se traži potvrda brisanja
  const [showFouls, setShowFouls] = useState(true);
  // kronološki prolaz: stanje nakon svakog gola, redni broj prekršaja po ekipi i poluvremenu
  const info = {}, sc = [0, 0], fc = {}, perEnd = {};
  for (const e of [...evs].sort((a, b) => absSec(a) - absSec(b) || order.get(a.id) - order.get(b.id))) {
    if (e.type === "goal") sc[e.side === "home" ? 0 : 1]++;
    if (e.type === "owngoal") sc[e.side === "home" ? 1 : 0]++;
    if (e.type === "goal" || e.type === "owngoal") info[e.id] = { sc: [...sc] };
    if (e.type === "foul") { const k = e.side + e.period; fc[k] = (fc[k] || 0) + 1; info[e.id] = { foulN: fc[k] }; }
    perEnd[e.period] = [...sc];
  }
  const club = (side) => ix.club[m[side]];
  const pl = (id) => ix.player[id];
  const who = (p) => p ? <><b className="pnum">{p.num}</b> {p.name || "(bez imena)"}</> : null;
  const shown = showFouls ? evs : evs.filter((e) => e.type !== "foul");
  const periods = [...new Set(shown.map((e) => e.period))];
  const PER = { 1: "1. poluvrijeme", 2: "2. poluvrijeme", 3: "Produžeci" };
  const cnt = (side, per) => fc[side + per] || 0;
  if (!evs.length) return <div className="empty">Još nema događaja.</div>;
  return (
    <div className="etl">
      <div className="etl-bar">
        <span className="small muted">{shown.length} događaja{!showFouls && evs.length !== shown.length ? ` (${evs.length - shown.length} prekršaja skriveno)` : ""}</span>
        <label className="small" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" className="check" checked={showFouls} onChange={(e) => setShowFouls(e.target.checked)} />prikaži prekršaje</label>
      </div>
      <div className="etl-head"><span><Jersey kit={club("home").kit} size={20} />{club("home").name}</span><span /><span>{club("away").name}<Jersey kit={club("away").kit} size={20} /></span></div>
      {periods.map((per) => (
        <Fragment key={per}>
          <div className="etl-per">
            <span className={cnt("home", per) >= 5 ? "fl hot" : "fl"} title="Akumulirani prekršaji domaćina">{cnt("home", per)} prek.</span>
            <span>{PER[per] || `${per}. dio`}{perEnd[per] && <b> {perEnd[per][0]}:{perEnd[per][1]}</b>}</span>
            <span className={cnt("away", per) >= 5 ? "fl hot" : "fl"} title="Akumulirani prekršaji gosta">{cnt("away", per)} prek.</span>
          </div>
          {shown.filter((e) => e.period === per).map((e) => {
            const side = e.type === "owngoal" ? (e.side === "home" ? "away" : "home") : e.side;   // autogol stoji kod ekipe kojoj se pripisuje
            const p = pl(e.player), I = info[e.id] || {};
            let icon, main, sub = null;
            if (e.type === "goal" || e.type === "owngoal") {
              icon = Icon.ball(18);
              main = <>{who(p) || <span className="muted">igrač nije upisan</span>} <b className="esc">({I.sc[0]}:{I.sc[1]})</b></>;
              sub = e.type === "owngoal" ? `autogol, ${club(e.side).short} u svoju mrežu` : e.pen ? `kazneni udarac${e.dist ? ` s ${e.dist} m` : ""}` : e.assist ? <>asist. {who(pl(e.assist))}</> : null;
            } else if (e.type === "yellow") { icon = <span className="card-y" />; main = who(p) || (e.staff ? "Stožer" : <span className="muted">igrač nije upisan</span>); sub = "žuti karton"; }
            else if (e.type === "red") { icon = <span className="card-r" />; main = who(p) || (e.staff ? "Stožer" : <span className="muted">igrač nije upisan</span>); sub = e.secondYellow ? "drugi žuti" : "crveni karton"; }
            else if (e.type === "penmiss") { icon = <span className="so-miss">✕</span>; main = who(p) || <span className="muted">igrač nije upisan</span>; sub = `promašen kazneni udarac${e.dist ? ` s ${e.dist} m` : ""}`; }
            else if (e.type === "foul") { icon = Icon.whistle(16); main = <span className={I.foulN >= 5 ? "hot" : ""}>{I.foulN}. prekršaj</span>; sub = I.foulN >= 5 ? "sljedeći donosi udarac s 10 m" : null; }
            else if (e.type === "timeout") { icon = Icon.timeout(16); main = "Time-out"; }
            const needsP = ["goal", "owngoal", "yellow", "red", "penmiss"].includes(e.type) && !e.player && !e.staff;
            const card = (
              <div className={`etl-ev ${side} t-${e.type}` + (editing === e.id ? " editing" : "")}>
                <span className="ico">{icon}</span>
                <span className="txt">
                  <span className="main">{main}</span>
                  {sub && <small>{sub}</small>}
                  {needsP && <select className="input sm" value="" onChange={(ev) => setPlayer(e.id, ev.target.value)} aria-label="Odaberi igrača">
                    <option value="">odaberi igrača…</option>{roster(e.side).map((q) => <option key={q.id} value={q.id}>{q.num} {q.name}</option>)}</select>}
                  {ask === e.id ? (
                    <span className="acts confirm">Obrisati? <button className="btn sm danger" onClick={() => { onDelete(e); setAsk(null); }}>Obriši</button>
                      <button className="btn sm ghost" autoFocus onClick={() => setAsk(null)}>Ne</button></span>
                  ) : (
                    <span className="acts">
                      <button className="lnk" onClick={() => edit(e)} aria-pressed={editing === e.id}>Uredi</button>
                      {e.type === "goal" && <button className="lnk" onClick={() => setSketch(sketch === e.id ? null : e.id)} aria-pressed={sketch === e.id}>Skica{e.map ? " ✓" : ""}</button>}
                      <button className="lnk danger" onClick={() => setAsk(e.id)} aria-label="Obriši događaj">Obriši</button>
                    </span>)}
                </span>
              </div>);
            return (
              <Fragment key={e.id}>
                <div className={"etl-row" + (e.type === "foul" ? " minor" : "")}>
                  {side === "home" ? card : <span />}
                  <span className="min">{minute(e)}<small>{(() => { const t = absSec(e); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; })()}</small></span>
                  {side === "away" ? card : <span />}
                </div>
                {sketch === e.id && (
                  <div className="etl-sketch">
                    <GoalSketch map={e.map} color={e.side === "home" ? "var(--primary)" : "var(--signal)"} onChange={(mp) => upd((x) => { const q = x.events.find((z) => z.id === e.id); q.map = mp; })} />
                    <div className="muted small" style={{ maxWidth: 260 }}>Ekipa uvijek napada <b>desni</b> gol: ako na videu napada ulijevo, klikni zrcalno. Prvi klik: gdje je strijelac pucao. Drugi klik (neobavezno): gdje je bio dodavač. Treći klik kreće ispočetka.
                      {e.map?.auto && <div style={{ marginTop: 6 }}>Skica je automatska. Kad je promijeniš, postaje ručna i analiza je više ne mijenja.</div>}
                      <div style={{ marginTop: 8 }}><button className="btn sm ghost" onClick={() => upd((x) => { delete x.events.find((z) => z.id === e.id).map; })}>Obriši skicu</button></div></div>
                    <GoalVideo m={m} e={e} upd={upd} />
                  </div>)}
              </Fragment>);
          })}
        </Fragment>))}
    </div>
  );
}
