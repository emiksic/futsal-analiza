// Označavanje udaraca: gledaš snimku, pritisneš U (ili gumb) u trenutku udarca, klikneš mjesto na terenu, odabereš ishod.
import { useEffect, useRef, useState } from "react";
import { uid } from "../lib/store.js";
import { clock } from "../lib/derive.js";
import { Player, fmtVT, parseVT } from "../components/Player.jsx";
import { ShotMap, OUTCOMES, fromView, shotStats } from "../components/ShotMap.jsx";
import { Jersey, Icon } from "../components/ui.jsx";

export function ShotTagger({ ix, m, upd }) {
  const P = useRef(null);
  const blank = { side: "home", player: "", outcome: "saved", period: 1, clk: "", vt: "", x: null, y: null };
  const [f, setF] = useState(blank);
  const set = (k, v) => setF((o) => ({ ...o, [k]: v, ...(k === "side" ? { player: "", x: null, y: null } : {}) }));
  const shots = m.events.filter((e) => e.type === "shot").sort((a, b) => (b.vt ?? 0) - (a.vt ?? 0));
  const kits = { home: ix.club[m.home].kit, away: ix.club[m.away].kit };
  const roster = (side) => (m.roster[side]?.players || []).map((p) => ix.player[p]).filter(Boolean).sort((a, b) => a.num - b.num);
  const capture = () => { const t = P.current?.time(); if (t != null) setF((o) => ({ ...o, vt: fmtVT(t) })); };
  useEffect(() => {
    const k = (e) => { if (e.target.closest("input, select, textarea")) return; if (e.key === "u" || e.key === "U") { e.preventDefault(); capture(); } };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, []);
  const vt = parseVT(f.vt), sec = (() => { const v = parseVT(f.clk); return v != null && v <= 1200 ? v : null; })();
  const ok = f.x != null && (vt != null || !f.vt);
  const save = () => {
    if (!ok) return;
    upd((x) => { x.events.push({ id: uid("s"), type: "shot", side: f.side, outcome: f.outcome, x: +f.x.toFixed(2), y: +f.y.toFixed(2), period: +f.period,
      ...(f.player ? { player: f.player } : {}), ...(vt != null ? { vt } : {}), ...(sec != null ? { sec } : {}) }); });
    setF((o) => ({ ...blank, side: o.side, period: o.period }));
  };
  const st = shotStats(m);
  return (
    <div className="pb">
      <div className="viewer">
        <section className="stage">
          <Player ref={P} youtube={m.youtube} />
          <div className="note">Pusti snimku i u trenutku udarca pritisni <b>U</b> ili gumb ispod. Zatim klikni mjesto udarca na terenu i odaberi ishod.</div>
          <section className="panel">
            <div className="ph"><h3>Označeni udarci ({shots.length})</h3>
              <span className="aside">{ix.club[m.home].short} {st.home.shots} ({st.home.on} u okvir) · {ix.club[m.away].short} {st.away.shots} ({st.away.on} u okvir)</span></div>
            <div className="tbl-wrap">
              <table className="atbl">
                <thead><tr><th>Video</th><th>Sat</th><th>Ekipa</th><th>Igrač</th><th>Ishod</th><th /></tr></thead>
                <tbody>{shots.map((s) => (
                  <tr key={s.id}>
                    <td className="nowrap"><button className="btn sm ghost" disabled={s.vt == null} onClick={() => { P.current?.seek(s.vt - 5); P.current?.play(); }}>{Icon.play(12)} {fmtVT(s.vt)}</button></td>
                    <td className="nowrap">{s.sec != null ? `${s.period}. ${clock(s.sec)}` : `${s.period}. pol.`}</td>
                    <td><span className="mt"><Jersey kit={kits[s.side]} size={18} />{ix.club[m[s.side]].short}</span></td>
                    <td>{s.player ? ix.player[s.player]?.num : "—"}</td>
                    <td><span className={"pill o-" + s.outcome}>{OUTCOMES[s.outcome]}</span></td>
                    <td><button className="btn sm ghost danger" onClick={() => upd((x) => { x.events = x.events.filter((q) => q.id !== s.id); })} aria-label="Obriši udarac">{Icon.trash()}</button></td>
                  </tr>))}</tbody>
              </table>
              {!shots.length && <div className="empty">Još nema označenih udaraca.</div>}
            </div>
          </section>
        </section>
        <aside className="side">
          <section className="panel">
            <div className="ph"><h3>Novi udarac</h3></div>
            <form className="pb" style={{ display: "grid", gap: 12 }} onSubmit={(e) => { e.preventDefault(); save(); }}>
              <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
                <label className="field" style={{ flex: 1 }}><span>Vrijeme u snimci</span>
                  <input className="input" value={f.vt} onChange={(e) => set("vt", e.target.value)} placeholder="h:mm:ss" aria-invalid={!!f.vt && vt == null} /></label>
                <button type="button" className="btn" onClick={capture} title="Prečac: U">Sada (U)</button>
              </div>
              <div className="field"><span>Ekipa</span>
                <div className="seg">{["home", "away"].map((s) => <button type="button" key={s} aria-pressed={f.side === s} onClick={() => set("side", s)}>{ix.club[m[s]].name}</button>)}</div></div>
              <div className="field"><span>Mjesto udarca (klikni na teren)</span>
                <ShotMap shots={[]} kits={kits} pending={f.x != null ? { side: f.side, x: f.x, y: f.y } : null}
                  onCourt={(x, y) => { const [nx, ny] = fromView(f.side, x, y); setF((o) => ({ ...o, x: nx, y: ny })); }} label="Klikni mjesto udarca" />
                <small>{ix.club[m[f.side]].short} napada {f.side === "home" ? "udesno" : "ulijevo"}.</small></div>
              <div className="field"><span>Ishod</span>
                <div className="seg" style={{ flexWrap: "wrap" }}>{Object.entries(OUTCOMES).map(([k, n]) => <button type="button" key={k} aria-pressed={f.outcome === k} onClick={() => set("outcome", k)}>{n}</button>)}</div></div>
              <label className="field"><span>Igrač (neobavezno)</span>
                <select className="input" value={f.player} onChange={(e) => set("player", e.target.value)}>
                  <option value="">—</option>{roster(f.side).map((p) => <option key={p.id} value={p.id}>{p.num} {p.name}</option>)}
                </select></label>
              <div style={{ display: "flex", gap: 8 }}>
                <div className="field"><span>Poluvrijeme</span>
                  <div className="seg">{[1, 2].map((k) => <button type="button" key={k} aria-pressed={+f.period === k} onClick={() => set("period", k)}>{k}.</button>)}</div></div>
                <label className="field" style={{ flex: 1 }}><span>Sat (neobavezno)</span>
                  <input className="input" value={f.clk} onChange={(e) => set("clk", e.target.value)} placeholder="mm:ss" /></label>
              </div>
              <button className="btn primary" type="submit" disabled={!ok}>Spremi udarac</button>
              {f.x == null && <small className="muted">Za spremanje treba mjesto udarca.</small>}
            </form>
          </section>
          <section className="panel">
            <div className="ph"><h3>Karta</h3></div>
            <div className="pb"><ShotMap shots={shots} kits={kits} /></div>
          </section>
        </aside>
      </div>
    </div>
  );
}
