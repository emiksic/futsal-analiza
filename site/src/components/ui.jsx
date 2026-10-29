import { href } from "../lib/router.js";

// Dres u bojama kluba — zamjena za grb (grbove ne prenosimo).
export function Jersey({ kit, size = 28, num, title }) {
  const k = kit || { shirt: "#cfd6de", trim: "#8995a3", num: "#111" };
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <path d="M13 4.5 7.5 6.6 1.8 12.6l4.6 6.6 3.8-2.7V36.5h19.6V16.5l3.8 2.7 4.6-6.6-5.7-6-5.5-2.1Q20 9.5 13 4.5Z"
        fill={k.shirt} stroke="rgba(0,0,0,.32)" strokeWidth="1" strokeLinejoin="round" />
      <path d="M1.8 12.6 6.4 19.2l2.4-1.7L4.2 11Z M38.2 12.6 33.6 19.2l-2.4-1.7L35.8 11Z" fill={k.trim} />
      <path d="M13 4.5Q20 9.5 27 4.5" fill="none" stroke={k.trim} strokeWidth="2.2" />
      {num != null && <text x="20" y="29.5" textAnchor="middle" fontFamily="'Roboto Condensed', 'Arial Narrow', sans-serif" fontWeight="700"
        fontSize={String(num).length > 1 ? 13 : 15} fill={k.num}>{num}</text>}
    </svg>
  );
}

export function LeagueBadge({ league, big }) {
  const cls = league.category === "U-19" ? "u19" : league.category === "U-17" ? "u17" : "";
  const txt = league.category === "Seniori" ? "1." : league.category.replace("U-", "U");
  return <span className={`lg-badge ${cls}`} style={big ? { width: 52, height: 52, fontSize: 20, borderRadius: 12 } : undefined} aria-hidden="true">{txt}</span>;
}

export function Form({ items }) {
  const T = { W: "P", D: "N", L: "I" }, L = { W: "Pobjeda", D: "Neriješeno", L: "Poraz" };
  return <span className="form">{items.map((f, i) => <a key={i} href={href("utakmica", f.m)} className={f.r} title={L[f.r]}>{T[f.r]}</a>)}</span>;
}

export const Icon = {
  ball: (s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="var(--surface)" stroke="currentColor" strokeWidth="1.6" />
      <path d="m12 7.2 3.6 2.6-1.4 4.2H9.8L8.4 9.8Z" fill="currentColor" /><path d="M12 7.2V2.4M15.6 9.8l4.4-1.6M14.2 14l2.7 3.8M9.8 14l-2.7 3.8M8.4 9.8 4 8.2" stroke="currentColor" strokeWidth="1.3" /></svg>),
  video: (s = 16) => (
    <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="13" height="12" rx="2.5" fill="currentColor" /><path d="m17 10 4.5-2.6v9.2L17 14Z" fill="currentColor" /></svg>),
  play: (s = 22) => (<svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5Z" fill="currentColor" /></svg>),
  pause: (s = 22) => (<svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z" fill="currentColor" /></svg>),
  whistle: (s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10h9.5l1.5-2h7v4.5h-4.2A6.5 6.5 0 1 1 3 10Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><circle cx="9" cy="14.3" r="2" fill="currentColor" /></svg>),
  timeout: (s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M12 9v4.5l3 2M9.5 2.5h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" fill="none" /></svg>),
  chevL: (s = 16) => (<svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>),
  chevR: (s = 16) => (<svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>),
  plus: (s = 16) => (<svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>),
  trash: (s = 16) => (<svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>),
  swap: (s = 16) => (<svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>),
  ext: (s = 14) => (<svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>),
};

export function Brand({ name }) {
  // znak: luk kaznenog prostora (6 m) i lopta
  return (
    <a className="brand" href="#/">
      <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
        <rect x="0.5" y="0.5" width="29" height="29" rx="7" fill="var(--band-2)" />
        <path d="M4 5v20M4 9.5a9.5 6 0 0 1 9.5 5.5A9.5 6 0 0 1 4 20.5" fill="none" stroke="var(--band-fg)" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="21.5" cy="15" r="4" fill="var(--signal)" />
      </svg>
      {name || "Futsal statistika"}
    </a>
  );
}

// Linije futsal terena u metrima, ishodište u sredini. Luk kaznenog prostora = 6 m od stativa.
export function CourtLines({ L = 40, W = 20, D = 6, stroke = "var(--court-line)", box = "var(--court-box)", sw = 0.12 }) {
  const l = L / 2, w = W / 2;
  const arc = (s) => { const g = s * l;
    return `M${g} ${-1.5 - D} A${D} ${D} 0 0 ${s > 0 ? 0 : 1} ${g - s * D} -1.5 L${g - s * D} 1.5 A${D} ${D} 0 0 ${s > 0 ? 0 : 1} ${g} ${1.5 + D}`; };
  return (
    <g fill="none" stroke={stroke} strokeWidth={sw}>
      <path d={arc(1) + ` Z`} fill={box} stroke="none" />
      <path d={arc(-1) + ` Z`} fill={box} stroke="none" />
      <rect x={-l} y={-w} width={L} height={W} />
      <line x1="0" y1={-w} x2="0" y2={w} />
      <circle cx="0" cy="0" r="3" />
      <path d={arc(1)} /><path d={arc(-1)} />
      <path d={`M${l} -1.5h1v3h-1M${-l} -1.5h-1v3h1`} />
      {[-1, 1].map((s) => [6, 10].map((d) => <circle key={s + "" + d} cx={s * (l - d)} cy="0" r={sw * 1.3} fill={stroke} />))}
      <circle cx="0" cy="0" r={sw * 1.3} fill={stroke} />
    </g>
  );
}

export function Toast({ msg }) { return msg ? <div className="toast" role="status">{msg}</div> : null; }

export function analysisPill(a) {
  const s = a?.status || "none"; if (s === "none") return null;
  const L = { queued: "Čeka obradu", processing: "U obradi", done: "Analiza", failed: "Greška" };
  return <span className={`pill ${s}`}>{s === "processing" && <i />}{L[s]}</span>;
}
