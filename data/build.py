"""Gradi site/src/data/<mapa>.json iz <mapa>/schedule.txt i <mapa>/kN-domacin-gost.txt (postave i golovi, HNS Semafor).
python3 data/build.py hmnl-2026-27 1-hmnl-2026-27 Seniori
python3 data/build.py juniori-2026-27 juniori-2026-27 U-19
python3 data/build.py kadeti-2026-27 kadeti-2026-27 U-17

Mlađe kategorije (U-19, U-17): postave i događaji dolaze iz data/private/semafor-2026-27.txt (puna imena, nije u repou).
U javni JSON idu samo brojevi i neprozirni ID-jevi igrača; imena idu u data/private/<mapa>.sql koji se pokrene u Supabaseu.
"""
import hashlib, json, os, re, sys, unicodedata
def slug(s): return re.sub(r"[^a-z0-9]+", "-", unicodedata.normalize("NFKD", s.replace("đ", "d").replace("Đ", "D")).encode("ascii", "ignore").decode().lower()).strip("-")
NAME, CID, CAT = sys.argv[1], sys.argv[2], sys.argv[3]
SEASON = "2026-27"
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), NAME)
OUT = os.path.join(D, "..", "..", "site", "src", "data", NAME + ".json")

def parse_detail(path):
    sec, out = None, {"home": [], "away": [], "goals": []}
    for ln in open(path, encoding="utf-8"):
        ln = ln.strip()
        if not ln: continue
        if ln in ("HOME_PLAYERS", "AWAY_PLAYERS", "GOALS"): sec = ln; continue
        f = ln.split("|")
        if sec == "GOALS": out["goals"].append((f[0], f[1], f[2] == "AG"))
        else: out["home" if sec == "HOME_PLAYERS" else "away"].append((f[0], f[1], f[2] == "GK", f[3] == "S"))
    return out

def to_ev(t):
    m = re.match(r"(\d+)(?:'(\d+)\")?'?$", t)
    mins, s = int(m.group(1)), m.group(2)
    tot = mins * 60 + int(s) if s is not None else (mins - 1) * 60 + 30
    per = min(tot // 1200 + 1, 3) if tot < 2400 else 3
    if tot >= 2400 and mins <= 40: per, tot = 2, 2399
    ev = {"period": per, "sec": tot - (per - 1) * 1200}
    if s is not None: ev["exact"] = True      # sekunda poznata (inače je minuta, sredina minute)
    return ev

YOUTH = CAT in ("U-19", "U-17")
CLUB = {"Crnica": "crnica", "Olmissum": "olmissum", "Futsal Istra Pula": "pula", "Square": "square", "Uspinjača Gimka": "gimka",
        "Hajduk": "hajduk", "Universitas Split": "universitas", "Futsal Dinamo": "futsal-dinamo", "Osijek": "osijek",
        "Novo vrijeme": "novo-vrijeme", "Rijeka": "rijeka", "Torcida": "torcida"}

def load_private():
    """Blokovi '=== K|J id Domaćin - Gost r:r' (izvoz iz Semafora). Vraća {(domaćin, gost): detalji} za ovu kategoriju."""
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "private", "semafor-2026-27.txt")
    if not os.path.exists(p): return {}
    want = {"U-19": "J", "U-17": "K"}[CAT]; out = {}
    for blk in open(p, encoding="utf-8").read().split("=== ")[1:]:
        lines = blk.strip().split("\n")
        m = re.match(r"([KJ]) (\d+) (.+?) - (.+?) \d+:\d+$", lines[0])
        if m.group(1) != want: continue
        club = lambda t: CLUB[re.sub(r"^(H|A)?MNK ", "", t)]
        det = {"semafor": m.group(2), "home": [], "away": [], "goals": [], "cards": []}
        sec = None
        for ln in lines[1:]:
            if ln.startswith("RESULT"): continue
            if ln in ("HOME_PLAYERS", "AWAY_PLAYERS", "GOALS"): sec = ln; continue
            if sec == "GOALS":
                t, name, kind, col = ln.split("|")
                det["goals"].append((t, name, kind == "AG", "home" if col == "col0" else "away", "ten_meters" in kind or "six_meters" in kind))
            else:
                main, _, ev = ln.partition(" #"); num, name, gk, st = main.split("|")
                side = "home" if sec == "HOME_PLAYERS" else "away"
                det[side].append((num, name, gk == "GK", st == "S"))
                last = None
                for e in filter(None, ev.split(",")):
                    k, _, t = e.partition("@")
                    if k in ("y", "yy", "r"): det["cards"].append((t or last, name, side, k)); last = t or last
        out[(club(m.group(3)), club(m.group(4)))] = det
    return out

def player_id(club, name):
    if not YOUTH: return f"{club}-{SEASON}-{CAT}-{slug(name)}"
    # za mlađe kategorije ime se ne smije vidjeti ni u ID-ju
    return f"{club}-{SEASON}-{CAT}-p" + hashlib.sha1(f"{club}|{slug(name)}".encode()).hexdigest()[:8]

PRIV = load_private() if YOUTH else {}
players, matches, problems = {}, [], []
for ln in open(os.path.join(D, "schedule.txt"), encoding="utf-8"):
    ln = ln.strip()
    if not ln or ln.startswith("#"): continue
    rnd, when, home, away, res, hall, bc = ln.split("|")
    rnd = int(rnd)
    if " " in when: d, t = when.split(" "); tbd = False
    else: d, t, tbd = when, "20:00", True
    dd, mm, yy = d.split(".")
    off = "+01:00" if (int(mm) in (11, 12, 1, 2) or (int(mm) == 3 and int(dd) < 28) or (int(mm) == 10 and int(dd) >= 25)) else "+02:00"
    mid = f"{CID}-k{rnd}-{home}-{away}"
    m = {"id": mid, "comp": CID, "round": rnd, "date": f"{yy}-{mm}-{dd}T{t}:00{off}", "home": home, "away": away, "hall": hall,
         "status": "finished" if res else "scheduled", "youtube": "", "roster": {"home": None, "away": None}, "events": [], "analysis": None}
    if tbd: m["timeTbd"] = True
    if bc.startswith("yt:"): m["youtube"] = "https://www.youtube.com/watch?v=" + bc[3:]
    elif bc.startswith("tv:"): m["tv"] = bc[3:]
    if res:
        gh, ga = map(int, res.split(":")); m["result"] = [gh, ga]
        p = os.path.join(D, f"k{rnd}-{home}-{away}.txt")
        det = PRIV.pop((home, away), None) if YOUTH else (parse_detail(p) if os.path.exists(p) else None)
        if det:
            m["source"] = "HNS Semafor"
            name_side = {}
            for side in ("home", "away"):
                club, R = m[side], {"players": [], "start": [], "gk": []}
                if YOUTH: R["num"] = {}
                for num, name, gk, st in det[side]:
                    pid = player_id(club, name)     # isti broj zna nositi više igrača tijekom sezone
                    pl = players.setdefault(pid, {"id": pid, "club": club, "season": SEASON, "cat": CAT, "num": num, "name": name, "gk": gk})
                    if pl["num"] != num: problems.append(f"{mid}: {name} ({club}) broj {pl['num']} -> {num}")
                    pl["num"] = num; pl["gk"] = pl["gk"] or gk
                    if YOUTH: R["num"][pid] = num
                    R["players"].append(pid); (R["gk"].append(pid) if gk else None); (R["start"].append(pid) if st else None)
                    name_side[(side, name)] = pid
                m["roster"][side] = R
            sc = [0, 0]
            for i, g in enumerate(det["goals"]):
                t, name, og = g[:3]
                if YOUTH: benef = g[3]; side = benef if not og else ("away" if benef == "home" else "home")
                else: side = next((s_ for (s_, n) in name_side if n == name), None)
                pid = name_side.get((side, name))
                if not pid: problems.append(f"{mid}: strijelac '{name}' nije u postavi"); continue
                ev = {"id": f"{mid}-g{i}", "type": "owngoal" if og else "goal", "side": side, "player": pid, **to_ev(t)}
                if YOUTH and g[4]: ev["pen"] = True
                m["events"].append(ev)
                sc[(0 if side == "home" else 1) ^ (1 if og else 0)] += 1
            for i, (t, name, side, k) in enumerate(det.get("cards", [])):
                ev = {"id": f"{mid}-c{i}", "type": "yellow" if k == "y" else "red", "side": side, "player": name_side[(side, name)], **to_ev(t)}
                if k == "yy": ev["secondYellow"] = True
                m["events"].append(ev)
            m["events"].sort(key=lambda e: (e["period"], e["sec"]))
            if sc == [gh, ga]: del m["result"]
            else: problems.append(f"{mid}: golovi {sc} ne odgovaraju rezultatu {[gh, ga]}")
    matches.append(m)

for k in PRIV: problems.append(f"u izvozu, ali nije u rasporedu: {k}")
os.makedirs(os.path.dirname(OUT), exist_ok=True)
pub = [{**p, "name": ""} for p in players.values()] if YOUTH else list(players.values())
json.dump({"matches": matches, "players": pub}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
if YOUTH and players:
    q = lambda v: "null" if v is None else "'" + str(v).replace("'", "''") + "'"
    sql = [f"-- {NAME}: igrači s punim imenima i zapisnici. PRIVATNO, ne dijeliti i ne stavljati u repo.",
           "-- Pokreni cijelu datoteku u Supabase → SQL Editor. Može se pokrenuti više puta.", "begin;",
           "insert into public.players (id, club, season, cat, num, name, gk) values"]
    sql.append(",\n".join(f"  ({q(p['id'])}, {q(p['club'])}, {q(p['season'])}, {q(p['cat'])}, {q(p['num'])}, {q(p['name'])}, {str(p['gk']).lower()})"
                          for p in players.values()))
    sql.append("on conflict (id) do update set num = excluded.num, name = excluded.name, gk = excluded.gk;")
    for m in matches:
        if m.get("source") != "HNS Semafor": continue
        sql.append(f"update public.matches set roster = {q(json.dumps(m['roster'], ensure_ascii=False))}::jsonb, "
                   f"events = {q(json.dumps(m['events'], ensure_ascii=False))}::jsonb, source = 'HNS Semafor' where id = {q(m['id'])};")
    if CAT == "U-19":   # stari igrači samo s brojem (RIJ–NVR, 3. kolo) više ne trebaju
        sql.append("delete from public.players where id ~ '^(rijeka|novo-vrijeme)-2026-27-U-19-[0-9]+$';")
    sql.append("commit;")
    sp = os.path.join(os.path.dirname(os.path.abspath(__file__)), "private", NAME + ".sql")
    open(sp, "w", encoding="utf-8").write("\n".join(sql) + "\n")
    print("privatni SQL:", sp)
print(f"{len(matches)} utakmica, {sum(1 for m in matches if m['status']=='finished')} odigrano, {len(players)} igrača -> {OUT}")
for p in problems: print("  !", p)
