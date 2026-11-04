import { href } from "../lib/router.js";
import { score, fmtTime, fmtDay, fmtWeekend, winner, shootout } from "../lib/derive.js";
import { Jersey, Icon } from "./ui.jsx";

export function MatchRow({ m, ix, showDay }) {
  const s = score(m), H = ix.club[m.home], A = ix.club[m.away];
  const fin = m.status === "finished" && s;
  const w = winner(m), lostH = fin && w === -1, lostA = fin && w === 1, so = fin && shootout(m);
  const an = m.analysis?.status;
  return (
    <a className="mrow" href={href("utakmica", m.id)}>
      <div className={"when" + (fin ? " fin" : "")}>
        {showDay && !(m.timeTbd && !fin) && <div>{fmtDay(m.date)}</div>}
        {showDay && m.timeTbd && !fin ? <div>{fmtWeekend(m.date).replace(" – ", " –\u00a0")}</div>
          : <div>{fin ? "Kraj" : m.timeTbd ? "—" : fmtTime(m.date)}</div>}
        {so && <div className="sotag" title={`Kazneni udarci ${so[0]}:${so[1]}`}>11m {so[0]}:{so[1]}</div>}
        {(m.youtube || m.tv) && <div className="tvtag" title={m.youtube || m.tv === "YouTube" ? "Prijenos na YouTubeu" : `Prijenos: ${m.tv}`}>{m.youtube ? "YouTube" : m.tv}</div>}
      </div>
      <div className="teams">
        <div className={"t" + (lostH ? " lost" : lostA ? " won" : "")}><Jersey kit={H.kit} size={20} /><span>{H.name}</span></div>
        <div className={"t" + (lostA ? " lost" : lostH ? " won" : "")}><Jersey kit={A.kit} size={20} /><span>{A.name}</span></div>
      </div>
      <div className="sc">
        {s ? <><span className={lostH ? "lost" : ""}>{s[0]}</span><span className={lostA ? "lost" : ""}>{s[1]}</span></> : <span className="muted small" style={{ fontFamily: "var(--body)", fontWeight: 400 }}>–</span>}
      </div>
      <div className="an">
        {an === "done" && <span className="an-dot done" title="Video analiza dostupna">{Icon.video(15)}</span>}
        {(an === "queued" || an === "processing") && <span className={"an-dot " + an} title={an === "queued" ? "Čeka analizu" : "Analiza u tijeku"}>{Icon.video(13)}</span>}
      </div>
    </a>
  );
}
