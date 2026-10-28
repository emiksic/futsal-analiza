// Video player s jednostavnim API-jem (time, seek, play, pause) — YouTube (zadano) ili vlastiti video.
// YouTube se učitava preko youtube-nocookie.com, ništa se ne crta preko playera.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { loadYT, ytIdOf } from "./AnalysisViewer.jsx";

export const Player = forwardRef(function Player({ youtube, video, start = 0 }, ref) {
  const host = useRef(null), vid = useRef(null), yt = useRef(null);
  const [err, setErr] = useState(false);
  const id = video ? null : ytIdOf(youtube);
  useEffect(() => {
    if (video || !id) return;
    let alive = true; setErr(false);
    const div = document.createElement("div"); host.current.appendChild(div);
    loadYT().then((YT) => {
      if (!alive) return;
      yt.current = new YT.Player(div, { videoId: id, width: "100%", height: "100%", host: "https://www.youtube-nocookie.com",
        playerVars: { start: Math.max(0, Math.floor(start)), rel: 0, playsinline: 1 } });
    }).catch(() => { if (alive) setErr(true); });
    return () => { alive = false; try { yt.current?.destroy(); } catch { /* */ } yt.current = null; if (host.current) host.current.innerHTML = ""; };
  }, [id, video]);
  useImperativeHandle(ref, () => ({
    time: () => (video ? (vid.current?.currentTime ?? null) : (yt.current?.getCurrentTime ? yt.current.getCurrentTime() : null)),
    seek: (s) => { if (video) { if (vid.current) vid.current.currentTime = Math.max(0, s); } else yt.current?.seekTo?.(Math.max(0, s), true); },
    play: () => { if (video) vid.current?.play().catch(() => {}); else yt.current?.playVideo?.(); },
    pause: () => { if (video) vid.current?.pause(); else yt.current?.pauseVideo?.(); },
    ready: () => !!(video ? vid.current : yt.current?.getCurrentTime),
  }), [video]);
  return (
    <div className="video">
      {video ? <video ref={vid} src={video} controls playsInline /> : (
        <>
          <div ref={host} style={{ position: "absolute", inset: 0 }} />
          {(err || !id) && (
            <div className="yterr">
              <span>{id ? "YouTube player se ovdje ne može učitati." : "Za ovu utakmicu još nije povezana snimka."}</span>
              {id && youtube && <a className="btn sm" href={youtube} target="_blank" rel="noreferrer">Otvori snimku na YouTubeu</a>}
            </div>)}
        </>)}
    </div>
  );
});

export const fmtVT = (s) => { if (s == null) return "–"; s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };
export const parseVT = (t) => { if (!t || !t.trim()) return null; const p = t.trim().split(":").map(Number); if (p.some(isNaN)) return null; return p.reduce((a, b) => a * 60 + b, 0); };
