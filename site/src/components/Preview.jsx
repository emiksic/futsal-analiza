// Najava utakmice (kartica Detalji prije početka): mjesto na tablici, forma, međusobne utakmice, kazne i strijelci.
import { href } from "../lib/router.js";
import { standings, winner, score, fmtDate, isCup, roundName, suspensions, scorers, playerName, perPlayerAllowed } from "../lib/derive.js";
import { Jersey } from "./ui.jsx";
import { PLink } from "./PLink.jsx";

const RES = { W: "pobjeda", D: "neriješeno", L: "poraz" };
const LETTER = { W: "P", D: "N", L: "I" };

// zadnjih n utakmica kluba u ovom natjecanju prije zadane utakmice (od starije prema novijoj)
function form(db, m, club, n = 5) {
  return db.matches.filter((x) => x.comp === m.comp && x.status === "finished" && x.date < m.date && (x.home === club || x.away === club))
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, n).reverse()
    .map((x) => { const w = winner(x), home = x.home === club; return { x, r: w === 0 ? "D" : (w === 1) === home ? "W" : "L" }; });
}

export function Preview({ db, ix, m }) {
  const L = ix.league[ix.comp[m.comp]?.league], cup = isCup(L);
  const sides = ["home", "away"];
  const tbl = cup ? [] : standings(db, m.comp);
  const pos = (club) => { const i = tbl.findIndex((r) => r.club === club); return i < 0 || !tbl[i].p ? null : { n: i + 1, r: tbl[i] }; };
  const F = Object.fromEntries(sides.map((s) => [s, form(db, m, m[s])]));
  const h2h = db.matches.filter((x) => x.id !== m.id && x.status === "finished" && ((x.home === m.home && x.away === m.away) || (x.home === m.away && x.away === m.home)))
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const S = suspensions(db, m);
  const per = perPlayerAllowed(ix, m.comp);
  const sc = per ? scorers(db, m.comp, { merge: false }) : [];
  const top = (club) => sc.filter((r) => r.club === club && r.goals).slice(0, 3);
  const P = pos(m.home), Q = pos(m.away);
  const anyForm = F.home.length || F.away.length;

  return (
    <div className="prev">
      {(P || Q) && (
        <section>
          <h3>Na tablici</h3>
          <div className="prev-two">
            {sides.map((s) => { const p = s === "home" ? P : Q; return (
              <a key={s} className="prev-pos" href={href("liga", L.id, ix.comp[m.comp].season, "tablica")}>
                <Jersey kit={ix.club[m[s]].kit} size={22} />
                <span><b>{p ? `${p.n}. mjesto` : "—"}</b><small>{p ? `${p.r.pts} bod. · ${p.r.w}-${p.r.d}-${p.r.l} · ${p.r.gf}:${p.r.ga}` : ""}</small></span>
              </a>); })}
          </div>
        </section>)}

      {anyForm > 0 && (
        <section>
          <h3>Forma <span className="muted small">zadnjih 5 u natjecanju</span></h3>
          <div className="prev-two">
            {sides.map((s) => (
              <div key={s} className="prev-form">
                <Jersey kit={ix.club[m[s]].kit} size={22} />
                <span className="form">{F[s].length ? F[s].map(({ x, r }) => {
                  const opp = ix.club[x.home === m[s] ? x.away : x.home], sc2 = score(x);
                  return <a key={x.id} className={r} href={href("utakmica", x.id)} title={`${RES[r]}: ${ix.club[x.home].name} ${sc2 ? `${sc2[0]}:${sc2[1]}` : ""} ${ix.club[x.away].name}`} aria-label={`${RES[r]} protiv ${opp?.name}`}>{LETTER[r]}</a>;
                }) : <span className="muted small" style={{ width: "auto", color: "var(--muted)" }}>još nema utakmica</span>}</span>
              </div>))}
          </div>
        </section>)}

      <section>
        <h3>Međusobne utakmice</h3>
        {!h2h.length ? <div className="muted small prev-empty">Nema ranijih utakmica ovih klubova u bazi.</div> : (
          <div className="prev-h2h">{h2h.map((x) => { const s2 = score(x), w = winner(x), XL = ix.league[ix.comp[x.comp].league]; return (
            <a key={x.id} href={href("utakmica", x.id)}>
              <span className="muted small">{fmtDate(x.date)}<br />{isCup(XL) ? "Kup" : XL.name}{x.round ? `, ${roundName(XL, x.round)}` : ""}</span>
              <span className={w === 1 ? "b" : ""}>{ix.club[x.home].name}</span>
              <b>{s2 ? `${s2[0]}:${s2[1]}` : "–"}</b>
              <span className={w === -1 ? "b" : ""}>{ix.club[x.away].name}</span>
            </a>); })}</div>)}
      </section>

      {(S.home.length > 0 || S.away.length > 0) && (
        <section>
          <h3>Ne igraju zbog kazne</h3>
          <div className="prev-two">{sides.map((s) => (
            <div key={s}><b className="prev-club"><Jersey kit={ix.club[m[s]].kit} size={18} />{ix.club[m[s]].name}</b>
              {S[s].length ? <ul>{S[s].map((x) => <li key={x.player}><PLink p={ix.player[x.player]}>{playerName(ix.player[x.player])}</PLink> <span className="muted small">({x.reason})</span></li>)}</ul> : <div className="muted small">nitko</div>}</div>))}</div>
        </section>)}

      {per && (top(m.home).length > 0 || top(m.away).length > 0) && (
        <section>
          <h3>Najbolji strijelci</h3>
          <div className="prev-two">{sides.map((s) => (
            <div key={s}><b className="prev-club"><Jersey kit={ix.club[m[s]].kit} size={18} />{ix.club[m[s]].name}</b>
              <ul className="prev-sc">{top(m[s]).map((r) => <li key={r.player}><PLink p={ix.player[r.player]}>{playerName(ix.player[r.player])}</PLink><b>{r.goals}</b></li>)}
                {!top(m[s]).length && <li className="muted small">još nema golova</li>}</ul></div>))}</div>
        </section>)}
    </div>
  );
}
