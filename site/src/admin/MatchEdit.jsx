import { useState } from "react";
import { href, go } from "../lib/router.js";
import { update, uid } from "../lib/store.js";
import { score, absSec, minute, playerName, compName, ANALYSIS_LABEL } from "../lib/derive.js";
import { useAnalysis } from "../lib/analysis.js";
import { Jersey, Icon, Toast } from "../components/ui.jsx";
import { ShotTagger } from "./ShotTagger.jsx";

const toLocal = (iso) => { const d = new Date(iso), p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const MAX_ROSTER = 14;
const fmtHms = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };
const parseHms = (t) => { if (!t.trim()) return null; const p = t.trim().split(":").map(Number); if (p.some(isNaN)) return null; return p.reduce((a, b) => a * 60 + b, 0); };

export function MatchEdit({ db, ix, id, tab = "osnovno" }) {
  const m = ix.match[id];
  if (!m) return <div className="panel empty">Utakmica ne postoji.</div>;
  const upd = (fn) => update((d) => fn(d.matches.find((x) => x.id === id), d));
  const s = score(m);
  const TABS = [["osnovno", "Osnovno"], ["zapisnik", "Zapisnik"], ["dogadaji", "Događaji"], ["udarci", "Udarci"], ["analiza", "Video analiza"]];
  return (
    <>
      <a className="back" href={href("admin", "utakmice")}>Sve utakmice</a>
      <div className="ahead">
        <h1 style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Jersey kit={ix.club[m.home].kit} size={30} />{ix.club[m.home].name} {s ? `${s[0]}:${s[1]}` : "–"} {ix.club[m.away].name}<Jersey kit={ix.club[m.away].kit} size={30} />
        </h1>
        <div className="r">
          {m.draft ? (
            <>
              <button className="btn primary" onClick={() => { upd((x) => { delete x.draft; }); go("admin", "utakmice"); }}>Dodaj utakmicu</button>
              <button className="btn" onClick={() => { update((d) => { d.matches = d.matches.filter((x) => x.id !== id); }); go("admin", "utakmice"); }}>Odustani</button>
            </>
          ) : (
            <>
              <a className="btn" href={href("utakmica", m.id)}>Javna stranica {Icon.ext()}</a>
              <DeleteMatch onDelete={() => { update((d) => { d.matches = d.matches.filter((x) => x.id !== id); }); go("admin", "utakmice"); }} />
            </>
          )}
        </div>
      </div>
      <section className="panel">
        <nav className="tabs" aria-label="Uređivanje">
          {TABS.map(([k, n]) => <a key={k} href={href("admin", "utakmica", id, k)} aria-current={tab === k ? "page" : undefined}>{n}</a>)}
        </nav>
        <div style={{ height: 14 }} />
        {tab === "osnovno" && <Basic db={db} ix={ix} m={m} upd={upd} />}
        {tab === "zapisnik" && <Roster db={db} ix={ix} m={m} upd={upd} />}
        {tab === "dogadaji" && <Events ix={ix} m={m} upd={upd} />}
        {tab === "analiza" && <Analysis ix={ix} m={m} upd={upd} />}
        {tab === "udarci" && <ShotTagger ix={ix} m={m} upd={upd} />}
      </section>
    </>
  );
}

function DeleteMatch({ onDelete }) {
  const [ask, setAsk] = useState(false);
  if (!ask) return <button className="btn danger" onClick={() => setAsk(true)}>{Icon.trash()} Obriši utakmicu</button>;
  return (
    <span className="confirm">Obrisati utakmicu sa svim događajima?
      <button className="btn sm danger" onClick={onDelete}>Obriši</button>
      <button className="btn sm ghost" onClick={() => setAsk(false)}>Odustani</button>
    </span>);
}

function Basic({ db, ix, m, upd }) {
  const C = ix.comp[m.comp];
  return (
    <div className="form-grid">
      <label className="field"><span>Natjecanje</span>
        <select className="input" value={m.comp} onChange={(e) => upd((x) => { x.comp = e.target.value; })}>
          {db.comps.map((c) => <option key={c.id} value={c.id}>{compName(ix, c.id)}</option>)}
        </select></label>
      <label className="field"><span>Kolo</span>
        <input className="input" type="number" min="1" max={C.rounds} value={m.round} onChange={(e) => upd((x) => { x.round = +e.target.value || 1; })} /></label>
      <label className="field"><span>Datum i vrijeme</span>
        <input className="input" type="datetime-local" value={toLocal(m.date)} onChange={(e) => e.target.value && upd((x) => { x.date = new Date(e.target.value).toISOString(); })} /></label>
      <label className="field"><span>Status</span>
        <select className="input" value={m.status} onChange={(e) => upd((x) => { x.status = e.target.value; })}>
          <option value="scheduled">Zakazano</option><option value="finished">Odigrano</option>
        </select></label>
      <label className="field"><span>Domaćin</span>
        <select className="input" value={m.home} onChange={(e) => upd((x) => { x.home = e.target.value; x.hall = ix.club[e.target.value].hall; x.roster.home = null; })}>
          {C.teams.map((t) => <option key={t} value={t}>{ix.club[t].name}</option>)}
        </select></label>
      <label className="field"><span>Gost</span>
        <select className="input" value={m.away} onChange={(e) => upd((x) => { x.away = e.target.value; x.roster.away = null; })}>
          {C.teams.map((t) => <option key={t} value={t}>{ix.club[t].name}</option>)}
        </select></label>
      <label className="field"><span>Dvorana</span>
        <select className="input" value={m.hall} onChange={(e) => upd((x) => { x.hall = e.target.value; })}>
          {db.halls.map((h) => <option key={h.id} value={h.id}>{h.name}, {h.city}</option>)}
        </select></label>
      <div className="field"><span>Rezultat (ručno)</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input className="input num" inputMode="numeric" value={m.result?.[0] ?? ""} aria-label="Golovi domaćina"
            onChange={(e) => upd((x) => { const v = e.target.value.replace(/\D/g, ""); x.result = v === "" && (x.result?.[1] ?? "") === "" ? undefined : [+v || 0, x.result?.[1] ?? 0]; })} />
          <b>:</b>
          <input className="input num" inputMode="numeric" value={m.result?.[1] ?? ""} aria-label="Golovi gosta"
            onChange={(e) => upd((x) => { const v = e.target.value.replace(/\D/g, ""); x.result = [x.result?.[0] ?? 0, +v || 0]; })} />
          {m.result && <button className="btn sm ghost" onClick={() => upd((x) => { delete x.result; })}>Računaj iz golova</button>}
        </div>
        <small>Ako je upisan, vrijedi ovaj rezultat. Inače se računa iz golova pod Događaji.</small></div>
      <div className="field wide"><span>Prijenos</span>
        <div className="seg">
          {[["yt", "YouTube"], ["max", "MAXsport"], ["none", "Nema"]].map(([k, n]) => {
            const cur = m.tv ? "max" : (m.youtube || m.ytMode) ? "yt" : "none";
            return <button type="button" key={k} aria-pressed={cur === k}
              onClick={() => upd((x) => { if (k === "yt") { x.ytMode = true; delete x.tv; } if (k === "max") { x.youtube = ""; x.ytMode = false; x.tv = "MAXsport"; } if (k === "none") { x.youtube = ""; x.ytMode = false; delete x.tv; } })}>{n}</button>;
          })}
        </div>
        {(m.youtube || m.ytMode) && <input className="input" type="url" placeholder="https://www.youtube.com/watch?v=…" value={m.youtube || ""} onChange={(e) => upd((x) => { x.youtube = e.target.value.trim(); })} />}
        <small>{m.tv ? "TV prijenos: na stranici piše gdje se gleda, bez videa i analize." : "Iz YouTube linka se prikazuje snimka i preuzima video za analizu."}</small></div>
      <div className="wide small muted">Promjene se spremaju odmah.</div>
    </div>
  );
}

function Roster({ db, ix, m, upd }) {
  const C = ix.comp[m.comp], cat = ix.league[C.league].category;
  return (
    <div className="rost">
      {["home", "away"].map((side) => <RosterCol key={side} db={db} ix={ix} m={m} upd={upd} side={side} season={C.season} cat={cat} />)}
    </div>
  );
}

function RosterCol({ db, ix, m, upd, side, season, cat }) {
  const club = ix.club[m[side]];
  const [nn, setNn] = useState(""); const [nm, setNm] = useState("");
  const r = m.roster[side] || { players: [], start: [], gk: [] };
  const squad = db.players.filter((p) => p.club === club.id && p.season === season && p.cat === cat).sort((a, b) => a.num - b.num);
  const on = new Set(r.players), st = new Set(r.start), gk = new Set(r.gk);
  const ed = (fn) => upd((x) => { x.roster[side] ||= { players: [], start: [], gk: [] }; fn(x.roster[side], x); });
  const togglePlayer = (p) => ed((R) => {
    if (R.players.includes(p.id)) { R.players = R.players.filter((i) => i !== p.id); R.start = R.start.filter((i) => i !== p.id); R.gk = R.gk.filter((i) => i !== p.id); }
    else if (R.players.length < MAX_ROSTER) { R.players.push(p.id); if (p.gk) R.gk.push(p.id); }
  });
  const toggle = (key, p) => ed((R) => { if (R[key].includes(p.id)) R[key] = R[key].filter((i) => i !== p.id); else if (key !== "start" || R.start.length < 5) R[key].push(p.id); });
  const setPlayer = (pid, fn) => update((d) => fn(d.players.find((p) => p.id === pid)));
  const addPlayer = () => {
    const num = nn.trim(); if (!num) return;
    const id = uid(`${club.id}-`);
    update((d) => { d.players.push({ id, club: club.id, season, cat, num, name: nm.trim(), gk: false });
      const x = d.matches.find((q) => q.id === m.id); x.roster[side] ||= { players: [], start: [], gk: [] };
      if (x.roster[side].players.length < MAX_ROSTER) x.roster[side].players.push(id); });
    setNn(""); setNm("");
  };
  const copyPrev = () => {
    const prev = db.matches.filter((q) => q.id !== m.id && q.comp === m.comp && q.date < m.date && (q.home === club.id || q.away === club.id))
      .sort((a, b) => b.date.localeCompare(a.date)).find((q) => q.roster[q.home === club.id ? "home" : "away"]?.players?.length);
    if (!prev) return;
    const src = prev.roster[prev.home === club.id ? "home" : "away"];
    ed((R) => { R.players = [...src.players]; R.start = [...src.start]; R.gk = [...src.gk]; });
  };
  const gkStart = r.start.filter((p) => gk.has(p)).length;
  const ok5 = r.start.length === 5, okGk = gkStart === 1;
  const dup = (() => { const nums = r.players.map((p) => ix.player[p]?.num); return nums.filter((n, i) => nums.indexOf(n) !== i); })();
  return (
    <div className="rcol">
      <div className="rcol-h">
        <Jersey kit={club.kit} size={26} /><b>{club.name}</b>
        <span className="cnt">
          <span className={"pill " + (r.players.length ? "ok" : "")}>{r.players.length}/{MAX_ROSTER} u zapisniku</span>
          <span className={"pill " + (ok5 ? "ok" : r.start.length ? "bad" : "")}>{r.start.length}/5 početna</span>
          {r.start.length > 0 && <span className={"pill " + (okGk ? "ok" : "bad")}>{okGk ? "golman u petorci" : "petorka bez jednog golmana"}</span>}
          {dup.length > 0 && <span className="pill bad">isti broj: {[...new Set(dup)].join(", ")}</span>}
        </span>
      </div>
      <div className="toolbar" style={{ padding: "8px 12px", borderBottom: "1px solid var(--line)" }}>
        <button className="btn sm" onClick={copyPrev}>Kopiraj s prošle utakmice</button>
        <button className="btn sm ghost" onClick={() => ed((R) => { R.players = squad.slice(0, MAX_ROSTER).map((p) => p.id); R.gk = squad.filter((p) => p.gk).map((p) => p.id).filter((i) => R.players.includes(i)); })}>Označi sve</button>
        <button className="btn sm ghost" onClick={() => ed((R) => { R.players = []; R.start = []; R.gk = []; })}>Očisti</button>
      </div>
      {squad.map((p) => {
        const inR = on.has(p.id);
        return (
          <div key={p.id} className={"rline" + (inR ? "" : " off")}>
            <input type="checkbox" className="check" checked={inR} onChange={() => togglePlayer(p)} aria-label={`U zapisniku: broj ${p.num}`} />
            <input className="input sm num" value={p.num} onChange={(e) => setPlayer(p.id, (q) => { q.num = e.target.value.replace(/\D/g, "").slice(0, 2); })} aria-label="Broj na dresu" />
            <input className="input sm" value={p.name} placeholder="Ime i prezime" onChange={(e) => setPlayer(p.id, (q) => { q.name = e.target.value; })} aria-label={`Ime igrača s brojem ${p.num}`} />
            <button className="tgl" aria-pressed={st.has(p.id)} disabled={!inR || (!st.has(p.id) && r.start.length >= 5)} onClick={() => toggle("start", p)} title="Početna petorka">5</button>
            <button className="tgl gk" aria-pressed={gk.has(p.id)} disabled={!inR} onClick={() => toggle("gk", p)} title="Golman">GK</button>
          </div>);
      })}
      <form className="addp" onSubmit={(e) => { e.preventDefault(); addPlayer(); }}>
        <input className="input sm num" value={nn} onChange={(e) => setNn(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="#" aria-label="Broj novog igrača" />
        <input className="input sm" value={nm} onChange={(e) => setNm(e.target.value)} placeholder="Ime novog igrača (može i kasnije)" aria-label="Ime novog igrača" />
        <button className="btn sm" type="submit" disabled={!nn}>{Icon.plus(14)} Dodaj</button>
      </form>
    </div>
  );
}

const ETYPES = [["goal", "Gol"], ["owngoal", "Autogol"], ["foul", "Prekršaj"], ["yellow", "Žuti"], ["red", "Crveni"], ["timeout", "Time-out"]];
function Events({ ix, m, upd }) {
  const [f, setF] = useState({ type: "goal", side: "home", period: 1, time: "", player: "", assist: "" });
  const set = (k, v) => setF((o) => ({ ...o, [k]: v, ...(k === "side" || k === "type" ? { player: "", assist: "" } : {}) }));
  const roster = (side) => (m.roster[side]?.players || []).map((p) => ix.player[p]).filter(Boolean).sort((a, b) => a.num - b.num);
  const parse = (t) => { const mm = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(t.trim()); if (!mm) return null; const sec = +mm[1] * 60 + (+mm[2] || 0); return sec <= 1200 ? sec : null; };
  const sec = parse(f.time);
  const needsPlayer = !["timeout"].includes(f.type);
  const add = () => {
    if (sec == null) return;
    upd((x) => { x.events.push({ id: uid("e"), type: f.type, side: f.side, period: +f.period, sec, ...(needsPlayer && f.player ? { player: f.player } : {}), ...(f.type === "goal" && f.assist ? { assist: f.assist } : {}) });
      if (f.type === "goal" || f.type === "owngoal") x.status = x.status === "scheduled" ? "finished" : x.status; });
    setF((o) => ({ ...o, time: "", player: "", assist: "" }));
  };
  const evs = m.events.filter((e) => e.type !== "shot").sort((a, b) => absSec(b) - absSec(a));
  const pl = roster(f.type === "owngoal" ? f.side : f.side);
  const L = Object.fromEntries(ETYPES);
  return (
    <>
      <form className="evform" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <div className="field" style={{ gridColumn: "1 / -1" }}><span>Vrsta</span>
          <div className="seg">{ETYPES.map(([k, n]) => <button type="button" key={k} aria-pressed={f.type === k} onClick={() => set("type", k)}>{n}</button>)}</div></div>
        <div className="field"><span>Ekipa</span>
          <div className="seg">{["home", "away"].map((s) => <button type="button" key={s} aria-pressed={f.side === s} onClick={() => set("side", s)}>{ix.club[m[s]].short}</button>)}</div></div>
        <div className="field"><span>Poluvrijeme</span>
          <div className="seg">{[[1, "1."], [2, "2."], [3, "Prod."]].map(([k, n]) => <button type="button" key={k} aria-pressed={+f.period === k} onClick={() => set("period", k)}>{n}</button>)}</div></div>
        <label className="field"><span>Vrijeme (mm:ss)</span>
          <input className="input" value={f.time} onChange={(e) => set("time", e.target.value)} placeholder="12:34" inputMode="numeric" aria-invalid={f.time && sec == null} />
          <small>{f.time && sec == null ? "Upiši vrijeme do 20:00." : "proteklo vrijeme u poluvremenu"}</small></label>
        {needsPlayer && <label className="field"><span>{f.type === "owngoal" ? "Igrač (autogol)" : "Igrač"}</span>
          <select className="input" value={f.player} onChange={(e) => set("player", e.target.value)}>
            <option value="">—</option>{pl.map((p) => <option key={p.id} value={p.id}>{p.num} {p.name}</option>)}
          </select></label>}
        {f.type === "goal" && <label className="field"><span>Asistencija</span>
          <select className="input" value={f.assist} onChange={(e) => set("assist", e.target.value)}>
            <option value="">—</option>{pl.filter((p) => p.id !== f.player).map((p) => <option key={p.id} value={p.id}>{p.num} {p.name}</option>)}
          </select></label>}
        <button className="btn primary" type="submit" disabled={sec == null}>Dodaj događaj</button>
      </form>
      {!pl.length && needsPlayer && <div className="pb"><div className="callout warn">Zapisnik za {ix.club[m[f.side]].name} nije unesen, pa igrača nije moguće odabrati.</div></div>}
      <div className="tbl-wrap">
        <table className="atbl">
          <thead><tr><th>Min.</th><th>Vrsta</th><th>Ekipa</th><th>Igrač</th><th /></tr></thead>
          <tbody>{evs.map((e) => (
            <tr key={e.id}>
              <td style={{ font: "700 16px/1 var(--display)" }}>{minute(e)}</td>
              <td>{L[e.type]}</td>
              <td><span className="mt"><Jersey kit={ix.club[m[e.side]].kit} size={18} />{ix.club[m[e.side]].short}</span></td>
              <td>{e.player ? `${ix.player[e.player]?.num ?? ""} ${ix.player[e.player]?.name || ""}` : ""}{e.assist ? <span className="muted small">, asist. {ix.player[e.assist]?.num}</span> : null}</td>
              <td className="nowrap"><button className="btn sm ghost danger" onClick={() => upd((x) => { x.events = x.events.filter((q) => q.id !== e.id); })} aria-label="Obriši događaj">{Icon.trash()}</button></td>
            </tr>))}</tbody>
        </table>
        {!evs.length && <div className="empty">Još nema događaja.</div>}
      </div>
    </>
  );
}

function Analysis({ ix, m, upd }) {
  const a = m.analysis || { status: "none" };
  const A = useAnalysis(m);
  const [toast, setToast] = useState("");
  const flash = (t) => { setToast(t); setTimeout(() => setToast(""), 1800); };
  const H = ix.club[m.home], Aw = ix.club[m.away];
  const ua = (fn) => upd((x) => { x.analysis ||= { status: "none" }; fn(x.analysis); });
  const team = (side) => {
    const r = m.roster[side]; const c = ix.club[m[side]];
    const nums = (ids) => (ids || []).map((p) => ix.player[p]?.num).filter(Boolean);
    return { name: c.name, players: nums(r?.players), gk: nums(r?.gk), start: nums(r?.start), kit: c.kit.shirt, number: c.kit.num };
  };
  const cfg = { match: m.id, youtube: m.youtube || null, hall: m.hall, competition: m.comp, round: m.round,
    roster: { [H.short]: team("home"), [Aw.short]: team("away") } };
  const json = JSON.stringify(cfg, null, 2);
  const copy = async () => { try { await navigator.clipboard.writeText(json); flash("Kopirano"); } catch { flash("Kopiranje nije dopušteno, označi tekst ručno"); } };
  const detected = A.D ? A.D.teams.slice(0, 2) : null;
  return (
    <div className="form-grid">
      <label className="field"><span>Status analize</span>
        <select className="input" value={a.status} onChange={(e) => ua((x) => { x.status = e.target.value; })}>
          {Object.entries(ANALYSIS_LABEL).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select></label>
      <div className="field"><span>Red za obradu</span>
        <button className="btn primary" disabled={!m.youtube || a.status === "queued" || a.status === "processing"} onClick={() => ua((x) => { x.status = "queued"; })}>
          {Icon.video()} Stavi u red</button>
        <small>{m.youtube ? "Obrada kreće sljedeći put kad se pokrene analyze.py --queue." : "Prvo dodaj link snimke pod Osnovno."}</small></div>
      <div className="field wide"><span>Prava na video</span>
        <div className="seg">
          <button type="button" aria-pressed={(a.rights || "embed") === "embed"} onClick={() => ua((x) => { x.rights = "embed"; })}>Samo YouTube embed</button>
          <button type="button" aria-pressed={a.rights === "overlay"} onClick={() => ua((x) => { x.rights = "overlay"; })}>Imamo pisanu dozvolu</button>
        </div>
        <small>{a.rights === "overlay" ? "Prikazuje se vlastiti video s ucrtanim oznakama. Zapiši tko je dao dozvolu i kada." : "Javno se prikazuje originalni YouTube player, a analiza je u panelu i na mini-mapi pored njega. Ovo ne traži dozvolu."}</small>
        {a.rights === "overlay" && <input className="input" value={a.rightsNote || ""} placeholder="npr. Dozvola: MNK Rijeka, mail 30. 10. 2026." onChange={(e) => ua((x) => { x.rightsNote = e.target.value; })} />}
      </div>
      <label className="field"><span>Početak analize na YouTubeu (mm:ss ili h:mm:ss)</span>
        <input className="input" defaultValue={a.ytOffset == null ? "" : fmtHms(a.ytOffset)} placeholder="npr. 12:40"
          onBlur={(e) => { const v = parseHms(e.target.value); ua((x) => { x.ytOffset = v; }); }} />
        <small>Trenutak u YouTube snimci koji odgovara početku analiziranog videa. analyze.py ga upisuje sam kad video preuzme s YouTubea.</small></label>
      <label className="field"><span>Video za preglednik</span>
        <input className="input" value={a.video || ""} placeholder="https://video.…/utakmica.mp4" onChange={(e) => ua((x) => { x.video = e.target.value.trim(); })} />
        <small>Samo uz dozvolu: čisti video s vlastitog hostinga (npr. Cloudflare R2).</small></label>
      <label className="field"><span>Podaci analize</span>
        <input className="input" value={a.data || ""} placeholder="https://…/analiza.json" onChange={(e) => ua((x) => { x.data = e.target.value.trim(); })} /></label>
      <div className="field wide"><span>Koja je ekipa koja boja</span>
        {detected ? (
          <div className="kitpick">
            {["home", "away"].map((side) => {
              const code = Object.entries(a.teamMap || {}).find(([, v]) => v === side)?.[0];
              const t = detected.find((x) => x.name === code);
              return <span key={side} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 22, height: 22, borderRadius: 5, background: t?.color || "var(--line)", boxShadow: "inset 0 0 0 1px rgba(0,0,0,.25)" }} />
                <b>{ix.club[m[side]].name}</b><span className="muted small">({side === "home" ? "domaćin" : "gost"})</span></span>;
            })}
            <button className="btn sm" onClick={() => ua((x) => { const tm = x.teamMap || {}; x.teamMap = Object.fromEntries(Object.entries(tm).map(([k, v]) => [k, v === "home" ? "away" : "home"])); x.kitUnconfirmed = false; })}>
              {Icon.swap()} Zamijeni</button>
            {a.kitUnconfirmed ? <button className="btn sm primary" onClick={() => ua((x) => { x.kitUnconfirmed = false; })}>Potvrdi</button> : <span className="pill done">potvrđeno</span>}
          </div>) : <small>Boje se pojave kad analiza prepozna dresove.</small>}
      </div>
      <div className="field wide"><span>Postavke za analyze.py</span>
        <pre className="code" tabIndex={0}>{json}</pre>
        <div><button className="btn sm" onClick={copy}>Kopiraj</button></div>
        <small>Dok nema zajedničke baze, ovo se sprema kao JSON uz video. Kasnije ga skripta sama povlači.</small></div>
      <Toast msg={toast} />
    </div>
  );
}
