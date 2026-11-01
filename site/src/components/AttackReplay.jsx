// Animacija napada na mini-terenu (kao "replay" gola na Sofascoreu): igrači, lopta, dodavanja zadnjih N sekundi.
// Podaci: izlaz export_web.py (D). Prozor [t0, t1] je vrijeme u podacima analize (za gol: vrijeme gola u videu - 12 s).
import { useEffect, useMemo, useRef, useState } from "react";
import { CourtLines, Jersey, Icon } from "./ui.jsx";
import { defendSide } from "../lib/analysis.js";

const lum = (hex) => { const n = parseInt((hex || "#888888").slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };

// Lanac posjeda: uzastopni nositelji lopte (kratke rupe bez nositelja se preskaču)
export function possessionChain(D, t0, t1) {
  const segs = [];
  for (const f of D.frames) {
    if (f.t < t0 || f.t > t1 || f.h == null || f.h < 0) continue;
    const pl = f.p.find((p) => p[1] === f.h); if (!pl) continue;
    const last = segs[segs.length - 1];
    if (last && last.h === f.h) { last.t1 = f.t; last.x1 = pl[7]; last.y1 = pl[8]; }
    else segs.push({ h: f.h, team: pl[0], t0: f.t, t1: f.t, x0: pl[7], y0: pl[8], x1: pl[7], y1: pl[8] });
  }
  return segs.filter((s, i) => s.t1 - s.t0 >= 0.15 || i === segs.length - 1);   // trzaji kraći od ~2 slike su šum
}

export function AttackReplay({ D, t0, t1, order, teamKit, label, nameOf, title = "Tijek napada" }) {
  const frames = useMemo(() => D.frames.filter((f) => f.t >= t0 && f.t <= t1), [D, t0, t1]);
  const chain = useMemo(() => possessionChain(D, t0, t1), [D, t0, t1]);
  // napad uvijek ide slijeva nadesno: ekipa zadnjeg nositelja napada gol suprotan onome koji brani
  const att = chain.length ? chain[chain.length - 1].team : order[0];
  const flip = -defendSide(D, att) < 0;
  const P = (x, y) => (flip ? [-x, -y] : [x, y]);
  const [i, setI] = useState(0), [play, setPlay] = useState(true);
  const raf = useRef(0);
  useEffect(() => { setI(0); setPlay(true); }, [t0, t1]);
  useEffect(() => {
    if (!play || !frames.length) return;
    let last = performance.now(), acc = 0;
    const dt = 1 / (D.fps || 14);
    const step = (now) => {
      acc += (now - last) / 1000; last = now;
      if (acc >= dt) { acc = 0; setI((k) => { if (k + 1 >= frames.length) { setPlay(false); return k; } return k + 1; }); }
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [play, frames, D.fps]);
  if (!frames.length) return null;
  const f = frames[Math.min(i, frames.length - 1)];
  const col = (ti) => {
    const k = teamKit(ti); if (!k) return D.teams[ti]?.color || "#999";
    return lum(k.shirt) > 0.85 && k.trim ? k.trim : k.shirt;
  };
  const trail = [];
  for (let k = Math.max(0, i - 20); k <= i; k++) { const b = frames[k]?.b; if (b) trail.push(P(b[2], b[3])); }
  const done = chain.filter((s) => s.t0 <= f.t);
  const passes = [];
  for (let k = 1; k < done.length; k++) {
    const a = done[k - 1], b = done[k];
    if (a.team === b.team && a.h !== b.h) passes.push([P(a.x1, a.y1), P(b.x0, b.y0), a.team]);
  }
  const bp = f.b ? P(f.b[2], f.b[3]) : null;
  return (
    <div className="replay">
      <div className="replay-h"><b>{title}</b><span className="muted small">{label}</span></div>
      <div className="replay-court">
        <svg viewBox="-21.2 -11.2 42.4 22.4" role="img" aria-label="Animacija napada">
          <rect x="-21.2" y="-11.2" width="42.4" height="22.4" fill="var(--court)" />
          <CourtLines L={D.court?.L || 40} W={D.court?.W || 20} D={D.court?.D || 6} />
          <defs>
            {[0, 1].map((ti) => <marker key={ti} id={"arr" + ti} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L10 5L0 10z" fill={col(order[ti])} /></marker>)}
          </defs>
          {passes.map(([a, b, team], k) => <line key={k} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={col(team)} strokeWidth="0.28" strokeDasharray="0.7 0.45" markerEnd={`url(#arr${order.indexOf(team)})`} opacity="0.95" />)}
          {trail.length > 1 && <polyline points={trail.map((p) => p.join(",")).join(" ")} fill="none" stroke="#fff" strokeWidth="0.18" opacity="0.6" />}
          {f.p.filter((p) => p[0] === order[0] || p[0] === order[1]).map((p, k) => {
            const [x, y] = P(p[7], p[8]), c = col(p[0]), hold = p[1] >= 0 && p[1] === f.h;
            const num = p[1] >= 0 ? (D.players[p[1]] || "").split(" ").pop() : "";
            return (
              <g key={k} transform={`translate(${x} ${y})`}>
                <circle r={hold ? 0.95 : 0.75} fill={c} stroke={hold ? "#ffd400" : "rgba(0,0,0,.55)"} strokeWidth={hold ? 0.25 : 0.1} />
                {num && <text y="0.33" textAnchor="middle" fontSize="0.9" fontWeight="700" fill={lum(c) > 0.6 ? "#111" : "#fff"}>{num}</text>}
              </g>);
          })}
          {bp && <circle cx={bp[0]} cy={bp[1]} r="0.42" fill="#fff" stroke="#111" strokeWidth="0.1" />}
        </svg>
      </div>
      <div className="replay-ctl">
        <button className="btn sm" onClick={() => { if (i >= frames.length - 1) setI(0); setPlay(!play); }} aria-label={play ? "Pauza" : "Pokreni"}>{play ? "Pauza" : i >= frames.length - 1 ? "Ponovi" : "Pokreni"}</button>
        <input type="range" min="0" max={frames.length - 1} value={i} onChange={(e) => { setPlay(false); setI(+e.target.value); }} aria-label="Vrijeme u napadu" />
        <span className="small muted">{(f.t - t0).toFixed(1)} s</span>
      </div>
      {chain.length > 0 && (
        <ol className="replay-chain">
          {chain.map((s, k) => {
            const key = D.players[s.h] || "", nm = nameOf(key);
            const turnover = k > 0 && chain[k - 1].team !== s.team;
            return (
              <li key={k} className={s.t0 <= f.t ? "on" : ""}>
                {turnover && <span className="small muted">oduzimanje · </span>}
                <Jersey kit={teamKit(s.team) || { shirt: D.teams[s.team]?.color || "#999" }} size={18} num={key.split(" ").pop()} />
                <span>{nm}</span>
              </li>);
          })}
        </ol>)}
    </div>
  );
}
