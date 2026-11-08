// Graf mjesta po kolima (kao "standings tracker"): 1. mjesto gore, x os = kola.
// series: [{ id, name, color, pts: [mjesto po kolu], faint? }]
export const POS_COLORS = ["#6c8cff", "#3fbf6a", "#e9a23b", "#d562b4", "#2bb5c9"];
// različita boja za svaki klub (i do 12 klubova): ravnomjerno raspoređene nijanse, naizmjence svjetlije i tamnije
export const clubColor = (i, n) => `hsl(${Math.round((i * 360) / Math.max(n, 1) + 220) % 360} ${i % 2 ? 62 : 75}% ${i % 2 ? 48 : 60}%)`;

export function PosChart({ series, played, n, zones = {}, height = 240 }) {
  const W = 640, H = height, L = 30, R = 12, T = 12, B = 26;
  const x = (i) => L + (played.length > 1 ? (i / (played.length - 1)) * (W - L - R) : (W - L - R) / 2);
  const y = (p) => T + ((p - 1) / Math.max(1, n - 1)) * (H - T - B);
  // vodoravne crte: 1., zadnje i granice zona (doigravanje / ispadanje)
  const lines = [...new Set([1, n, zones.playoff, zones.direct, zones.relegation ? n - zones.relegation + 1 : null].filter((v) => v && v >= 1 && v <= n))];
  return (
    <svg className="poschart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Mjesto na tablici po kolima">
      {lines.map((p) => (
        <g key={p}>
          <line x1={L} x2={W - R} y1={y(p)} y2={y(p)} className="pc-grid" />
          <text x={L - 8} y={y(p) + 4} className="pc-ax" textAnchor="end">{p}</text>
        </g>))}
      {played.map((r, i) => <text key={r} x={x(i)} y={H - 6} className="pc-ax" textAnchor="middle">{r}</text>)}
      {[...series].sort((a, b) => (b.faint ? 1 : 0) - (a.faint ? 1 : 0)).map((s) => (
        <g key={s.id} className={s.faint ? "pc-faint" : ""}>
          <polyline fill="none" stroke={s.color} strokeWidth={s.faint ? 1.5 : 2.5} strokeLinejoin="round" strokeLinecap="round"
            points={s.pts.map((p, i) => `${x(i)},${y(p)}`).join(" ")} />
          {!s.faint && s.pts.map((p, i) => (
            <circle key={i} cx={x(i)} cy={y(p)} r={3.5} fill={s.color}><title>{`${s.name}, ${played[i]}. kolo: ${p}. mjesto`}</title></circle>))}
        </g>))}
    </svg>
  );
}
