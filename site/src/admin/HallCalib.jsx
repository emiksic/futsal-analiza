// Kalibracija dvorane: klikanje točaka terena na panorami (mosaic.png iz scripts/mosaic.py).
// Panorama se otvara lokalno (ne šalje se nikamo). Čim su označene 4 točke, preko slike se crta teren
// izračunat iz tih točaka, pa se odmah vidi je li klik dobar. Rezultat: <dvorana>_points.json za scripts/calib2.py.
import { useEffect, useMemo, useRef, useState } from "react";
import { href } from "../lib/router.js";
import { update } from "../lib/store.js";

// x po dužini (lijevi gol = -L/2), y po širini (daleka aut-linija = -W/2, bliža kameri = +W/2)
const POINTS = [
  { id: "GL_F", name: "Lijevi gol, dalja stativa", hint: "Dno stative (gdje dodiruje pod), ona dalje od kamere.", at: (h, w) => [-h, -1.5] },
  { id: "GL_N", name: "Lijevi gol, bliža stativa", hint: "Dno stative bliže kameri.", at: (h, w) => [-h, 1.5] },
  { id: "GR_F", name: "Desni gol, dalja stativa", hint: "Dno stative dalje od kamere.", at: (h, w) => [h, -1.5] },
  { id: "GR_N", name: "Desni gol, bliža stativa", hint: "Dno stative bliže kameri.", at: (h, w) => [h, 1.5] },
  { id: "MF", name: "Središnja linija × daleka aut-linija", hint: "Gdje središnja linija dodiruje dalju uzdužnu liniju.", at: (h, w) => [0, -w] },
  { id: "C", name: "Središnja točka", hint: "Točka u sredini središnjeg kruga.", at: (h, w) => [0, 0] },
  { id: "MN", name: "Središnja linija × bliža aut-linija", hint: "Često izvan kadra (ispod slike), onda Preskoči.", at: (h, w) => [0, w] },
  { id: "FL", name: "Lijevi daleki kut", hint: "Kut terena: gol-linija i dalja aut-linija.", at: (h, w) => [-h, -w] },
  { id: "FR", name: "Desni daleki kut", hint: "Kut terena: gol-linija i dalja aut-linija.", at: (h, w) => [h, -w] },
  { id: "NL", name: "Lijevi bliži kut", hint: "Često izvan kadra, onda Preskoči.", at: (h, w) => [-h, w] },
  { id: "NR", name: "Desni bliži kut", hint: "Često izvan kadra, onda Preskoči.", at: (h, w) => [h, w] },
];
const MID = { id: "MID", name: "Bilo koja točka na središnjoj liniji", hint: "Dodatne točke duž središnje linije (koliko hoćeš) pomažu kad kutova nema." };

// ---------- homografija (DLT, najmanji kvadrati) ----------
function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]]; if (Math.abs(M[c][c]) < 1e-12) return null;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
function homography(src, dst) {            // src -> dst, >= 4 para
  if (src.length < 4) return null;
  const norm = (P) => { const mx = P.reduce((s, p) => s + p[0], 0) / P.length, my = P.reduce((s, p) => s + p[1], 0) / P.length;
    const d = P.reduce((s, p) => s + Math.hypot(p[0] - mx, p[1] - my), 0) / P.length || 1; const k = Math.SQRT2 / d;
    return { T: [k, 0, -k * mx, 0, k, -k * my, 0, 0, 1], P: P.map((p) => [(p[0] - mx) * k, (p[1] - my) * k]) }; };
  const S = norm(src), D = norm(dst);
  const AtA = Array.from({ length: 8 }, () => Array(8).fill(0)), Atb = Array(8).fill(0);
  S.P.forEach(([X, Y], i) => { const [u, v] = D.P[i];
    for (const [row, rhs] of [[[X, Y, 1, 0, 0, 0, -u * X, -u * Y], u], [[0, 0, 0, X, Y, 1, -v * X, -v * Y], v]])
      for (let r = 0; r < 8; r++) { Atb[r] += row[r] * rhs; for (let c = 0; c < 8; c++) AtA[r][c] += row[r] * row[c]; } });
  const h = solve(AtA, Atb); if (!h) return null;
  const Hn = [...h, 1];
  return mul(inv(D.T), mul(Hn, S.T));
}
function mul(A, B) { const C = Array(9).fill(0); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j]; return C; }
function inv(m) {
  const [a, b, c, d, e, f, g, h, i] = m, A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((x) => x / det);
}
const proj = (H, x, y) => { const w = H[6] * x + H[7] * y + H[8]; return w <= 1e-9 ? null : [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w]; };

// linije terena u metrima (futsal: luk 6 m od svake stative + ravni dio između, kazneni udarac 6 m i 10 m)
function courtLines(L, W) {
  const h = L / 2, w = W / 2, seg = (a, b, n = 40) => Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
  const out = [seg([-h, -w], [h, -w]), seg([h, -w], [h, w]), seg([h, w], [-h, w]), seg([-h, w], [-h, -w]), seg([0, -w], [0, w])];
  out.push(Array.from({ length: 65 }, (_, i) => [3 * Math.cos(i / 64 * 2 * Math.PI), 3 * Math.sin(i / 64 * 2 * Math.PI)]));
  for (const s of [-1, 1]) {
    const g = s * h, arc = [];
    for (let i = 0; i <= 20; i++) { const u = Math.PI / 2 * (1 - i / 20); arc.push([g - s * 6 * Math.cos(u), -1.5 - 6 * Math.sin(u)]); }
    for (let i = 0; i <= 20; i++) { const u = Math.PI / 2 * (i / 20); arc.push([g - s * 6 * Math.cos(u), 1.5 + 6 * Math.sin(u)]); }
    out.push(arc, seg([g, -1.5], [g + s, -1.5], 4), seg([g + s, -1.5], [g + s, 1.5], 4), seg([g + s, 1.5], [g, 1.5], 4));
  }
  return out;
}
const MARKS = (L) => [[0, 0], [-L / 2 + 6, 0], [L / 2 - 6, 0], [-L / 2 + 10, 0], [L / 2 - 10, 0]];

const LS = (id) => `calib-${id}`;
const loadDraft = (id) => { try { return JSON.parse(localStorage.getItem(LS(id)) || "null"); } catch { return null; } };
const saveDraft = (id, d) => { try { localStorage.setItem(LS(id), JSON.stringify(d)); } catch { /* */ } };

export function HallCalib({ db, id }) {
  const hall = db.halls.find((h) => h.id === id);
  const draft = useMemo(() => loadDraft(id), [id]);
  const [L, setL] = useState(draft?.L ?? 40), [W, setW] = useState(draft?.W ?? 20);
  const [pts, setPts] = useState(draft?.points ?? {});           // {GL_F: [x, y] | "skip"}
  const [mids, setMids] = useState(draft?.mids ?? []);
  const [cur, setCur] = useState(() => POINTS.find((p) => !(p.id in (draft?.points ?? {})))?.id ?? "MID");
  const [img, setImg] = useState(null), [imgName, setImgName] = useState("");
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const [showCourt, setShowCourt] = useState(true);
  const cv = useRef(null), wrap = useRef(null), drag = useRef(null);

  useEffect(() => { saveDraft(id, { L, W, points: pts, mids }); }, [id, L, W, pts, mids]);

  const pairs = POINTS.filter((p) => Array.isArray(pts[p.id])).map((p) => ({ p, img: pts[p.id], court: p.at(L / 2, W / 2) }));
  const Hc2i = useMemo(() => homography(pairs.map((q) => q.court), pairs.map((q) => q.img)), [JSON.stringify(pairs)]);
  const Hi2c = Hc2i ? inv(Hc2i) : null;
  const err = (q) => { if (!Hi2c || pairs.length < 5) return null; const c = proj(Hi2c, ...q.img); return c ? Math.hypot(c[0] - q.court[0], c[1] - q.court[1]) : null; };
  const midErr = (m) => { if (!Hi2c) return null; const c = proj(Hi2c, ...m); return c ? Math.abs(c[0]) : null; };

  const fit = (im) => { const r = wrap.current.getBoundingClientRect(); const s = Math.min(r.width / im.width, r.height / im.height);
    setView({ s, x: (r.width - im.width * s) / 2, y: (r.height - im.height * s) / 2 }); };
  const open = (f) => { if (!f) return; const u = URL.createObjectURL(f); const im = new Image();
    im.onload = () => { setImg(im); setImgName(f.name); fit(im); }; im.src = u; };

  // crtanje
  useEffect(() => {
    const c = cv.current; if (!c) return; const r = wrap.current.getBoundingClientRect(), d = devicePixelRatio || 1;
    c.width = r.width * d; c.height = r.height * d; const g = c.getContext("2d"); g.setTransform(d, 0, 0, d, 0, 0);
    g.fillStyle = "#0b1320"; g.fillRect(0, 0, r.width, r.height); if (!img) return;
    g.save(); g.translate(view.x, view.y); g.scale(view.s, view.s); g.imageSmoothingEnabled = view.s < 2; g.drawImage(img, 0, 0); g.restore();
    const T = (p) => [view.x + p[0] * view.s, view.y + p[1] * view.s];
    if (Hc2i && showCourt) {
      g.strokeStyle = "rgba(255, 214, 10, .9)"; g.lineWidth = 1.5;
      for (const line of courtLines(L, W)) { g.beginPath(); let pen = false;
        for (const q of line) { const p = proj(Hc2i, q[0], q[1]); if (!p) { pen = false; continue; } const [x, y] = T(p); pen ? g.lineTo(x, y) : g.moveTo(x, y); pen = true; }
        g.stroke(); }
      g.fillStyle = "rgba(255, 214, 10, .95)";
      for (const m of MARKS(L)) { const p = proj(Hc2i, m[0], m[1]); if (p) { const [x, y] = T(p); g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); } }
    }
    const dot = (p, label, active, col) => { const [x, y] = T(p);
      g.strokeStyle = "#000"; g.lineWidth = 4; g.beginPath(); g.moveTo(x - 9, y); g.lineTo(x + 9, y); g.moveTo(x, y - 9); g.lineTo(x, y + 9); g.stroke();
      g.strokeStyle = col; g.lineWidth = 2; g.stroke();
      g.font = "600 12px Roboto, sans-serif"; g.lineWidth = 3; g.strokeStyle = "#000"; g.strokeText(label, x + 8, y - 8); g.fillStyle = active ? "#ffd60a" : "#fff"; g.fillText(label, x + 8, y - 8); };
    for (const q of pairs) { const e = err(q); dot(q.img, q.p.id, q.p.id === cur, e == null ? "#5ad1ff" : e < 0.3 ? "#3cbf75" : e < 0.7 ? "#f5c430" : "#f0625a"); }
    for (const m of mids) dot(m, "", false, "#c07cff");
  }, [img, view, pts, mids, cur, L, W, showCourt, Hc2i]);

  useEffect(() => { const f = () => img && setView((v) => ({ ...v })); addEventListener("resize", f); return () => removeEventListener("resize", f); }, [img]);

  const toImg = (e) => { const r = cv.current.getBoundingClientRect(); return [(e.clientX - r.left - view.x) / view.s, (e.clientY - r.top - view.y) / view.s]; };
  const nextAfter = (k, P) => POINTS.find((p, i) => i > POINTS.findIndex((q) => q.id === k) && !(p.id in P))?.id ?? POINTS.find((p) => !(p.id in P))?.id ?? "MID";
  const place = (p) => {
    const xy = [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];
    if (cur === "MID") { setMids((m) => [...m, xy]); return; }
    const P = { ...pts, [cur]: xy }; setPts(P); setCur(nextAfter(cur, P));
  };
  const skip = () => { if (cur === "MID") return; const P = { ...pts, [cur]: "skip" }; setPts(P); setCur(nextAfter(cur, P)); };
  const clear = (k) => { const P = { ...pts }; delete P[k]; setPts(P); setCur(k); };

  const onDown = (e) => { if (e.button === 1 || e.button === 2 || e.shiftKey) { drag.current = { x: e.clientX, y: e.clientY, v: view, moved: false }; e.preventDefault(); return; }
    drag.current = { x: e.clientX, y: e.clientY, v: view, moved: false, click: true }; };
  const onMove = (e) => { const d = drag.current; if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.hypot(dx, dy) > 4) d.moved = true; if (d.moved) setView({ ...d.v, x: d.v.x + dx, y: d.v.y + dy }); };
  const onUp = (e) => { const d = drag.current; drag.current = null; if (d?.click && !d.moved && img) place(toImg(e)); };
  const onWheel = (e) => { if (!img) return; e.preventDefault(); const r = cv.current.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const k = Math.exp(-e.deltaY * 0.0015), s = Math.min(16, Math.max(0.05, view.s * k)); const f = s / view.s;
    setView({ s, x: mx - (mx - view.x) * f, y: my - (my - view.y) * f }); };
  useEffect(() => { const c = cv.current; if (!c) return; c.addEventListener("wheel", onWheel, { passive: false }); return () => c.removeEventListener("wheel", onWheel); });

  useEffect(() => {
    const k = (e) => { if (e.target.tagName === "INPUT") return;
      if (e.key === "s" || e.key === "S") skip();
      else if (e.key === "Backspace" || e.key === "Delete") { if (cur === "MID") setMids((m) => m.slice(0, -1)); else if (cur in pts) clear(cur); }
      else if (e.key === "m" || e.key === "M") setCur("MID");
      else if (e.key === "c" || e.key === "C") setShowCourt((x) => !x);
      else if (e.key === "0" && img) fit(img); };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  });

  const nGood = pairs.length;
  const errs = pairs.map(err).filter((x) => x != null);
  const out = { hall: id, image: imgName, L, W, points: [...pairs.map((q) => ({ label: q.p.id, x: q.img[0], y: q.img[1], canvas: true })),
    ...mids.map((m) => ({ label: "MID", x: m[0], y: m[1], canvas: true }))] };
  const download = () => { const b = new Blob([JSON.stringify(out, null, 1)], { type: "application/json" }); const a = document.createElement("a");
    a.href = URL.createObjectURL(b); a.download = `${id}_points.json`; a.click(); };
  const reset = () => { if (confirm("Obrisati sve točke za ovu dvoranu?")) { setPts({}); setMids([]); setCur(POINTS[0].id); } };
  const curP = cur === "MID" ? MID : POINTS.find((p) => p.id === cur);

  if (!hall) return <div className="panel empty">Nema dvorane {id}.</div>;
  return (
    <>
      <div className="ahead"><h1>Kalibracija: {hall.name}</h1>
        <div className="r"><a className="btn" href={href("admin", "dvorane")}>Natrag</a></div></div>
      <section className="panel calib">
        <div className="calib-grid">
          <div className="calib-stage" ref={wrap} onContextMenu={(e) => e.preventDefault()}>
            {!img && <label className="calib-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); open(e.dataTransfer.files[0]); }}>
              <b>Otvori panoramu</b>
              <span>mosaic.png iz scripts/mosaic.py (npr. run\trsat\mosaic.png). Ostaje na tvom računalu, ne šalje se nikamo.</span>
              <input type="file" accept="image/*" onChange={(e) => open(e.target.files[0])} />
            </label>}
            <canvas ref={cv} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} style={{ cursor: img ? "crosshair" : "default" }} />
          </div>
          <aside className="calib-side">
            <div className="calib-now">
              <small className="muted">Sada klikni</small>
              <b>{curP.name}</b>
              <span className="small muted">{curP.hint}</span>
              <CourtMini L={L} W={W} cur={cur} pts={pts} />
              <div className="calib-actions">
                {cur !== "MID" && <button className="btn sm" onClick={skip}>Preskoči (S)</button>}
                <button className="btn sm" onClick={() => setCur("MID")} aria-pressed={cur === "MID"}>Središnja linija (M)</button>
              </div>
            </div>
            <ol className="calib-list">
              {POINTS.map((p) => { const v = pts[p.id], q = pairs.find((x) => x.p.id === p.id), e = q ? err(q) : null;
                return <li key={p.id} aria-current={cur === p.id ? "step" : undefined}>
                  <button className="calib-item" onClick={() => setCur(p.id)}>
                    <span className="calib-id">{p.id}</span><span className="calib-name">{p.name}</span>
                    <span className={"calib-st " + (v === "skip" ? "skip" : e == null ? "" : e < 0.3 ? "ok" : e < 0.7 ? "mid" : "bad")}>
                      {v === "skip" ? "preskočeno" : Array.isArray(v) ? (e == null ? "✓" : `${Math.round(e * 100)} cm`) : ""}</span>
                  </button>
                  {v != null && <button className="btn ghost sm" onClick={() => clear(p.id)} aria-label={`Obriši ${p.id}`}>×</button>}
                </li>; })}
              <li aria-current={cur === "MID" ? "step" : undefined}>
                <button className="calib-item" onClick={() => setCur("MID")}><span className="calib-id">MID</span><span className="calib-name">Točke na središnjoj liniji</span>
                  <span className="calib-st">{mids.length ? `${mids.length}` : ""}{mids.length && Hi2c ? ` · ${Math.round(Math.max(...mids.map(midErr)) * 100)} cm` : ""}</span></button>
                {mids.length > 0 && <button className="btn ghost sm" onClick={() => setMids([])} aria-label="Obriši točke središnje linije">×</button>}
              </li>
            </ol>
            <div className="calib-dims">
              <label className="field"><span>Dužina (m)</span><input className="input sm" type="number" step="0.5" value={L} onChange={(e) => setL(+e.target.value || 40)} /></label>
              <label className="field"><span>Širina (m)</span><input className="input sm" type="number" step="0.5" value={W} onChange={(e) => setW(+e.target.value || 20)} /></label>
            </div>
            <div className="small">
              {nGood < 4 ? <span className="muted">Još {4 - nGood} točke do prvog crtanja terena.</span>
                : errs.length ? <span>Najveća greška: <b>{Math.round(Math.max(...errs) * 100)} cm</b> (do 30 cm je dobro). Žute linije moraju sjesti na linije na podu.</span>
                : <span>Teren je nacrtan. S 5+ točaka vidiš i grešku po točki.</span>}
            </div>
            <div className="calib-actions">
              <button className="btn primary" disabled={nGood < 4} onClick={download}>Preuzmi točke</button>
              <button className="btn sm" onClick={() => setShowCourt((x) => !x)}>{showCourt ? "Sakrij teren (C)" : "Prikaži teren (C)"}</button>
              <button className="btn sm danger" onClick={reset}>Ispočetka</button>
            </div>
            <label className="tg small"><input type="checkbox" checked={!!hall.calibrated} onChange={(e) => update((d) => { d.halls.find((h) => h.id === id).calibrated = e.target.checked; })} /> Dvorana je kalibrirana (calib2.py je prošao)</label>
            <details className="small">
              <summary>Upute i tipke</summary>
              <ul className="calib-help">
                <li>Klik postavi točku i prelazi na sljedeću. Kotačić zumira, desni klik / Shift + povlačenje pomiče sliku, <kbd>0</kbd> vrati prikaz.</li>
                <li>Uvijek klikaj točku <b>na podu</b>: dno stative, sjecište sredina linija. Zumiraj prije klika.</li>
                <li>Najvažnije su 4 stative + središnja linija. Kutove koji se ne vide preskoči (<kbd>S</kbd>).</li>
                <li><kbd>Backspace</kbd> briše trenutnu točku, <kbd>M</kbd> dodaje točke središnje linije, <kbd>C</kbd> pali/gasi teren.</li>
                <li>Boja točke: zeleno &lt; 30 cm, žuto &lt; 70 cm, crveno više. Crvena točka je obično krivo kliknuta ili krivo imenovana.</li>
                <li>Zatim: <code>python scripts/calib2.py run\…\clip.mp4 {id}_points.json run\…\camera_global.json run\…\seg.json run\…\mosaic_S.npy run\…\court.json --arcs-mosaic</code></li>
              </ul>
            </details>
          </aside>
        </div>
      </section>
    </>
  );
}

function CourtMini({ L, W, cur, pts }) {
  const pad = 6, sc = 200 / L, w = L * sc + 2 * pad, h = W * sc + 2 * pad + 9;
  const X = (x) => pad + (x + L / 2) * sc, Y = (y) => pad + (y + W / 2) * sc;
  return (
    <svg className="calib-mini" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Skica terena s označenom točkom">
      <rect x={X(-L / 2)} y={Y(-W / 2)} width={L * sc} height={W * sc} className="cm-court" />
      <line x1={X(0)} y1={Y(-W / 2)} x2={X(0)} y2={Y(W / 2)} className="cm-line" />
      <circle cx={X(0)} cy={Y(0)} r={3 * sc} className="cm-line" fill="none" />
      {[-1, 1].map((s) => <path key={s} className="cm-line" fill="none"
        d={`M${X(s * L / 2)} ${Y(-7.5)} A${6 * sc} ${6 * sc} 0 0 ${s < 0 ? 1 : 0} ${X(s * (L / 2 - 6))} ${Y(-1.5)} L${X(s * (L / 2 - 6))} ${Y(1.5)} A${6 * sc} ${6 * sc} 0 0 ${s < 0 ? 1 : 0} ${X(s * L / 2)} ${Y(7.5)}`} />)}
      <text x={X(0)} y={h - 1} className="cm-txt">kamera</text>
      {[...POINTS, { id: "MID", at: () => [0, -W / 4] }].map((p) => { const [x, y] = p.at(L / 2, W / 2), on = p.id === cur, done = Array.isArray(pts[p.id]);
        return <circle key={p.id} cx={X(x)} cy={Y(y)} r={on ? 5 : 3} className={on ? "cm-cur" : done ? "cm-done" : "cm-todo"} />; })}
    </svg>
  );
}
