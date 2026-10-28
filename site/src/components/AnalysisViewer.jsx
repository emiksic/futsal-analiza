// Preglednik analize, dva načina:
//  mode="embed"   – YouTube player (bez ičega preko njega) + panel i mini-mapa sinkronizirani s playerom. Zadano.
//  mode="overlay" – vlastiti video s oznakama nacrtanim u pregledniku; samo uz pisanu dozvolu vlasnika prijenosa.
// Podaci: izlaz export_web.py. ytOffset = sekunda YouTube videa koja odgovara t=0 u podacima.
import { useEffect, useRef } from "react";
import { Icon } from "./ui.jsx";

export function courtPolys(c) {
  const L = c.L / 2, W = c.W / 2, Dp = c.D, P = [];
  P.push([[-L, -W], [L, -W], [L, W], [-L, W], [-L, -W]]);
  P.push([[0, -W], [0, W]]);
  for (const s of [-1, 1]) {
    const g = s * L, arc = [];
    for (let i = 0; i <= 16; i++) { const a = Math.PI / 2 * (1 - i / 16); arc.push([g - s * Dp * Math.cos(a), -1.5 - Dp * Math.sin(a)]); }
    for (let i = 0; i <= 16; i++) { const a = Math.PI / 2 * (i / 16); arc.push([g - s * Dp * Math.cos(a), 1.5 + Dp * Math.sin(a)]); }
    P.push(arc);
    P.push([[g, -1.5], [g + s, -1.5], [g + s, 1.5], [g, 1.5]]);
  }
  const circ = []; for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2; circ.push([3 * Math.cos(a), 3 * Math.sin(a)]); }
  P.push(circ);
  return P.map((poly) => { const out = []; for (let i = 0; i < poly.length - 1; i++)
    for (let k = 0; k < 12; k++) { const u = k / 12; out.push([poly[i][0] + (poly[i + 1][0] - poly[i][0]) * u, poly[i][1] + (poly[i + 1][1] - poly[i][1]) * u]); }
  out.push(poly[poly.length - 1]); return out; });
}
export const textOn = (hex) => { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#111" : "#fff"; };
const fmt = (s) => { s = Math.max(0, s); return Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0"); };

let ytReady = null;
function loadYT() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!ytReady) ytReady = new Promise((res, rej) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); res(window.YT); };
    const sc = document.createElement("script"); sc.src = "https://www.youtube.com/iframe_api"; sc.onerror = rej;
    document.head.appendChild(sc); setTimeout(() => rej(new Error("timeout")), 8000);
  });
  return ytReady;
}
export function ytIdOf(url) {
  const m = /(?:youtu\.be\/|v=|embed\/|live\/|shorts\/)([\w-]{11})/.exec(url || ""); return m ? m[1] : null;
}

export function AnalysisViewer({ D, video, order, names, note, youtube, mode = "embed", ytOffset = 0, perPlayer = true }) {
  const embed = mode === "embed";
  const ytId = ytIdOf(youtube);
  const root = useRef(null);
  useEffect(() => {
    if (!D) return;
    const el = root.current, $ = (k) => el.querySelector(`[data-k="${k}"]`);
    const vid = $("vid"), ov = $("ov"), mini = $("mini");
    const octx = ov ? ov.getContext("2d") : null, mctx = mini.getContext("2d");
    let yt = null;
    const clk = embed
      ? { t: () => (yt?.getCurrentTime ? yt.getCurrentTime() - ytOffset : D.frames[0].t), paused: () => !(yt?.getPlayerState && yt.getPlayerState() === 1),
          seek: (x) => yt?.seekTo && yt.seekTo(x + ytOffset, true) }
      : { t: () => vid.currentTime || 0, paused: () => vid.paused, seek: (x) => { vid.currentTime = x; } };
    const polys = courtPolys(D.court);
    let highlight = null, dur = 0, seeking = false, lastL = -1, lastHL = null, raf = 0, alive = true;
    const css = (n) => getComputedStyle(el).getPropertyValue(n).trim();
    const frameAt = (t) => { const F = D.frames; let lo = 0, hi = F.length - 1;
      if (t <= F[0].t) return 0; if (t >= F[hi].t) return hi;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (F[m].t <= t) lo = m; else hi = m; }
      return (t - F[lo].t) < (F[hi].t - t) ? lo : hi; };
    const proj = (H, x, y) => { const w = H[6] * x + H[7] * y + 1; if (w <= 1e-6) return null; return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w]; };
    const fit = (cv) => { const r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(r.width * d)), h = Math.max(1, Math.round(r.height * d));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } return { w, h }; };
    const T = D.teams;

    // posjed
    $("pa").style.background = T[order[0]].color; $("pb").style.background = T[order[1]].color;
    $("pa").style.color = textOn(T[order[0]].color); $("pb").style.color = textOn(T[order[1]].color);

    function bands() {
      const band = $("band"); band.querySelectorAll(".stopseg").forEach((e) => e.remove());
      const F = D.frames; let s = null;
      const add = (a, b) => { const d = document.createElement("div"); d.className = "stopseg";
        d.style.left = (a / dur * 100) + "%"; d.style.width = ((b - a) / dur * 100) + "%"; band.prepend(d); };
      for (const f of F) { if (!f.live && s === null) s = f.t; if (f.live && s !== null) { add(s, f.t); s = null; } }
      if (s !== null) add(s, F[F.length - 1].t);
    }
    function lineup(f) {
      if (f.L === lastL && highlight === lastHL) return;
      lastL = f.L; lastHL = highlight;
      const st = f.L != null ? D.states[f.L] : [[[], []], [[], []]];
      $("lineup").innerHTML = order.map((ti, k) => {
        const t = T[ti], on = st[0][ti] || [], uns = new Set(st[1][ti] || []);
        const btns = on.map((n) => { const key = t.name + " " + n;
          return `<button class="numb${uns.has(n) ? " unseen" : ""}" style="--tc:${t.color};--tb:${textOn(t.color) === "#111" ? "var(--muted)" : t.color}" data-p="${key}" aria-pressed="${highlight === key}"
            title="${uns.has(n) ? "Na terenu, trenutno nije u kadru" : "Na terenu"}">${n}</button>`; }).join("");
        return `<div class="lrow"><div class="lname">${names[k]}</div><div class="nums">${btns || '<span class="muted small">još nepoznato</span>'}</div></div>`;
      }).join("");
      $("lineup").querySelectorAll(".numb").forEach((b) => b.onclick = () => { highlight = highlight === b.dataset.p ? null : b.dataset.p; lastHL = "x"; draw(); });
    }
    function trailAt(fi) {
      const pts = [], F = D.frames, t = F[fi].t;
      for (let k = fi; k >= 0 && t - F[k].t <= 1.5; k--) if (F[k].b) pts.unshift({ x: F[k].b[2], y: F[k].b[3], t: F[k].t });
      for (let k = 0; k < pts.length; k++) pts[k].gap = k > 0 && pts[k].t - pts[k - 1].t > 0.3;
      return pts;
    }
    function draw() {
      const t = clk.t(), fi = frameAt(t), f = D.frames[fi];
      const t0 = D.frames[0].t, t1 = D.frames[D.frames.length - 1].t, outside = t < t0 - 0.5 || t > t1 + 0.5;
      const show = { box: !embed && $("t-box").checked, num: !embed && $("t-num").checked, court: !embed && $("t-court").checked, ball: $("t-ball").checked };
      if ($("range")) $("range").hidden = !outside;
      if (octx) drawOverlay(f, fi, show);
      const trail = trailAt(fi);
      drawMini(f, trail, highlight ? D.players.indexOf(highlight) : -2, show.ball);
      panel(f, t);
    }
    function drawOverlay(f, fi, show) {
      const { w, h } = fit(ov); octx.clearRect(0, 0, w, h);
      const vw = vid.videoWidth || 16, vh = vid.videoHeight || 9;
      const sc = Math.min(w / vw, h / vh), ox = (w - vw * sc) / 2, oy = (h - vh * sc) / 2;
      const kx = vw * sc / D.img[0], ky = vh * sc / D.img[1];
      const dpr = window.devicePixelRatio || 1, cssW = w / dpr;
      const X = (x) => ox + x * kx, Y = (y) => oy + y * ky, S = dpr * Math.min(1.3, Math.max(0.6, cssW / 900));
      const H = f.H, sig = css("--signal");
      if (show.court) {
        octx.strokeStyle = "rgba(120,200,255,.7)"; octx.lineWidth = 1.6 * S;
        for (const poly of polys) { octx.beginPath(); let pen = false;
          for (const [x, y] of poly) { const p = proj(H, x, y);
            if (!p || Math.abs(p[0]) > 5000 || Math.abs(p[1]) > 5000) { pen = false; continue; }
            if (pen) octx.lineTo(X(p[0]), Y(p[1])); else { octx.moveTo(X(p[0]), Y(p[1])); pen = true; } }
          octx.stroke(); }
      }
      const hlIdx = highlight ? D.players.indexOf(highlight) : -2;
      let hb = null;
      for (const p of f.p) if (p[1] === hlIdx) hb = [X(p[3]), Y(p[4]), X(p[5]), Y(p[6])];
      if (hb) {
        octx.save(); octx.fillStyle = "rgba(0,0,0,.42)"; octx.fillRect(0, 0, w, h);
        const cx = (hb[0] + hb[2]) / 2, cy = (hb[1] + hb[3]) / 2, r = Math.max(hb[3] - hb[1], 40 * S) * 0.85;
        octx.globalCompositeOperation = "destination-out"; const g = octx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
        g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)"); octx.fillStyle = g;
        octx.beginPath(); octx.arc(cx, cy, r, 0, Math.PI * 2); octx.fill(); octx.restore();
      }
      octx.font = `700 ${Math.round(15 * S)}px "Barlow Condensed", sans-serif`; octx.textBaseline = "bottom";
      for (const p of f.p) {
        const [ti, pi, gk, x1, y1, x2, y2] = p, col = T[ti].color, isHL = pi === hlIdx;
        if (show.box || isHL) { octx.strokeStyle = isHL ? sig : col; octx.lineWidth = (isHL ? 3.5 : 1.8) * S; octx.strokeRect(X(x1), Y(y1), X(x2) - X(x1), Y(y2) - Y(y1)); }
        if ((show.num || isHL) && ti < 2) {
          const lab = gk ? "GK" : (pi >= 0 ? D.players[pi].split(" ").pop() : "?");
          octx.lineWidth = 3.5 * S; octx.strokeStyle = "rgba(0,0,0,.8)"; octx.fillStyle = isHL ? sig : col;
          octx.strokeText(lab, X(x1), Y(y1) - 3 * S); octx.fillText(lab, X(x1), Y(y1) - 3 * S);
        }
      }
      const trail = trailAt(fi);
      if (show.ball) {
        octx.strokeStyle = sig; octx.lineWidth = 2 * S;
        for (let k = 1; k < trail.length; k++) { if (trail[k].gap) continue;
          const a = proj(H, trail[k - 1].x, trail[k - 1].y), b = proj(H, trail[k].x, trail[k].y); if (!a || !b) continue;
          octx.globalAlpha = 0.25 + 0.75 * k / trail.length; octx.beginPath(); octx.moveTo(X(a[0]), Y(a[1])); octx.lineTo(X(b[0]), Y(b[1])); octx.stroke(); }
        octx.globalAlpha = 1;
        if (f.b) { octx.lineWidth = 2.5 * S; octx.beginPath(); octx.arc(X(f.b[0]), Y(f.b[1]), 9 * S, 0, Math.PI * 2); octx.stroke(); }
        if (f.h >= 0 && f.p[f.h]) { const p = f.p[f.h], cx = X((p[3] + p[5]) / 2), ty = Y(p[4]) - 20 * S;
          octx.fillStyle = sig; octx.beginPath(); octx.moveTo(cx - 7 * S, ty - 9 * S); octx.lineTo(cx + 7 * S, ty - 9 * S); octx.lineTo(cx, ty); octx.fill(); }
      }
    }
    function panel(f, t) {
      const hlIdx = highlight ? D.players.indexOf(highlight) : -2;
      const a = f.pc[order[0]], b = f.pc[order[1]], tot = a + b, pa = tot ? Math.round(100 * a / tot) : 50;
      $("pa").style.flexBasis = pa + "%"; $("pb").style.flexBasis = (100 - pa) + "%";
      $("pa").textContent = tot ? pa + "%" : "–"; $("pb").textContent = tot ? (100 - pa) + "%" : "–";
      const chip = $("clock"); chip.className = "chip " + (f.live ? "run" : "stop"); chip.textContent = f.live ? "Sat teče" : "Sat stoji";
      lineup(f);
      if (highlight) { const vis = f.p.some((p) => p[1] === hlIdx); $("hl").textContent = `Istaknut ${highlight}` + (vis ? "" : ", trenutno nije u kadru"); }
      else $("hl").textContent = embed ? "Klikni broj da istakneš igrača na mini-mapi." : "Klikni broj da istakneš igrača u videu i na mini-mapi.";
      $("time").textContent = fmt(t) + " / " + fmt(dur);
      const pr = dur ? Math.min(1, Math.max(0, t / dur)) : 0; $("prog").style.width = (pr * 100) + "%";
      if (!seeking) $("seek").value = Math.round(pr * 1000);
    }
    function drawMini(f, trail, hlIdx, showBall) {
      const { w, h } = fit(mini), c = D.court, m = 1.2;
      const s = Math.min(w / (c.L + 2 * m), h / (c.W + 2 * m));
      const MX = (x) => w / 2 + x * s, MY = (y) => h / 2 + y * s, R = Math.max(4, 0.42 * s);
      mctx.fillStyle = css("--court"); mctx.fillRect(0, 0, w, h);
      mctx.strokeStyle = css("--court-line"); mctx.lineWidth = Math.max(1, s * 0.08);
      for (const poly of polys) { mctx.beginPath(); poly.forEach(([x, y], i) => i ? mctx.lineTo(MX(x), MY(y)) : mctx.moveTo(MX(x), MY(y))); mctx.stroke(); }
      mctx.fillStyle = css("--court-line");
      for (const gx of [-c.L / 2, c.L / 2]) for (const d of [6, 10]) { mctx.beginPath(); mctx.arc(MX(gx - Math.sign(gx) * d), MY(0), Math.max(1.5, s * 0.12), 0, Math.PI * 2); mctx.fill(); }
      const sig = css("--signal");
      if (showBall && trail.length > 1) {
        mctx.strokeStyle = sig; mctx.lineWidth = Math.max(1.5, s * 0.12);
        for (let k = 1; k < trail.length; k++) { if (trail[k].gap) continue; mctx.globalAlpha = 0.25 + 0.75 * k / trail.length;
          mctx.beginPath(); mctx.moveTo(MX(trail[k - 1].x), MY(trail[k - 1].y)); mctx.lineTo(MX(trail[k].x), MY(trail[k].y)); mctx.stroke(); }
        mctx.globalAlpha = 1;
      }
      for (const [ti, x, y] of f.g) { mctx.strokeStyle = T[ti].color; mctx.lineWidth = 2; mctx.beginPath(); mctx.arc(MX(x), MY(y), R, 0, Math.PI * 2); mctx.stroke(); }
      for (const p of f.p) {
        const [ti, pi, , , , , , x, y] = p, isHL = pi === hlIdx && hlIdx >= 0;
        mctx.fillStyle = T[ti].color; mctx.beginPath(); mctx.arc(MX(x), MY(y), ti === 2 ? R * 0.75 : R, 0, Math.PI * 2); mctx.fill();
        mctx.strokeStyle = "rgba(0,0,0,.55)"; mctx.lineWidth = 1; mctx.stroke();
        if (isHL) { mctx.strokeStyle = sig; mctx.lineWidth = 3; mctx.beginPath(); mctx.arc(MX(x), MY(y), R + 5, 0, Math.PI * 2); mctx.stroke(); }
        if (ti < 2 && pi >= 0 && R >= 6) { mctx.fillStyle = textOn(T[ti].color); mctx.font = `700 ${Math.round(R * 1.15)}px "Barlow Condensed", sans-serif`;
          mctx.textAlign = "center"; mctx.textBaseline = "middle"; mctx.fillText(D.players[pi].split(" ").pop(), MX(x), MY(y) + 0.5); mctx.textAlign = "start"; }
      }
      if (f.b && showBall) { mctx.fillStyle = sig; mctx.beginPath(); mctx.arc(MX(f.b[2]), MY(f.b[3]), Math.max(3, R * 0.55), 0, Math.PI * 2); mctx.fill();
        mctx.strokeStyle = "rgba(0,0,0,.6)"; mctx.lineWidth = 1; mctx.stroke(); }
    }
    const seek = $("seek");
    seek.oninput = () => { seeking = true; if (dur) clk.seek(seek.value / 1000 * dur); draw(); };
    seek.onchange = () => { seeking = false; };
    ["t-box", "t-num", "t-court", "t-ball"].forEach((k) => { if ($(k)) $(k).onchange = draw; });
    const loop = () => { if (!alive) return; if (!clk.paused()) draw(); raf = requestAnimationFrame(loop); };
    const ro = new ResizeObserver(() => draw()); ro.observe(el);
    if (embed) {
      dur = D.frames[D.frames.length - 1].t; bands(); draw(); loop();
      if (!ytId) $("yterr").hidden = false;
      else loadYT().then((YT) => {
        if (!alive) return;
        yt = new YT.Player($("yt"), { videoId: ytId, width: "100%", height: "100%", host: "https://www.youtube-nocookie.com",
          playerVars: { start: Math.max(0, Math.floor(ytOffset + D.frames[0].t)), rel: 0, playsinline: 1 },
          events: { onReady: draw, onStateChange: draw } });
      }).catch(() => { if (alive) $("yterr").hidden = false; });
      return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); try { yt?.destroy(); } catch { /* */ } };
    }
    const setUI = () => { const p = !vid.paused; $("play").innerHTML = p ? "Pauza" : "Pokreni"; $("big").hidden = p; };
    const toggle = () => { vid.paused ? vid.play().catch(() => {}) : vid.pause(); };
    $("play").onclick = toggle; $("big").onclick = toggle;
    vid.addEventListener("play", setUI); vid.addEventListener("pause", setUI); vid.addEventListener("ended", setUI);
    $("speed").onchange = () => { vid.playbackRate = +$("speed").value; };
    const onMeta = () => { dur = vid.duration || D.frames[D.frames.length - 1].t; bands(); draw(); };
    vid.addEventListener("loadedmetadata", onMeta);
    vid.addEventListener("seeked", draw); vid.addEventListener("timeupdate", () => { if (vid.paused) draw(); });
    const key = (e) => {
      if (e.target.closest("input, select, textarea")) return;
      if (!el.contains(document.activeElement) && document.activeElement !== document.body) return;
      if (e.code === "Space") { e.preventDefault(); toggle(); }
      if (e.code === "ArrowRight") vid.currentTime = Math.min(dur, vid.currentTime + 2);
      if (e.code === "ArrowLeft") vid.currentTime = Math.max(0, vid.currentTime - 2);
    };
    document.addEventListener("keydown", key);
    loop();
    vid.src = video; if (vid.readyState >= 1) onMeta(); else { dur = D.frames[D.frames.length - 1].t; bands(); draw(); }
    setUI();
    return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener("keydown", key); vid.pause(); };
  }, [D, video, mode, ytId, ytOffset]);

  const miniCard = (
    <section className="panel">
      <div className="ph"><h3>Mini-mapa</h3>{embed && <label className="tg"><input type="checkbox" data-k="t-ball" defaultChecked /> Lopta</label>}</div>
      <div className="pb"><canvas className="mini" data-k="mini" aria-label="Pozicije igrača na terenu, pogled odozgo" /></div>
    </section>);

  return (
    <div className="viewer" ref={root}>
      <section className="stage" aria-label="Video s oznakama">
        {embed ? (
          <div className="video">
            <div data-k="yt" />
            <div className="yterr" data-k="yterr" hidden>
              <span>YouTube player se ovdje ne može učitati.</span>
              {youtube && <a className="btn sm" href={youtube} target="_blank" rel="noreferrer">Otvori snimku na YouTubeu</a>}
            </div>
          </div>
        ) : (
          <div className="video">
            <video data-k="vid" playsInline muted preload="auto" />
            <canvas data-k="ov" />
            <button className="bigplay" data-k="big" aria-label="Pokreni video">{Icon.play(30)}</button>
          </div>
        )}
        {embed ? (
          <div className="vctl">
            <span className="vtime" data-k="time" />
            <span className="chip run" data-k="clock" />
            <span className="small muted" data-k="range" hidden>Video je izvan dijela koji je analiziran.</span>
          </div>
        ) : (
        <div className="vctl">
          <button className="btn dark" data-k="play" style={{ minWidth: 92 }} />
          <span className="vtime" data-k="time" />
          <span className="chip run" data-k="clock" />
          <select className="select" data-k="speed" aria-label="Brzina reprodukcije" defaultValue="1" style={{ padding: "7px 28px 7px 10px" }}>
            <option value="0.5">0,5×</option><option value="1">1×</option><option value="2">2×</option>
          </select>
          <div className="toggles">
            <label className="tg"><input type="checkbox" data-k="t-box" defaultChecked /> Okviri</label>
            <label className="tg"><input type="checkbox" data-k="t-num" defaultChecked /> Brojevi</label>
            <label className="tg"><input type="checkbox" data-k="t-court" defaultChecked /> Linije terena</label>
            <label className="tg"><input type="checkbox" data-k="t-ball" defaultChecked /> Lopta</label>
          </div>
        </div>)}
        <div className="scrub">
          <div className="band" data-k="band"><div className="prog" data-k="prog" /></div>
          <input type="range" data-k="seek" min="0" max="1000" defaultValue="0" step="1" aria-label="Vrijeme u snimci" />
        </div>
        <div className="note">{embed ? "Traka prikazuje analizirani dio snimke, klik premotava YouTube player. Prugasti dijelovi: sat stoji, posjed se tada ne broji."
          : "Prugasti dijelovi trake: sat stoji, posjed se tada ne broji. Razmaknica pokreće i zaustavlja, strelice premotavaju 2 s."}</div>
        {embed && miniCard}
        {note && <div className="callout"><span>{note}{youtube && <> <a href={youtube} target="_blank" rel="noreferrer" style={{ color: "var(--primary)", fontWeight: 600 }}>Cijela snimka na YouTubeu</a></>}</span></div>}
      </section>
      <aside className="side">
        <section className="panel">
          <div className="ph"><h3>Posjed</h3><span className="aside">do ovog trenutka</span></div>
          <div className="pb poss">
            <div className="pbar"><div data-k="pa" /><div data-k="pb" /></div>
            <div className="note">Broji se samo dok sat teče.</div>
          </div>
        </section>
        <section className="panel">
          <div className="ph"><h3>Na terenu</h3></div>
          <div className="pb"><div data-k="lineup" /><div className="note" data-k="hl" style={{ marginTop: 10, minHeight: "1.4em" }} /></div>
        </section>
        {!embed && miniCard}
        <section className="panel">
          <div className="ph"><h3>Kako čitati</h3></div>
          <div className="pb">
            <dl className="keys">
              {!embed && <><dt><span className="k-box" /></dt><dd>Okvir u boji ekipe, iznad njega broj s dresa. Upitnik znači da broj još nije pročitan.</dd></>}
              <dt><span className="k-dash" /></dt><dd>Iscrtkani broj: igrač je na terenu, ali trenutno nije u kadru.</dd>
              <dt><span className="k-ring" /></dt><dd>Prazni krug na mini-mapi: procijenjeni položaj golmana.</dd>
              <dt><span className="k-ball" /></dt><dd>{embed ? "Lopta i njezin trag na mini-mapi." : "Lopta i njezin trag. Trokut iznad igrača označava tko je ima."}</dd>
            </dl>
            <div className="note" style={{ marginTop: 10 }}>Analiza je automatska, pa brojevi, postava i posjed mogu sadržavati greške.</div>
          </div>
        </section>
      </aside>
    </div>
  );
}
