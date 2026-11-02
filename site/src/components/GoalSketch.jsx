// Skica gola (kao Sofascore): dodavač -> strijelac -> gol, ravnim linijama, s animacijom lopte.
// map = { s: [x, y], a: [x, y] | null } u metrima na terenu 40 x 20, ishodište u centru, ekipa uvijek napada desni gol (x = +20).
// U adminu (onChange): prvi klik = strijelac, drugi = dodavač (neobavezno), treći klik kreće ispočetka.
import { useEffect, useRef, useState } from "react";

const LL = 40, WW = 20;
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function GoalSketch({ map, color = "var(--primary)", onChange, width = 132 }) {
  const edit = !!onChange;
  const [run, setRun] = useState(0);                // svaki klik ponovno pokrene animaciju
  const ref = useRef(null);
  useEffect(() => {                                  // pokreni jednom kad skica dođe u vidno polje
    if (edit || !map || reduced() || !ref.current || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setRun((r) => r || 1); io.disconnect(); } }, { threshold: 0.6 });
    io.observe(ref.current); return () => io.disconnect();
  }, [edit, map]);
  const half = !edit && map && map.s[0] >= -1 && (!map.a || map.a[0] >= -1);     // sve u napadačkoj polovini -> uvećaj
  const x0 = half ? -1 : -LL / 2 - 1, x1 = LL / 2 + 1.6, y0 = -WW / 2 - 1, h = WW + 2;
  const g = map ? [LL / 2 + 0.6, Math.max(-1.2, Math.min(1.2, map.s[1] * 0.12))] : null;
  const click = (ev) => {
    if (!edit) { if (map && !reduced()) setRun((r) => r + 1); return; }
    const r = ev.currentTarget.getBoundingClientRect();
    const x = +(x0 + (ev.clientX - r.left) / r.width * (x1 - x0)).toFixed(1), y = +(y0 + (ev.clientY - r.top) / r.height * h).toFixed(1);
    if (!map || map.a) onChange({ s: [x, y], a: null });
    else onChange({ ...map, a: [x, y] });
  };
  const line = "var(--court-line, #fff)";
  // trajanje: dodavanje ~0.9 s + udarac ~0.6 s, brzina po dužini dionice
  const d1 = map?.a ? Math.hypot(map.s[0] - map.a[0], map.s[1] - map.a[1]) : 0, d2 = map ? Math.hypot(g[0] - map.s[0], g[1] - map.s[1]) : 0;
  const tp = map?.a ? Math.min(1.2, 0.35 + d1 * 0.06) : 0, ts = Math.min(0.8, 0.25 + d2 * 0.03), T = tp + ts;
  const anim = !edit && run > 0;
  const path = map ? (map.a ? `M${map.a[0]},${map.a[1]} L${map.s[0]},${map.s[1]} L${g[0]},${g[1]}` : `M${map.s[0]},${map.s[1]} L${g[0]},${g[1]}`) : "";
  return (
    <svg ref={ref} viewBox={`${x0} ${y0} ${x1 - x0} ${h}`} width={edit ? 360 : width}
      style={{ display: "block", background: "var(--court, #2f6b3f)", borderRadius: 4, cursor: edit ? "crosshair" : map ? "pointer" : "default", maxWidth: "100%" }}
      onClick={click} role="img" aria-label={edit ? "Skica gola: klikni mjesto udarca, pa dodavača" : "Skica gola: dodavanje, udarac i gol. Klikni za animaciju."}>
      <g fill="none" stroke={line} strokeWidth={half ? 0.12 : 0.18} opacity=".8">
        <rect x={-LL / 2} y={-WW / 2} width={LL} height={WW} />
        <line x1="0" y1={-WW / 2} x2="0" y2={WW / 2} /><circle r="3" />
        {[-1, 1].map((s) => <path key={s} d={`M${s * LL / 2},${-1.58 - 6} A6,6 0 0 ${s > 0 ? 0 : 1} ${s * (LL / 2 - 6)},-1.58 L${s * (LL / 2 - 6)},1.58 A6,6 0 0 ${s > 0 ? 0 : 1} ${s * LL / 2},${1.58 + 6}`} />)}
        <rect x={LL / 2} y="-1.5" width="1" height="3" strokeWidth="0.25" /><rect x={-LL / 2 - 1} y="-1.5" width="1" height="3" strokeWidth="0.25" />
      </g>
      {map && <g key={run} strokeLinecap="round">
        {map.a && <line x1={map.a[0]} y1={map.a[1]} x2={map.s[0]} y2={map.s[1]} stroke={line} strokeWidth="0.3" strokeDasharray="0.8 0.6" opacity={anim ? 0 : 1}>
          {anim && <animate attributeName="opacity" from="0" to="1" begin="0s" dur={`${tp}s`} fill="freeze" />}</line>}
        <line x1={map.s[0]} y1={map.s[1]} x2={g[0]} y2={g[1]} stroke="var(--signal, #ffcc33)" strokeWidth="0.4" strokeDasharray={anim ? `${d2} ${d2}` : undefined} strokeDashoffset={anim ? d2 : undefined}>
          {anim && <animate attributeName="stroke-dashoffset" from={d2} to="0" begin={`${tp}s`} dur={`${ts}s`} fill="freeze" />}</line>
        {map.a && <circle cx={map.a[0]} cy={map.a[1]} r="0.9" fill="none" stroke={color} strokeWidth="0.45" />}
        <circle cx={map.s[0]} cy={map.s[1]} r="1" fill={color} stroke="#000" strokeWidth="0.15" />
        {anim && <circle r="0.55" fill="#fff" stroke="#000" strokeWidth="0.12">
          <animateMotion path={path} begin="0s" dur={`${T}s`} fill="freeze" calcMode="linear" keyPoints={map.a ? `0;${(d1 / (d1 + d2)).toFixed(3)};1` : "0;1"} keyTimes={map.a ? `0;${(tp / T).toFixed(3)};1` : "0;1"} />
          <animate attributeName="opacity" from="1" to="0" begin={`${T + 0.4}s`} dur="0.4s" fill="freeze" /></circle>}
      </g>}
      {edit && !map && <text x={(x0 + x1) / 2} y="0" fill="#fff" fontSize="1.6" textAnchor="middle" dominantBaseline="middle">Klikni gdje je pucao strijelac (napad je udesno)</text>}
    </svg>
  );
}
