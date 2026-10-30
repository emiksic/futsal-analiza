import { useEffect, useRef, useState } from "react";
import { href } from "../lib/router.js";
import { score, absSec, minute, fmtDay, fmtTime, playerName, fouls, perPlayerAllowed, withMatchNumbers, goalTime, flow, comeback } from "../lib/derive.js";
import { useAnalysis, teamOrder, analysisStats, heatPoints } from "../lib/analysis.js";
import { AnalysisViewer } from "../components/AnalysisViewer.jsx";
import { Jersey, Icon, CourtLines } from "../components/ui.jsx";
import { MiniTable } from "../components/Side.jsx";
import { Shots } from "./Shots.jsx";
import { Player } from "../components/Player.jsx";
import { shotStats } from "../components/ShotMap.jsx";

export function Match({ db, ix: ix0, id, tab }) {
  const m = ix0.match[id];
  const ix = m ? withMatchNumbers(ix0, m) : ix0;   // broj na dresu iz zapisnika ove utakmice
  const A = useAnalysis(m);
  if (!m) return <div className="page"><div className="panel empty">Utakmica ne postoji.</div></div>;
  const has = m.analysis?.status === "done";
  const t = tab || (has || m.youtube ? "analiza" : "detalji");
  const TABS = [["analiza", "Video"], ["detalji", "Detalji"], ["udarci", "Udarci"], ["statistika", "Statistika"], ["postave", "Postave"]];
  return (
    <div className="page">
      <Board m={m} ix={ix} />
      <div className={t === "analiza" || t === "udarci" ? "" : "split"}>
      <section className="panel">
        <nav className="tabs" aria-label="Utakmica">
          {TABS.map(([k, n]) => <a key={k} href={href("utakmica", m.id, k)} aria-current={t === k ? "page" : undefined}>{n}</a>)}
        </nav>
        {t !== "analiza" && <div style={{ height: 6 }} />}
        {t === "analiza" && <AnalysisTab m={m} ix={ix} A={A} />}
        {t === "detalji" && <Incidents m={m} ix={ix} />}
        {t === "statistika" && <Stats m={m} ix={ix} A={A} />}
        {t === "udarci" && <Shots m={m} ix={ix} />}
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
  const lostH = s && m.status === "finished" && s[0] < s[1], lostA = s && m.status === "finished" && s[1] < s[0];
  const fin = m.status === "finished";
  const f2 = [fouls(m, "home", 2), fouls(m, "away", 2)];
  return (
    <section className="board" aria-label="Rezultat">
      <div className="board-top">
        <a href={href("liga", comp.league, comp.season, "rezultati", m.round)}>{L.name}{m.round ? `, ${m.round}. kolo` : ", isječak"}</a>
        {!m.extra && <span>{fmtDay(m.date)}{m.timeTbd ? "" : ` u ${fmtTime(m.date)}`}</span>}
        <span>{ix.hall[m.hall]?.name}, {ix.hall[m.hall]?.city}</span>
        {m.youtube ? <a className="r" href={m.youtube} target="_blank" rel="noreferrer" style={{ display: "inline-flex", gap: 6, alignItems: "center", color: "var(--band-fg)" }}>
          Prijenos na YouTubeu {Icon.ext()}</a>
          : m.tv ? <span className="r">Prijenos: {m.tv}</span> : null}
      </div>
      <div className="board-main">
        <a className="bteam" href={href("klub", H.id)}><Jersey kit={H.kit} size={58} /><b>{H.name}</b></a>
        <div className="bscore">
          {s ? <div className="digits"><span className={lostH ? "lost" : ""}>{s[0]}</span><span className="sep">:</span><span className={lostA ? "lost" : ""}>{s[1]}</span></div>
            : <div className="bkick">{m.timeTbd ? "–:–" : fmtTime(m.date)}</div>}
          <div className="bstate">{fin ? `Kraj${ht ? `, poluvrijeme ${ht[0]}:${ht[1]}` : ""}` : m.timeTbd ? "Satnica još nije objavljena" : "Zakazano"}</div>
        </div>
        <a className="bteam" href={href("klub", A.id)}><Jersey kit={A.kit} size={58} /><b>{A.name}</b></a>
      </div>
      {fin && (goals("home").length || goals("away").length) ? (
        <div className="board-goals">
          {["home", "away"].map((side) => (
            <div key={side}>{goals(side).map((e) => <span key={e.id}>{playerName(ix.player[e.player])}{e.type === "owngoal" ? " (ag)" : ""} {goalTime(e)}</span>)}</div>
          ))}
        </div>) : null}
      {fin && m.events.some((e) => e.type === "foul") && (
        <div className="board-fouls" title="Akumulirani prekršaji u 2. poluvremenu. Od 6. prekršaja izvodi se kazneni udarac s 10 m.">
          <FoulBar n={f2[0]} /><span>Akumulirani prekršaji<br />2. poluvrijeme</span><FoulBar n={f2[1]} />
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
  const cbGoal = comeback(m)?.goal;
  if (m.status !== "finished" && !m.events.length) return <div className="empty">Utakmica još nije odigrana.</div>;
  const evs = m.events.filter((e) => e.type !== "shot").sort((a, b) => absSec(a) - absSec(b));
  const cnt = { home: {}, away: {} }, sc = [0, 0], rows = [];
  let per = 0;
  for (const e of evs) {
    if (e.period !== per) {
      if (per) rows.push({ k: "p" + per + "end", head: per === 1 ? "Poluvrijeme" : "Kraj regularnog dijela", sc: [...sc] });
      per = e.period; rows.push({ k: "p" + per, head: `${per}. poluvrijeme` });
    }
    if (e.type === "foul") {
      const c = cnt[e.side][e.period] = (cnt[e.side][e.period] || 0) + 1;
      if (c >= 5) rows.push({ k: e.id, e, foulN: c });
      continue;
    }
    if (e.type === "goal") sc[e.side === "home" ? 0 : 1]++;
    if (e.type === "owngoal") sc[e.side === "home" ? 1 : 0]++;
    rows.push({ k: e.id, e, sc: [...sc] });
  }
  if (per) rows.push({ k: "end", head: "Kraj", sc: [...sc] });
  return (
    <>
    <ScoreFlow m={m} ix={ix} />
    <div className="inc">
      {rows.map((r) => {
        if (r.head) return <div key={r.k} className="per">{r.head}{r.sc && <b>{r.sc[0]}:{r.sc[1]}</b>}</div>;
        const e = r.e, p = ix.player[e.player], as = ix.player[e.assist];
        let icon, main, sub;
        if (e.type === "goal" || e.type === "owngoal") { icon = Icon.ball(20); main = <>{playerName(p)}{e.id === cbGoal && <span className="cbtag">preokret</span>}</>; sub = e.type === "owngoal" ? "autogol" : e.pen ? "kazneni udarac" : as ? `asistencija: ${playerName(as)}` : ""; }
        else if (e.type === "yellow") { icon = <span className="card-y" />; main = playerName(p); sub = "žuti karton"; }
        else if (e.type === "red") { icon = <span className="card-r" />; main = playerName(p); sub = e.secondYellow ? "drugi žuti karton" : "crveni karton"; }
        else if (e.type === "timeout") { icon = Icon.timeout(); main = "Time-out"; sub = ix.club[m[e.side]].name; }
        else if (e.type === "foul") { icon = Icon.whistle(); main = `${r.foulN}. akumulirani prekršaj`; sub = r.foulN >= 6 ? "kazneni udarac s 10 m" : "sljedeći prekršaj donosi udarac s 10 m"; }
        const body = (
          <div className={"ev " + e.side}>
            <span className="ico">{icon}</span>
            <span className="txt">{main}{sub && <small>{sub}</small>}</span>
            {(e.type === "goal" || e.type === "owngoal") && <span className="sc">{r.sc[0]}:{r.sc[1]}</span>}
          </div>);
        return (
          <div key={r.k} className="irow">
            {e.side === "home" ? body : <span />}
            <span className="min">{goalTime(e)}</span>
            {e.side === "away" ? body : <span />}
          </div>
        );
      })}
    </div>
    </>
  );
}

// Tijek rezultata: razlika u golovima kroz 40 minuta (gore domaćin vodi, dolje gost)
function ScoreFlow({ m, ix }) {
  const f = flow(m);
  if (!f || f.seq.length < 2) return null;
  const W = 600, H = 120, X = (t) => 28 + (Math.min(t, 2400) / 2400) * (W - 40), max = Math.max(2, ...f.seq.map((g) => Math.abs(g.s[0] - g.s[1])));
  const Y = (d) => H / 2 - (d / max) * (H / 2 - 14);
  let path = `M${X(0)},${Y(0)}`;
  for (const g of f.seq) path += ` H${X(g.t)} V${Y(g.s[0] - g.s[1])}`;
  path += ` H${X(2400)}`;
  const hk = ix.club[m.home].kit.shirt, ak = ix.club[m.away].kit.shirt, cb = comeback(m);
  return (
    <div className="flow">
      <div className="flow-h"><span>Tijek rezultata{cb && <b className="cbnote">{ix.club[m[cb.side]].name} se vratio s {cb.side === "home" ? `${cb.from[0]}:${cb.from[1]}` : `${cb.from[1]}:${cb.from[0]}`}</b>}</span><span className="muted small">{ix.club[m.home].short || ix.club[m.home].name} gore, {ix.club[m.away].short || ix.club[m.away].name} dolje</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tijek rezultata">
        <line x1={X(0)} x2={X(2400)} y1={Y(0)} y2={Y(0)} className="flow-0" />
        <line x1={X(1200)} x2={X(1200)} y1={6} y2={H - 6} className="flow-ht" />
        {[0, 10, 20, 30, 40].map((t) => <text key={t} x={X(t * 60)} y={H - 1} className="flow-t">{t}'</text>)}
        <path d={path} className="flow-line" />
        {f.seq.map((g, i) => <circle key={i} cx={X(g.t)} cy={Y(g.s[0] - g.s[1])} r={4.5} fill={g.home ? hk : ak} className="flow-dot">
          <title>{goalTime(g.e)} {g.s[0]}:{g.s[1]}</title></circle>)}
      </svg>
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

function Stats({ m, ix, A }) {
  const H = ix.club[m.home], Aw = ix.club[m.away];
  const ca = "var(--primary)", cb = "var(--signal)";
  const c = (type, side) => m.events.filter((e) => e.type === type && e.side === side).length;
  const s = score(m) || [0, 0];
  const st = A.D ? analysisStats(A.D, teamOrder(A.D, m)) : null;
  const per = perPlayerAllowed(ix, m.comp);
  const sh = shotStats(m);
  const keyClub = st ? Object.fromEntries(Object.entries(m.analysis.teamMap || {}).map(([k, v]) => [k, v === "home" ? H : Aw])) : {};
  return (
    <>
      <div className="cmp">
        <div className="lab" style={{ fontWeight: 700 }}><span style={{ display: "flex", gap: 6, alignItems: "center" }}><Jersey kit={H.kit} size={20} />{H.short}</span><span />
          <span style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end" }}>{Aw.short}<Jersey kit={Aw.kit} size={20} /></span></div>
        {st && <h4>Iz video analize ({st.dur} s snimke)</h4>}
        {st?.poss && <Cmp label="Posjed" a={st.poss[0]} b={st.poss[1]} fmt={(x) => x + "%"} ca={ca} cb={cb} />}
        {st?.terr && <Cmp label="Lopta na protivničkoj polovini" a={st.terr[0]} b={st.terr[1]} fmt={(x) => x + "%"} ca={ca} cb={cb} />}
        <h4>Zapisnik</h4>
        <Cmp label="Golovi" a={s[0]} b={s[1]} ca={ca} cb={cb} />
        {sh.home.shots + sh.away.shots > 0 && <>
          <Cmp label="Udarci" a={sh.home.shots} b={sh.away.shots} ca={ca} cb={cb} />
          <Cmp label="Udarci u okvir" a={sh.home.on} b={sh.away.on} ca={ca} cb={cb} />
          <Cmp label="Obrane golmana" a={sh.home.saves} b={sh.away.saves} ca={ca} cb={cb} />
          <Cmp label="Blokirani udarci" a={sh.home.blocked} b={sh.away.blocked} ca={ca} cb={cb} />
        </>}
        <Cmp label="Prekršaji" a={c("foul", "home")} b={c("foul", "away")} ca={ca} cb={cb} />
        <Cmp label="Žuti kartoni" a={c("yellow", "home")} b={c("yellow", "away")} ca={ca} cb={cb} />
        <Cmp label="Time-out" a={c("timeout", "home")} b={c("timeout", "away")} ca={ca} cb={cb} />
        {!st && <div className="src">Posjed i kretanje igrača pojavljuju se kad utakmica ima video analizu.</div>}
      </div>
      {st && !per && <div className="pb"><div className="note">U kadetskoj ligi ne prikazujemo podatke o kretanju pojedinih igrača.</div></div>}
      {st && per && st.players.length > 0 && (
        <div className="pb">
          <h4 style={{ font: "600 13px/1 var(--body)", color: "var(--muted)", margin: "4px 0 8px" }}>Kretanje igrača s prepoznatim brojem</h4>
          <div className="tbl-wrap">
            <table className="squad">
              <thead><tr><th>#</th><th>Klub</th><th className="c">Prijeđeno</th><th className="c">U kadru</th></tr></thead>
              <tbody>{st.players.map((p) => (
                <tr key={p.key}><td className="n">{p.num}</td><td><span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>{keyClub[p.team] && <Jersey kit={keyClub[p.team].kit} size={18} />}{keyClub[p.team]?.name || p.team}</span></td>
                  <td className="c">{p.dist} m</td><td className="c">{p.time} s</td></tr>))}</tbody>
            </table>
          </div>
          <div className="note" style={{ marginTop: 8 }}>Udaljenost se računa iz pozicija na mini-mapi i vrijedi samo za vrijeme u kadru.</div>
        </div>)}
    </>
  );
}

// formacija 1-2-1 (romb), domaćin brani lijevi gol
const SLOTS = [[-18.2, 0], [-12, 0], [-8, -6], [-8, 6], [-3.6, 0]];
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
    const GW = 106, GH = 56, g = new Float32Array(GW * GH);
    const toG = (x, y) => [(x + 21.2) / 42.4 * GW, (y + 11.2) / 22.4 * GH];
    const R = 3.2, rr = R * R;
    for (const [x, y] of pts) { const [gx, gy] = toG(x, y);
      for (let j = Math.max(0, Math.floor(gy - 3 * R)); j < Math.min(GH, gy + 3 * R); j++)
        for (let i = Math.max(0, Math.floor(gx - 3 * R)); i < Math.min(GW, gx + 3 * R); i++) {
          const dx = i - gx, dy = j - gy; g[j * GW + i] += Math.exp(-(dx * dx + dy * dy) / (2 * rr)); } }
    let mx = 0; for (const v of g) mx = Math.max(mx, v);
    const img = ctx.createImageData(GW, GH);
    for (let k = 0; k < g.length; k++) { const v = g[k] / mx; if (v < 0.04) continue;
      const [cr, cg, cb] = v < 0.5 ? [255, Math.round(220 - 60 * v), 60] : [255, Math.round(190 - 260 * (v - 0.5)), 40];
      img.data[k * 4] = cr; img.data[k * 4 + 1] = cg; img.data[k * 4 + 2] = cb; img.data[k * 4 + 3] = Math.round(40 + 175 * Math.sqrt(v)); }
    const tmp = document.createElement("canvas"); tmp.width = GW; tmp.height = GH; tmp.getContext("2d").putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(tmp, 0, 0, c.width, c.height);
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
