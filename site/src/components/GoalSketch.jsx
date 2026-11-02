// Skica gola (kao Sofascore): dodavač -> strijelac -> gol, ravnim linijama.
// map = { s: [x, y], a: [x, y] | null } u metrima na terenu 40 x 20, ishodište u centru, ekipa uvijek napada desni gol (x = +20).
// U adminu (onChange): prvi klik = strijelac, drugi = dodavač (neobavezno), treći klik kreće ispočetka.
const LL = 40, WW = 20;

export function GoalSketch({ map, color = "var(--primary)", onChange, width = 132 }) {
  const edit = !!onChange;
  const half = !edit && map && map.s[0] >= -1 && (!map.a || map.a[0] >= -1);     // sve u napadačkoj polovini -> uvećaj
  const x0 = half ? -1 : -LL / 2 - 1, x1 = LL / 2 + 1.6, y0 = -WW / 2 - 1, h = WW + 2;
  const g = map ? [LL / 2, Math.max(-1.2, Math.min(1.2, map.s[1] * 0.12))] : null;
  const click = (ev) => {
    const r = ev.currentTarget.getBoundingClientRect();
    const x = +(x0 + (ev.clientX - r.left) / r.width * (x1 - x0)).toFixed(1), y = +(y0 + (ev.clientY - r.top) / r.height * h).toFixed(1);
    if (!map || map.a) onChange({ s: [x, y], a: null });
    else onChange({ ...map, a: [x, y] });
  };
  const line = "var(--court-line, #fff)";
  return (
    <svg viewBox={`${x0} ${y0} ${x1 - x0} ${h}`} width={edit ? 360 : width} style={{ display: "block", background: "var(--court, #2f6b3f)", borderRadius: 4, cursor: edit ? "crosshair" : "default", maxWidth: "100%" }}
      onClick={edit ? click : undefined} role="img" aria-label="Skica gola: dodavanje, udarac i gol">
      <g fill="none" stroke={line} strokeWidth={half ? 0.12 : 0.18} opacity=".8">
        <rect x={-LL / 2} y={-WW / 2} width={LL} height={WW} />
        <line x1="0" y1={-WW / 2} x2="0" y2={WW / 2} /><circle r="3" />
        {[-1, 1].map((s) => <path key={s} d={`M${s * LL / 2},${-1.58 - 6} A6,6 0 0 ${s > 0 ? 0 : 1} ${s * (LL / 2 - 6)},-1.58 L${s * (LL / 2 - 6)},1.58 A6,6 0 0 ${s > 0 ? 0 : 1} ${s * LL / 2},${1.58 + 6}`} />)}
        <rect x={LL / 2} y="-1.5" width="1" height="3" strokeWidth="0.25" /><rect x={-LL / 2 - 1} y="-1.5" width="1" height="3" strokeWidth="0.25" />
      </g>
      {map && <g strokeLinecap="round">
        {map.a && <line x1={map.a[0]} y1={map.a[1]} x2={map.s[0]} y2={map.s[1]} stroke={line} strokeWidth="0.3" strokeDasharray="0.8 0.6" />}
        <line x1={map.s[0]} y1={map.s[1]} x2={g[0]} y2={g[1]} stroke="var(--signal, #ffcc33)" strokeWidth="0.4" />
        {map.a && <circle cx={map.a[0]} cy={map.a[1]} r="0.9" fill="none" stroke={color} strokeWidth="0.45" />}
        <circle cx={map.s[0]} cy={map.s[1]} r="1" fill={color} stroke="#000" strokeWidth="0.15" />
      </g>}
      {edit && !map && <text x={(x0 + x1) / 2} y="0" fill="#fff" fontSize="1.6" textAnchor="middle" dominantBaseline="middle">Klikni gdje je pucao strijelac (napad je udesno)</text>}
    </svg>
  );
}
