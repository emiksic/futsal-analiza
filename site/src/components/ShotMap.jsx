// Karta udaraca. Udarac se sprema normalizirano: ekipa napada gol na x = +20 m.
// Prikaz: domaćin napada udesno, gost ulijevo.
import { useRef } from "react";
import { CourtLines } from "./ui.jsx";

export const OUTCOMES = { goal: "Gol", saved: "Obranjen", woodwork: "Okvir gola", off: "Pored ili iznad", blocked: "Blokiran" };
export const toView = (s) => (s.side === "home" ? [s.x, s.y] : [-s.x, -s.y]);
export const fromView = (side, x, y) => (side === "home" ? [x, y] : [-x, -y]);

function Marker({ s, kit, sel, onClick }) {
  if (s.x == null) return null;
  const [x, y] = toView(s), c = kit.shirt, r = sel ? 0.75 : 0.55, sw = 0.14;
  const common = { onClick, style: onClick ? { cursor: "pointer" } : undefined };
  let shape;
  if (s.outcome === "goal") shape = <><circle cx={x} cy={y} r={r + 0.12} fill="var(--signal)" stroke="#111" strokeWidth={sw} /><circle cx={x} cy={y} r={r * 0.38} fill="#111" /></>;
  else if (s.outcome === "saved") shape = <circle cx={x} cy={y} r={r} fill={c} stroke="rgba(0,0,0,.6)" strokeWidth={sw} />;
  else if (s.outcome === "woodwork") shape = <><circle cx={x} cy={y} r={r} fill={c} stroke="rgba(0,0,0,.6)" strokeWidth={sw} /><circle cx={x} cy={y} r={r + 0.3} fill="none" stroke={c} strokeWidth={sw} /></>;
  else if (s.outcome === "blocked") shape = <path d={`M${x - r} ${y - r}L${x + r} ${y + r}M${x + r} ${y - r}L${x - r} ${y + r}`} stroke={c} strokeWidth={0.26} strokeLinecap="round" />;
  else shape = <circle cx={x} cy={y} r={r} fill="none" stroke={c} strokeWidth={0.22} />;
  return (
    <g {...common}>
      {sel && <circle cx={x} cy={y} r={r + 0.75} fill="none" stroke="var(--signal)" strokeWidth={0.16} />}
      {shape}
      <circle cx={x} cy={y} r={1} fill="transparent" />
    </g>
  );
}

export function ShotMap({ shots, kits, sel, onPick, onCourt, pending, label }) {
  const svg = useRef(null);
  const click = (e) => {
    if (!onCourt) return;
    const pt = svg.current.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.current.getScreenCTM().inverse());
    onCourt(Math.max(-20, Math.min(20, p.x)), Math.max(-10, Math.min(10, p.y)));
  };
  return (
    <div className="pitch" style={{ cursor: onCourt ? "crosshair" : undefined }}>
      <svg ref={svg} className="lines" viewBox="-21.2 -11.2 42.4 22.4" onClick={click} role={onCourt ? "button" : "img"} aria-label={label || "Karta udaraca"}>
        <CourtLines sw={0.12} />
        {shots.map((s) => <Marker key={s.id} s={s} kit={kits[s.side]} sel={sel === s.id} onClick={onPick ? (e) => { e.stopPropagation(); onPick(s); } : undefined} />)}
        {pending && pending.x != null && (() => { const [x, y] = toView(pending); return <g><circle cx={x} cy={y} r="0.8" fill="none" stroke="var(--signal)" strokeWidth="0.2" /><circle cx={x} cy={y} r="0.18" fill="var(--signal)" /></g>; })()}
      </svg>
    </div>
  );
}

export function ShotLegend() {
  const k = { shirt: "var(--muted)" };
  const items = ["goal", "saved", "woodwork", "off", "blocked"];
  return (
    <div className="zones" style={{ borderTop: 0, padding: "8px 0 0" }}>
      {items.map((o) => (
        <span key={o} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <svg width="16" height="16" viewBox="-1.2 -1.2 2.4 2.4" aria-hidden="true"><Marker s={{ x: 0, y: 0, side: "home", outcome: o }} kit={k} /></svg>{OUTCOMES[o]}
        </span>))}
    </div>
  );
}

export function shotStats(m) {
  const z = () => ({ shots: 0, on: 0, off: 0, blocked: 0, saves: 0, goals: 0 });
  const S = { home: z(), away: z() };
  for (const e of m.events) {
    if (e.type !== "shot") continue;
    const s = S[e.side], o = S[e.side === "home" ? "away" : "home"];
    s.shots++;
    if (e.outcome === "goal") { s.on++; s.goals++; }
    if (e.outcome === "saved") { s.on++; o.saves++; }
    if (e.outcome === "blocked") s.blocked++;
    if (e.outcome === "off" || e.outcome === "woodwork") s.off++;
  }
  return S;
}
