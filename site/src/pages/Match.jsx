import { Fragment, useEffect, useRef, useState } from "react";
import { safeYouTube } from "../lib/safe.js";
import { href, replaceClick } from "../lib/router.js";
import { score, absSec, minute, fmtDay, fmtTime, playerName, fouls, perPlayerAllowed, withMatchNumbers, suspensions, goalTime, flow, comeback, sideScore, roundName, winner, shootout, leadTime, mins, shortName, dayLabel } from "../lib/derive.js";
import { useAnalysis, teamOrder, analysisStats, heatPoints, teamHeatPoints } from "../lib/analysis.js";
import { AnalysisViewer } from "../components/AnalysisViewer.jsx";
import { GoalSketch } from "../components/GoalSketch.jsx";
import { Jersey, Icon, CourtLines } from "../components/ui.jsx";
import { MiniTable } from "../components/Side.jsx";
import { Shots } from "./Shots.jsx";
import { Player } from "../components/Player.jsx";

export function Match({ db, ix: ix0, id, tab }) {
  const m = ix0.match[id];
  const ix = m ? withMatchNumbers(ix0, m) : ix0;   // broj na dresu iz zapisnika ove utakmice
  const A = useAnalysis(m);
  if (!m) return <div className="page"><div className="panel empty">Utakmica ne postoji.</div></div>;
  const has = m.analysis?.status === "done";
  const hl = safeYouTube(m.highlights);
  // Video (prijenos + mini-mapa) je glavna kartica samo dok je utakmica uživo; poslije sažetak, ako postoji, inače detalji.
  const live = m.status === "live" && !!m.youtube;
  const t = tab || (live ? "analiza" : hl ? "sazetak" : "detalji");
  const vid = (has || m.youtube) ? [["analiza", live ? "Uživo" : "Video"]] : [];
  const TABS = [...(live ? vid : []), ...(hl ? [["sazetak", "Sažetak"]] : []), ["detalji", "Detalji"], ["statistika", "Statistika"], ["postave", "Postave"], ["udarci", "Udarci"], ...(live ? [] : vid)];
  return (
    <div className="page">
      <Board m={m} ix={ix} />
      <div className={t === "analiza" || t === "udarci" ? "" : "split"}>
      <section className="panel">
        <nav className="tabs" aria-label="Utakmica">
          {TABS.map(([k, n]) => <a key={k} href={href("utakmica", m.id, k)} onClick={replaceClick} aria-current={t === k ? "page" : undefined}>{n}</a>)}
        </nav>
        {t !== "analiza" && <div style={{ height: 6 }} />}
        {t === "analiza" && <AnalysisTab m={m} ix={ix} A={A} />}
        {t === "sazetak" && hl && <div className="pb" style={{ paddingTop: 16, display: "grid", gap: 10, maxWidth: 980 }}><Player youtube={hl} /><div className="note">Službeni sažetak utakmice.</div></div>}
        {t === "detalji" && <Incidents m={m} ix={ix} />}
        {t === "statistika" && <Stats m={m} ix={ix} A={A} />}
        {t === "udarci" && <Shots m={m} ix={ix} />}
        {t === "postave" && <Suspended db={db} m={m} ix={ix} />}
        {t === "postave" && <Lineups m={m} ix={ix} A={A} />}
      </section>
      {t !== "analiza" && t !== "udarci" && <aside className="col"><MiniTable db={db} ix={ix} comp={m.comp} mark={[m.home, m.away]} /></aside>}
      </div>
    </div>
  );
}

function Board({ m, ix }) {
  const H = ix.club[m.home], A = ix.club[m.away], s = score(m), comp = ix.comp[m.comp], L = ix.league[comp.league];
  const ht = m.status === "finished" ? score(m, 1199) : null;
  const goals = (side) => m.events.filter((e) => (e.type === "goal" && e.side === side) || (e.type === "owngoal" && e.side !== side))
    .sort((a, b) => absSec(a) - absSec(b));
  const w = winner(m), lostH = w === -1, lostA = w === 1;
  const fin = m.status === "finished", so = fin && shootout(m);
  const fp = [1, 2].map((p) => [fouls(m, "home", p), fouls(m, "away", p)]);
  return (
    <section className="board" aria-label="Rezultat">
      <div className="board-top">
        <a href={href("liga", comp.league, comp.season, "rezultati", m.round)}>{L.name}{m.round ? `, ${roundName(L, m.round)}` : ", isječak"}</a>
        {!m.extra && <span>{m.timeTbd ? dayLabel(m) : `${fmtDay(m.date)} u ${fmtTime(m.date)}`}</span>}
        <span>{ix.hall[m.hall]?.name}, {ix.hall[m.hall]?.city}</span>
        {safeYouTube(m.youtube) ? <a className="r" href={safeYouTube(m.youtube)} target="_blank" rel="noreferrer" style={{ display: "inline-flex", gap: 6, alignItems: "center", color: "var(--band-fg)" }}>
          Prijenos na YouTubeu {Icon.ext()}</a>
          : m.tv ? <span className="r">Prijenos: {m.tv}</span> : null}
      </div>
      <div className="board-main">
        <a className="bteam" href={href("klub", H.id)}><Jersey kit={H.kit} size={58} /><b>{H.name}</b></a>
        <div className="bscore">
          {s ? <div className="digits"><span className={lostH ? "lost" : ""}>{s[0]}</span><span className="sep">:</span><span className={lostA ? "lost" : ""}>{s[1]}</span></div>
            : <div className="bkick">{m.timeTbd ? "–:–" : fmtTime(m.date)}</div>}
          <div className="bstate">{fin ? `Kraj${ht ? `, poluvrijeme ${ht[0]}:${ht[1]}` : ""}` : m.timeTbd ? "Satnica još nije objavljena" : "Zakazano"}</div>
          {so && <div className="bstate" style={{ marginTop: 6 }}>Kazneni udarci {so[0]}:{so[1]}</div>}
        </div>
        <a className="bteam" href={href("klub", A.id)}><Jersey kit={A.kit} size={58} /><b>{A.name}</b></a>
      </div>
      {fin && (goals("home").length || goals("away").length) ? (
        <div className="board-goals">
          {["home", "away"].map((side) => (
            <div key={side}>{goals(side).map((e) => <span key={e.id} title={playerName(ix.player[e.player])}>{shortName(ix.player[e.player])}{e.type === "owngoal" ? " (ag)" : ""} {goalTime(e)}</span>)}</div>
          ))}
        </div>) : null}
      {fin && m.events.some((e) => e.type === "foul") && (
        <div className="board-fouls" title="Akumulirani prekršaji po poluvremenu. Od 6. prekršaja u poluvremenu izvodi se kazneni udarac s 10 m.">
          {fp.map((f, i) => <Fragment key={i}><FoulBar n={f[0]} /><span>Akumulirani prekršaji<br />{i + 1}. poluvrijeme</span><FoulBar n={f[1]} /></Fragment>)}
        </div>)}
    </section>
  );
}
function FoulBar({ n }) {
  return <span className="fbar" aria-label={`${n} prekršaja`}>{[1, 2, 3, 4, 5].map((i) => <i key={i} className={(i <= n ? "on" : "") + (n >= 5 ? " max" : "")} />)}<b style={{ marginLeft: 6, color: "var(--band-fg)" }}>{n}</b></span>;
}

// samo snimka (bez analize) uz kratku napomenu
function PlainVideo({ m, children }) {
  return (
    <div className="pb" style={{ paddingTop: 16, display: "grid", gap: 10, maxWidth: 980 }}>
      <Player youtube={m.youtube} />
      {children}
    </div>);
}

function AnalysisTab({ m, ix, A }) {
  const a = m.analysis;
  if (!a || a.status === "none") {
    if (m.youtube) return <PlainVideo m={m}><div className="note">Video analiza (igrači na terenu, posjed, mini-mapa) za ovu utakmicu još nije napravljena.</div></PlainVideo>;
    return <div className="empty" style={{ padding: 24 }}>
      {m.tv === "YouTube" ? "Utakmica se prenosi na YouTubeu. Snimka će ovdje biti dostupna kad se doda link."
        : m.tv ? `Utakmica se prenosila na ${m.tv}. Snimku i video analizu imamo samo za utakmice s javnim prijenosom na YouTubeu.` : "Za ovu utakmicu nema snimke."}</div>;
  }
  if (a.status === "queued" || a.status === "processing") return (
    <div className="pb" style={{ paddingTop: 16, display: "grid", gap: 12 }}>
      {m.youtube && <div style={{ maxWidth: 980 }}><Player youtube={m.youtube} /></div>}
      <div className="callout"><span className="an-dot processing">{Icon.video(14)}</span>
        <div><b>{a.status === "queued" ? "Utakmica čeka obradu." : "Analiza je u tijeku."}</b>
          <div className="muted small">Video se obrađuje noću. Kad obrada završi, ovdje se pojavljuju video s oznakama, postava na terenu, posjed i mini-mapa.</div>
          {a.status === "processing" && <div className="prog-bar" style={{ maxWidth: 280 }}><i style={{ width: `${Math.round((a.progress || 0) * 100)}%` }} /></div>}
        </div></div>
    </div>);
  if (a.status === "failed") return <div className="empty">Obrada nije uspjela. Pokreni je ponovno iz admina.</div>;
  if (A.error) return <div className="empty">Podaci analize se nisu učitali. Osvježi stranicu.</div>;
  if (!A.D) return <div className="empty">Učitavam analizu…</div>;
  const order = teamOrder(A.D, m);
  const mode = a.rights === "overlay" && a.video ? "overlay" : "embed";
  return (
    <div className="pb" style={{ paddingTop: 16, display: "grid", gap: 12 }}>
      {mode === "embed" && a.ytOffset == null && <div className="callout warn">Analiza još nije vremenski usklađena s YouTube snimkom, pa panel može kasniti ili žuriti. Uskladi je u adminu.</div>}
      {mode === "overlay" && a.rightsNote && <div className="callout warn">{a.rightsNote}</div>}
      <AnalysisViewer D={A.D} video={a.video} order={order} names={[ix.club[m.home].short, ix.club[m.away].short]} note={a.note} youtube={m.youtube}
        mode={mode} ytOffset={a.ytOffset || 0} />
    </div>
  );
}

function Incidents({ m, ix }) {
  const [sk, setSk] = useState(null);           // gol čija je skica otvorena
  useEffect(() => { if (!sk) return; const k = (ev) => ev.key === "Escape" && setSk(null); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [sk]);
  const cbGoal = comeback(m)?.goal;
  if (m.status !== "finished" && !m.events.length) return <div className="empty">Utakmica još nije odigrana.</div>;
  const order = new Map(m.events.map((e, i) => [e.id, i]));   // isto vrijeme → redoslijed upisa
  const evs = m.events.filter((e) => e.type !== "shot").sort((a, b) => absSec(a) - absSec(b) || order.get(a.id) - order.get(b.id));
  const cnt = { home: {}, away: {} }, sc = [0, 0], so = [0, 0], kick = { home: 0, away: 0 }, rows = [];
  const PER = { 3: "Produžeci", 4: "Kazneni udarci" };
  let per = 0;
  for (const e of evs) {
    if (e.period !== per) {
      if (per) rows.push({ k: "p" + per + "end", head: per === 1 ? "Poluvrijeme" : "Kraj regularnog dijela", sc: [...sc] });
      per = e.period; rows.push({ k: "p" + per, head: PER[per] || `${per}. poluvrijeme` });
    }
    if (e.type === "foul") {
      const c = cnt[e.side][e.period] = (cnt[e.side][e.period] || 0) + 1;
      if (c >= 5) rows.push({ k: e.id, e, foulN: c });
      continue;
    }
    if (e.type === "so") {   // kazneni udarci nakon utakmice
      if (e.scored) so[e.side === "home" ? 0 : 1]++;
      rows.push({ k: e.id, e, sc: [...so], kick: ++kick[e.side] });
      continue;
    }
    if (e.type === "goal") sc[e.side === "home" ? 0 : 1]++;
    if (e.type === "owngoal") sc[e.side === "home" ? 1 : 0]++;
    rows.push({ k: e.id, e, sc: [...sc] });
  }
  if (per) rows.push({ k: "end", head: per === 4 ? "Kraj, kazneni udarci" : "Kraj", sc: per === 4 ? [...so] : [...sc] });
  return (
    <>
    <ScoreFlow m={m} ix={ix} />
    <LeadShare m={m} ix={ix} />
    {sk && <div className="gs-modal" onClick={() => setSk(null)} role="dialog" aria-modal="true" aria-label="Kako je pao gol">
      <div className="gs-box" onClick={(ev) => ev.stopPropagation()}>
        <div className="gs-head"><b>{playerName(ix.player[sk.player]) || "Gol"} · {goalTime(sk)}</b>
          <button type="button" className="btn sm ghost" onClick={() => setSk(null)} aria-label="Zatvori">✕</button></div>
        <GoalSketch map={sk.map} width={420} color={sk.side === "home" ? "var(--primary)" : "var(--signal)"} />
        <div className="muted small" style={{ marginTop: 6 }}>{sk.map.a ? "Dodavanje (isprekidano) i udarac (žuto). " : "Udarac (žuto). "}Klikni teren za ponavljanje.{sk.map.auto ? " Položaji su iz video analize." : ""}</div>
      </div></div>}
    <div className="inc">
      {rows.map((r) => {
        if (r.head) return <div key={r.k} className="per">{r.head}{r.sc && <b>{r.sc[0]}:{r.sc[1]}</b>}</div>;
        const e = r.e, p = ix.player[e.player], as = ix.player[e.assist];
        let icon, main, sub;
        if (e.type === "goal" || e.type === "owngoal") { icon = Icon.ball(20); main = <>{playerName(p)}{e.id === cbGoal && <span className="cbtag">preokret</span>}</>; sub = e.type === "owngoal" ? "autogol" : e.pen ? `kazneni udarac${e.dist ? ` s ${e.dist} m` : ""}` : as ? `asistencija: ${playerName(as)}` : ""; }
        else if (e.type === "yellow") { icon = <span className="card-y" />; main = e.staff && !p ? "Stožer" : playerName(p); sub = "žuti karton"; }
        else if (e.type === "red") { icon = <span className="card-r" />; main = e.staff && !p ? "Stožer" : playerName(p); sub = e.secondYellow ? "drugi žuti karton" : "crveni karton"; }
        else if (e.type === "timeout") { icon = Icon.timeout(); main = "Time-out"; sub = ix.club[m[e.side]].name; }
        else if (e.type === "so") { icon = e.scored ? Icon.ball(20) : <span className="so-miss" aria-hidden="true">✕</span>; main = playerName(p); sub = e.scored ? "pogođen kazneni udarac" : "promašen kazneni udarac"; }
        else if (e.type === "penmiss") { icon = <span className="so-miss" aria-hidden="true">✕</span>; main = playerName(p); sub = `promašen kazneni udarac${e.dist ? ` s ${e.dist} m` : ""}`; }
        else if (e.type === "foul") { icon = Icon.whistle(); main = `${r.foulN}. akumulirani prekršaj`; sub = r.foulN >= 6 ? "kazneni udarac s 10 m" : "sljedeći prekršaj donosi udarac s 10 m"; }
        const body = (
          <div className={"ev " + e.side}>
            <span className="ico">{icon}</span>
            <span className="txt">{main}{sub && <small>{sub}</small>}</span>
            {(e.type === "goal" || e.type === "owngoal" || e.type === "so") && <span className="sc">{r.sc[0]}:{r.sc[1]}</span>}
          </div>);
        return (
          <div key={r.k} className="irow">
            {e.side === "home" ? body : <span />}
            <span className="min">{e.type === "so" ? `${r.kick}.` : goalTime(e)}
              {e.type === "goal" && e.map && <button type="button" className="gs-play" onClick={() => setSk(e)} aria-label="Prikaži kako je pao gol" title="Kako je pao gol">{Icon.play(11)}</button>}</span>
            {e.side === "away" ? body : <span />}
          </div>
        );
      })}
    </div>
    </>
  );
}

// boje linija za graf: bijeli/vrlo svijetli dres → boja obruba; ako su obje boje preslične, gost uzima boju obruba
const lum = (hex) => { const n = parseInt((hex || "#888888").slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
const dist = (a, b) => { const p = (h) => [0, 8, 16].map((k) => (parseInt(h.slice(1), 16) >> (16 - k)) & 255); const x = p(a), y = p(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
function lineColors(hk, ak) {
  const pick = (k) => (lum(k.shirt) > 0.85 && k.trim ? k.trim : k.shirt);
  const h = pick(hk); let a = pick(ak);
  if (dist(h, a) < 80 && ak.trim && dist(h, ak.trim) > dist(h, a) && lum(ak.trim) <= 0.85) a = ak.trim;
  return [h, a];
}

// Tijek rezultata: razlika u golovima kroz 40 minuta (gore domaćin vodi, dolje gost)
function ScoreFlow({ m, ix }) {
  const [hov, setHov] = useState(null);
  const f = flow(m);
  if (!f || f.seq.length < 2) return null;
  const W = 600, H = 120, X = (t) => 28 + (Math.min(t, 2400) / 2400) * (W - 40), max = Math.max(2, ...f.seq.map((g) => Math.abs(g.s[0] - g.s[1])));
  const Y = (d) => H / 2 - (d / max) * (H / 2 - 14);
  const [hk, ak] = lineColors(ix.club[m.home].kit, ix.club[m.away].kit), cb = comeback(m);
  // vodoravno: boja kluba koji vodi (neutralno kod izjednačenog); okomito (gol): boja kluba koji je zabio
  const segs = []; let t0 = 0, d0 = 0;
  for (const g of f.seq) {
    const d = g.s[0] - g.s[1];
    segs.push({ k: "h" + segs.length, x1: X(t0), x2: X(g.t), y1: Y(d0), y2: Y(d0), c: d0 > 0 ? hk : d0 < 0 ? ak : null });
    segs.push({ k: "v" + segs.length, x1: X(g.t), x2: X(g.t), y1: Y(d0), y2: Y(d), c: g.home ? hk : ak });
    t0 = g.t; d0 = d;
  }
  segs.push({ k: "end", x1: X(t0), x2: X(2400), y1: Y(d0), y2: Y(d0), c: d0 > 0 ? hk : d0 < 0 ? ak : null });
  return (
    <div className="flow">
      <div className="flow-h"><span>Tijek rezultata{cb && <b className="cbnote">Preokret: {ix.club[m[cb.side]].name} s {sideScore(cb.from, cb.side)} na {sideScore(cb.lead, cb.side)}</b>}</span><span className="muted small">{ix.club[m.home].short || ix.club[m.home].name} gore, {ix.club[m.away].short || ix.club[m.away].name} dolje</span></div>
      <div className="flow-plot">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tijek rezultata">
        <line x1={X(0)} x2={X(2400)} y1={Y(0)} y2={Y(0)} className="flow-0" />
        <line x1={X(1200)} x2={X(1200)} y1={6} y2={H - 6} className="flow-ht" />
        {[0, 10, 20, 30, 40].map((t) => <text key={t} x={X(t * 60)} y={H - 1} className="flow-t">{t}'</text>)}
        {segs.map((g) => <line key={g.k} x1={g.x1} x2={g.x2} y1={g.y1} y2={g.y2} className={"flow-seg" + (g.c ? "" : " tie")} style={g.c ? { stroke: g.c } : undefined} />)}
        {f.seq.map((g, i) => <circle key={i} cx={X(g.t)} cy={Y(g.s[0] - g.s[1])} r={hov === i ? 6.5 : 4.5} fill={g.home ? hk : ak} className="flow-dot" />)}
        {f.seq.map((g, i) => <circle key={"h" + i} cx={X(g.t)} cy={Y(g.s[0] - g.s[1])} r={13} className="flow-hit"
          onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)} onClick={() => setHov(hov === i ? null : i)} />)}
      </svg>
      {hov !== null && (() => {
        const g = f.seq[hov], side = g.home ? "home" : "away", c = ix.club[m[side]], p = ix.player[g.e.player];
        const x = 100 * X(g.t) / W, y = 100 * Y(g.s[0] - g.s[1]) / H;
        return (
          <div className={"flow-tip" + (x > 70 ? " left" : x < 30 ? " right" : "") + (y < 45 ? " below" : "")} style={{ left: `${x}%`, top: `${y}%` }}>
            <Jersey kit={c.kit} size={22} num={p?.num} />
            <div><b>{p ? playerName(p) : c.name}{g.e.type === "owngoal" ? " (autogol)" : ""}</b>
              <span className="muted small">{goalTime(g.e)} · {c.name} · {g.s[0]}:{g.s[1]}</span></div>
          </div>);
      })()}
      </div>
    </div>
  );
}

// Koliko je od 40 minuta koja ekipa vodila (kao "laps led" u F1)
function LeadShare({ m, ix }) {
  const L = leadTime(m);
  if (!L || (!L.home && !L.away)) return null;
  const [hk, ak] = lineColors(ix.club[m.home].kit, ix.club[m.away].kit);
  const H = ix.club[m.home], A = ix.club[m.away], nm = (c) => c.short || c.name;
  return (
    <div className="flow lead">
      <div className="flow-h"><span>Vrijeme u vodstvu</span><span className="muted small">od 40 minuta</span></div>
      <div className="lead-line">
        <span className="lead-n"><b>{mins(L.home)}'</b> {nm(H)}</span>
        <div className="lead-bar big" role="img" aria-label={`${H.name} vodio ${mins(L.home)} min, neriješeno ${mins(L.level)} min, ${A.name} vodio ${mins(L.away)} min`}>
          {L.segs.map((x, i) => <i key={i} className={x.k === "level" ? "d" : ""} title={`${Math.floor(x.a / 60)}'–${Math.ceil(x.b / 60)}': ${x.k === "level" ? "neriješeno" : `vodi ${ix.club[m[x.k]].name}`}`}
            style={{ width: `${100 * (x.b - x.a) / 2400}%`, ...(x.k !== "level" ? { background: x.k === "home" ? hk : ak } : {}) }} />)}
        </div>
        <span className="lead-n r">{nm(A)} <b>{mins(L.away)}'</b></span>
      </div>
      <div className="muted small lead-sub">Neriješeno {mins(L.level)}'{(L.longest.home || L.longest.away) ? ` · najduže vodstvo: ${L.longest.home >= L.longest.away ? H.name : A.name} ${mins(Math.max(L.longest.home, L.longest.away))}'` : ""}</div>
    </div>
  );
}

function Cmp({ label, a, b, fmt = (x) => x, ca, cb }) {
  const tot = (a + b) || 1;
  return (
    <div className="row">
      <div className="lab"><span>{fmt(a)}</span><span>{label}</span><span>{fmt(b)}</span></div>
      <div className="bars">
        <div><i style={{ width: `${100 * a / tot}%`, background: a >= b ? ca : "var(--line)" }} /></div>
        <div><i style={{ width: `${100 * b / tot}%`, background: b >= a ? cb : "var(--line)" }} /></div>
      </div>
    </div>
  );
}

// tempo igre s TV trake: koliko često se igra prekida i koliko je stvarno trajalo poluvrijeme
function Tempo({ T }) {
  const mm = (x) => `${Math.floor(x / 60)}:${String(Math.round(x % 60)).padStart(2, "0")}`;
  const row = (l, v) => <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderTop: "1px solid var(--line)" }}><span className="muted">{l}</span><b>{v}</b></div>;
  return (
    <div className="pb">
      <h4 style={{ font: "600 13px/1 var(--body)", color: "var(--muted)", margin: "4px 0 8px" }}>Tempo igre</h4>
      {row("Prekida igre", T.stoppages)}
      {row("Igra bez prekida, prosječno", `${String(T.avgPlay).replace(".", ",")} s`)}
      {row("Najdulje bez prekida", `${T.longestPlay} s (od ${Math.floor(T.longestAt / 60)}'${String(T.longestAt % 60).padStart(2, "0")}")`)}
      {T.halves.map((h) => <div key={h.period}>{row(`${h.period}. poluvrijeme trajalo je`, `${mm(h.real)} min za 20:00 igre`)}</div>)}
      <div className="note" style={{ marginTop: 8 }}>Iz sata na TV prijenosu: igra teče kad teče sat.</div>
    </div>
  );
}

// toplinska mapa na canvasu preko terena 42.4 x 22.4 m (teren 40 x 20 + rub)
function drawHeat(ctx, c, pts, R = 3.2, court = null) {
    // gustoća na mreži 0,4 m; boja relativno prema 98. percentilu (jedno vruće mjesto ne "ugasi" ostatak);
    // ispod 15 % prozirno, pa se vidi gdje se stvarno igralo; s `court` samo unutar linija terena
    const GW = 106, GH = 56, g = new Float32Array(GW * GH);
    const toG = (x, y) => [(x + 21.2) / 42.4 * GW, (y + 11.2) / 22.4 * GH];
    const rr = R * R;
    for (const [x, y] of pts) { const [gx, gy] = toG(x, y);
      for (let j = Math.max(0, Math.floor(gy - 3 * R)); j < Math.min(GH, gy + 3 * R); j++)
        for (let i = Math.max(0, Math.floor(gx - 3 * R)); i < Math.min(GW, gx + 3 * R); i++) {
          const dx = i - gx, dy = j - gy; g[j * GW + i] += Math.exp(-(dx * dx + dy * dy) / (2 * rr)); } }
    const inside = (k) => { if (!court) return true; const x = (k % GW + 0.5) / GW * 42.4 - 21.2, y = (Math.floor(k / GW) + 0.5) / GH * 22.4 - 11.2;
      return Math.abs(x) <= court.L / 2 && Math.abs(y) <= court.W / 2; };
    const vals = []; for (let k = 0; k < g.length; k++) if (g[k] > 0 && inside(k)) vals.push(g[k]);
    vals.sort((a, b) => a - b); const top = vals[Math.floor(vals.length * 0.98)] || 1;
    const stops = [[0, [46, 204, 113]], [0.45, [241, 196, 15]], [0.75, [243, 130, 30]], [1, [231, 60, 50]]];
    const col = (v) => { for (let n = 1; n < stops.length; n++) if (v <= stops[n][0]) {
      const [a0, c0] = stops[n - 1], [a1, c1] = stops[n], u = (v - a0) / (a1 - a0); return c0.map((q, z) => Math.round(q + (c1[z] - q) * u)); }
      return stops[stops.length - 1][1]; };
    const img = ctx.createImageData(GW, GH);
    for (let k = 0; k < g.length; k++) {
      if (!inside(k)) continue;
      const v = Math.min(1, g[k] / top); if (v < 0.15) continue;
      const [cr, cg, cb] = col((v - 0.15) / 0.85);
      img.data[k * 4] = cr; img.data[k * 4 + 1] = cg; img.data[k * 4 + 2] = cb; img.data[k * 4 + 3] = Math.round(255 * Math.min(0.85, (v - 0.15) / 0.85 * 1.1)); }
    const tmp = document.createElement("canvas"); tmp.width = GW; tmp.height = GH; tmp.getContext("2d").putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(tmp, 0, 0, c.width, c.height);
}

function TeamHeat({ m, ix, D, order }) {
  const [side, setSide] = useState("home");
  const cv = useRef(null);
  useEffect(() => {
    const c = cv.current; if (!c) return;
    const ctx = c.getContext("2d"), rect = c.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    c.width = Math.round(rect.width * d); c.height = Math.round(rect.height * d); ctx.clearRect(0, 0, c.width, c.height);
    const pts = teamHeatPoints(D, order[side === "home" ? 0 : 1]);
    if (pts.length) drawHeat(ctx, c, pts, 2.6, D.court || { L: 40, W: 20 });
  }, [side, D]);
  return (
    <div className="pb">
      <div className="ph"><h3>Toplinska mapa ekipe</h3>
        <div className="seg">{["home", "away"].map((k) => <button key={k} type="button" aria-pressed={side === k} onClick={() => setSide(k)}>{ix.club[m[k]].short}</button>)}</div></div>
      <div className="pitch-wrap"><div className="pitch">
        <svg className="lines" viewBox="-21.2 -11.2 42.4 22.4" aria-hidden="true"><CourtLines sw={0.12} /></svg>
        <canvas ref={cv} aria-hidden="true" />
      </div></div>
      <div className="note" style={{ marginTop: 8 }}>Gdje su bili igrači ekipe (bez golmana) dok je tekao sat. Ekipa napada udesno u oba poluvremena. Iz automatske video analize.</div>
    </div>);
}

function Stats({ m, ix, A }) {
  const H = ix.club[m.home], Aw = ix.club[m.away];
  const ca = "var(--primary)", cb = "var(--signal)";
  const c = (type, side) => m.events.filter((e) => e.type === type && e.side === side).length;
  const s = score(m) || [0, 0];
  const st = A.D ? analysisStats(A.D, teamOrder(A.D, m)) : null;
  const per = perPlayerAllowed(ix, m.comp);
  const keyClub = st ? Object.fromEntries(Object.entries(m.analysis.teamMap || {}).map(([k, v]) => [k, v === "home" ? H : Aw])) : {};
  return (
    <>
      <div className="cmp">
        <div className="lab" style={{ fontWeight: 700 }}><span style={{ display: "flex", gap: 6, alignItems: "center" }}><Jersey kit={H.kit} size={20} />{H.short}</span><span />
          <span style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end" }}>{Aw.short}<Jersey kit={Aw.kit} size={20} /></span></div>
        {(st || m.stats?.territory) && <h4>Iz video analize</h4>}
        {st?.poss && <Cmp label="Posjed" a={st.poss[0]} b={st.poss[1]} fmt={(x) => x + "%"} ca={ca} cb={cb} />}
        {st?.terr && !m.stats?.territory && <Cmp label="Lopta na protivničkoj polovini" a={st.terr[0]} b={st.terr[1]} fmt={(x) => x + "%"} ca={ca} cb={cb} />}
        {m.stats?.territory && <>
          <Cmp label="Lopta na protivničkoj polovini" a={m.stats.territory.half[0]} b={m.stats.territory.half[1]} fmt={(x) => x + "%"} ca={ca} cb={cb} />
          <Cmp label="Lopta u napadačkoj trećini" a={m.stats.territory.third[0]} b={m.stats.territory.third[1]} fmt={(x) => x + "%"} ca={ca} cb={cb} />
        </>}
        <h4>Zapisnik</h4>
        <Cmp label="Golovi" a={s[0]} b={s[1]} ca={ca} cb={cb} />
        {m.events.some((e) => e.type === "foul") && <Cmp label="Prekršaji" a={c("foul", "home")} b={c("foul", "away")} ca={ca} cb={cb} />}
        <Cmp label="Žuti kartoni" a={c("yellow", "home")} b={c("yellow", "away")} ca={ca} cb={cb} />
        {!st && <div className="src">Posjed i kretanje igrača pojavljuju se kad utakmica ima video analizu.</div>}
      </div>
      {m.stats?.tempo && <Tempo T={m.stats.tempo} />}
      {A.D && <TeamHeat m={m} ix={ix} D={A.D} order={teamOrder(A.D, m)} />}
      {st && !per && <div className="pb"><div className="note">U kadetskoj ligi ne prikazujemo podatke o kretanju pojedinih igrača.</div></div>}
      {st && per && st.players.length > 0 && (
        <div className="pb">
          <h4 style={{ font: "600 13px/1 var(--body)", color: "var(--muted)", margin: "4px 0 8px" }}>Kretanje igrača s prepoznatim brojem</h4>
          <div className="tbl-wrap">
            <table className="squad">
              <thead><tr><th>#</th><th>Igrač</th><th className="c">Prijeđeno</th><th className="c">Prepoznat</th></tr></thead>
              <tbody>{st.players.map((p) => {
                const side = keyClub[p.team] === ix.club[m.home] ? "home" : "away";
                const pid = (m.roster?.[side]?.players || []).find((q) => String(ix.player[q]?.num) === p.num);
                return (
                <tr key={p.key}><td className="n">{p.num}</td><td><span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>{keyClub[p.team] && <Jersey kit={keyClub[p.team].kit} size={18} />}{pid ? shortName(ix.player[pid]) : keyClub[p.team]?.name || p.team}</span></td>
                  <td className="c">{p.dist >= 1000 ? (p.dist / 1000).toFixed(2) + " km" : p.dist + " m"}</td><td className="c">{p.time >= 60 ? Math.round(p.time / 60) + " min" : p.time + " s"}</td></tr>); })}</tbody>
            </table>
          </div>
          <div className="note" style={{ marginTop: 8 }}>Samo vrijeme dok teče sat i dok je igrač prepoznat po broju na dresu (nije cijela minutaža). Udaljenost iz pozicija na mini-mapi u tom vremenu.</div>
        </div>)}
    </>
  );
}

// formacija 1-2-1 (romb), domaćin brani lijevi gol
const SLOTS = [[-18.2, 0], [-12, 0], [-8, -6], [-8, 6], [-3.6, 0]];
function Suspended({ db, m, ix }) {
  const S = suspensions(db, m);
  if (!S.home.length && !S.away.length) return null;
  return (
    <div className="susp">
      {["home", "away"].map((side) => S[side].length ? (
        <div key={side}><b><Jersey kit={ix.club[m[side]].kit} size={18} />{ix.club[m[side]].name}: ne igra zbog kazne</b>
          <ul>{S[side].map((s) => <li key={s.player}>{playerName(ix.player[s.player])} <span className="muted small">({s.reason})</span></li>)}</ul></div>) : null)}
    </div>);
}

function Lineups({ m, ix, A }) {
  const [sel, setSel] = useState(null);
  const H = ix.club[m.home], Aw = ix.club[m.away];
  const r = m.roster;
  const cv = useRef(null);
  const per = perPlayerAllowed(ix, m.comp);
  const D = per ? A.D : null, order = D ? teamOrder(D, m) : null;
  const keyOf = (side, pid) => {
    if (!D) return null; const p = ix.player[pid]; if (!p) return null;
    const code = Object.entries(m.analysis.teamMap || {}).find(([, v]) => v === side)?.[0];
    const k = `${code} ${p.num}`; return D.players.includes(k) ? k : null;
  };
  useEffect(() => {
    const c = cv.current; if (!c) return;
    const ctx = c.getContext("2d"), rect = c.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    c.width = Math.round(rect.width * d); c.height = Math.round(rect.height * d); ctx.clearRect(0, 0, c.width, c.height);
    if (!sel || !D) return;
    let pts = heatPoints(D, sel.key, order[0], sel.side === "home");
    if (!pts.length) return;
drawHeat(ctx, c, pts, 3.2, A.D?.court || { L: 40, W: 20 });
  }, [sel, D]);
  if (!r?.home || !r?.away) return <div className="empty">Zapisnik za ovu utakmicu još nije unesen.</div>;
  const pos = (x, y) => ({ left: `${(x + 21.2) / 42.4 * 100}%`, top: `${(y + 11.2) / 22.4 * 100}%` });
  const startOrd = (side) => { const st = r[side].start, gk = st.filter((p) => r[side].gk.includes(p)); return [...gk.slice(0, 1), ...st.filter((p) => p !== gk[0])]; };
  const click = (side, pid) => { const key = keyOf(side, pid); setSel(sel?.pid === pid ? null : { pid, side, key }); };
  const selInfo = sel ? (sel.key ? `Toplinska mapa: ${playerName(ix.player[sel.pid])}, ${ix.club[m[sel.side]].name} (iz isječka analize)` : `${playerName(ix.player[sel.pid])}: nema podataka o kretanju u analizi.`) : null;
  return (
    <>
      <div className="pitch-wrap">
        <div className="pitch">
          <svg className="lines" viewBox="-21.2 -11.2 42.4 22.4" aria-hidden="true"><CourtLines sw={0.12} /></svg>
          <canvas ref={cv} aria-hidden="true" />
          {["home", "away"].map((side) => startOrd(side).map((pid, i) => {
            const p = ix.player[pid], kit = ix.club[m[side]].kit, [x, y] = SLOTS[i] || [0, 0];
            const gk = r[side].gk.includes(pid);
            const k2 = gk ? { shirt: "#f2b705", trim: "#1b1600", num: "#1b1600" } : kit;
            return (
              <button key={side + pid} className="pp" style={pos(side === "home" ? x : -x, side === "home" ? y : -y)} aria-pressed={sel?.pid === pid}
                onClick={() => click(side, pid)} title={keyOf(side, pid) ? "Prikaži toplinsku mapu" : playerName(p)}>
                <Jersey kit={k2} size={34} num={p?.num} /><span>{(p?.name && !playerName(p).startsWith("Igrač #") ? playerName(p).replace(/ #\d+$/, "") : "") || (gk ? "golman" : "")}</span>
              </button>);
          }))}
        </div>
        <div className="note" style={{ marginTop: 8, minHeight: "1.4em" }}>{selInfo || (D ? "Klikni igrača za toplinsku mapu iz video analize." : "Početna petorka iz zapisnika.")}</div>
      </div>
      <div className="bench">
        {["home", "away"].map((side) => {
          const c = ix.club[m[side]];
          const list = r[side].players.filter((p) => !r[side].start.includes(p)).map((p) => ix.player[p]).filter(Boolean)
            .sort((a, b) => (r[side].gk.includes(b.id) - r[side].gk.includes(a.id)) || (+a.num - +b.num));   // golmani prvi, zatim po broju
          return (
            <div key={side}>
              <h4><Jersey kit={c.kit} size={20} />{c.name}, klupa</h4>
              <ul>{list.map((p) => (
                <li key={p.id}><button onClick={() => click(side, p.id)} aria-pressed={sel?.pid === p.id}>
                  <span className="n">{p.num}</span><span>{playerName(p)}</span>{r[side].gk.includes(p.id) ? <span className="tag">GK</span> : <span />}
                </button></li>))}</ul>
            </div>);
        })}
      </div>
    </>
  );
}
