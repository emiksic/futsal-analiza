// Kartica "Udarci": karta udaraca + sažetak (YouTube seekTo), "Pusti sve" vrti isječke jedan za drugim.
import { useEffect, useRef, useState } from "react";
import { minute, playerName } from "../lib/derive.js";
import { Player, fmtVT } from "../components/Player.jsx";
import { ShotMap, ShotLegend, OUTCOMES, shotStats } from "../components/ShotMap.jsx";
import { Jersey, Icon } from "../components/ui.jsx";

const PRE = 5, POST = 3;   // s prije i poslije udarca

export function Shots({ m, ix }) {
  const P = useRef(null);
  const [side, setSide] = useState("all");
  const [per, setPer] = useState("all");
  const [sel, setSel] = useState(null);
  const [queue, setQueue] = useState(null);       // { list, i }
  const all = m.events.filter((e) => e.type === "shot").sort((a, b) => (a.vt ?? 1e9) - (b.vt ?? 1e9));
  const list = all.filter((s) => (side === "all" || s.side === side) && (per === "all" || s.period === +per));
  const kits = { home: ix.club[m.home].kit, away: ix.club[m.away].kit };
  const st = shotStats(m);

  const playShot = (s) => { setSel(s.id); if (s.vt == null) return; P.current?.seek(s.vt - PRE); P.current?.play(); };
  useEffect(() => {
    if (!queue) return;
    const cur = queue.list[queue.i]; if (!cur) { setQueue(null); return; }
    playShot(cur);
    const iv = setInterval(() => {
      const t = P.current?.time(); if (t == null) return;
      if (t >= cur.vt + POST) setQueue((q) => (q && q.i + 1 < q.list.length ? { ...q, i: q.i + 1 } : null));
    }, 250);
    return () => clearInterval(iv);
  }, [queue?.i, queue?.list]);
  const playable = list.filter((s) => s.vt != null);

  if (!all.length) return <div className="empty" style={{ padding: 24 }}>Za ovu utakmicu još nema označenih udaraca.</div>;
  return (
    <div className="pb" style={{ paddingTop: 16 }}>
      <div className="viewer">
        <section className="stage">
          <Player ref={P} youtube={m.youtube} />
          <div className="vctl">
            <button className="btn dark" disabled={!playable.length} onClick={() => setQueue(queue ? null : { list: playable, i: 0 })}>
              {queue ? <>{Icon.pause(16)} Zaustavi</> : <>{Icon.play(16)} Pusti sve ({playable.length})</>}</button>
            {queue && <span className="small muted">Isječak {queue.i + 1} od {queue.list.length}</span>}
            <div className="toggles">
              <div className="seg" role="group" aria-label="Ekipa">
                {[["all", "Obje"], ["home", ix.club[m.home].short], ["away", ix.club[m.away].short]].map(([k, n]) =>
                  <button key={k} aria-pressed={side === k} onClick={() => { setSide(k); setQueue(null); }}>{n}</button>)}
              </div>
              <div className="seg" role="group" aria-label="Poluvrijeme">
                {[["all", "Cijela"], ["1", "1. pol."], ["2", "2. pol."]].map(([k, n]) =>
                  <button key={k} aria-pressed={per === k} onClick={() => { setPer(k); setQueue(null); }}>{n}</button>)}
              </div>
            </div>
          </div>
          <ul className="shotlist">
            {list.map((s) => {
              const c = ix.club[m[s.side]];
              return (
                <li key={s.id}>
                  <button aria-pressed={sel === s.id} onClick={() => { setQueue(null); playShot(s); }}>
                    <span className="sm-min">{s.sec != null ? minute(s) : fmtVT(s.vt)}</span>
                    <Jersey kit={c.kit} size={20} num={ix.player[s.player]?.num} />
                    <span className="sm-who">{s.player ? playerName(ix.player[s.player]) : c.name}</span>
                    <span className={"pill o-" + s.outcome}>{OUTCOMES[s.outcome]}</span>
                    <span className="sm-play" aria-hidden="true">{s.vt != null ? Icon.play(14) : null}</span>
                  </button>
                </li>);
            })}
          </ul>
        </section>
        <aside className="side">
          <section className="panel">
            <div className="ph"><h3>Karta udaraca</h3><span className="aside">{ix.club[m.home].short} napada udesno</span></div>
            <div className="pb">
              <ShotMap shots={list} kits={kits} sel={sel} onPick={(s) => { setQueue(null); playShot(s); }} />
              <ShotLegend />
            </div>
          </section>
          <section className="panel">
            <div className="ph"><h3>Udarci</h3></div>
            <table className="squad">
              <thead><tr><th /><th className="c">{ix.club[m.home].short}</th><th className="c">{ix.club[m.away].short}</th></tr></thead>
              <tbody>
                {[["Udarci", "shots"], ["U okvir gola", "on"], ["Pored, iznad ili okvir", "off"], ["Blokirani", "blocked"], ["Obrane golmana", "saves"]].map(([n, k]) => (
                  <tr key={k}><td>{n}</td><td className="c">{st.home[k]}</td><td className="c">{st.away[k]}</td></tr>))}
              </tbody>
            </table>
            <div className="note" style={{ padding: "10px 16px 14px" }}>Obrana je udarac u okvir gola koji nije završio golom.</div>
          </section>
        </aside>
      </div>
    </div>
  );
}
