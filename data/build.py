"""Gradi site/src/data/<mapa>.json iz <mapa>/schedule.txt i <mapa>/kN-domacin-gost.txt (postave i golovi, HNS Semafor).
python3 data/build.py hmnl-2026-27 1-hmnl-2026-27 Seniori
python3 data/build.py juniori-2026-27 juniori-2026-27 U-19
"""
import json, os, re, sys, unicodedata
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
    return {"period": per, "sec": tot - (per - 1) * 1200}

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
        if os.path.exists(p):
            det = parse_detail(p); m["source"] = "HNS Semafor"
            name_side = {}
            for side in ("home", "away"):
                club, R = m[side], {"players": [], "start": [], "gk": []}
                for num, name, gk, st in det[side]:
                    pid = f"{club}-{SEASON}-{CAT}-{slug(name)}"     # isti broj zna nositi više igrača tijekom sezone
                    pl = players.setdefault(pid, {"id": pid, "club": club, "season": SEASON, "cat": CAT, "num": num, "name": name, "gk": gk})
                    if pl["num"] != num: problems.append(f"{mid}: {name} ({club}) broj {pl['num']} -> {num}")
                    pl["num"] = num; pl["gk"] = pl["gk"] or gk
                    R["players"].append(pid); (R["gk"].append(pid) if gk else None); (R["start"].append(pid) if st else None)
                    name_side[name] = (side, pid)
                m["roster"][side] = R
            sc = [0, 0]
            for i, (t, name, og) in enumerate(det["goals"]):
                if name not in name_side: problems.append(f"{mid}: strijelac '{name}' nije u postavi"); continue
                side, pid = name_side[name]
                ev = {"id": f"{mid}-g{i}", "type": "owngoal" if og else "goal", "side": side, "player": pid, **to_ev(t)}
                m["events"].append(ev)
                sc[(0 if side == "home" else 1) ^ (1 if og else 0)] += 1
            if sc == [gh, ga]: del m["result"]
            else: problems.append(f"{mid}: golovi {sc} ne odgovaraju rezultatu {[gh, ga]}")
    matches.append(m)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump({"matches": matches, "players": list(players.values())}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(f"{len(matches)} utakmica, {sum(1 for m in matches if m['status']=='finished')} odigrano, {len(players)} igrača -> {OUT}")
for p in problems: print("  !", p)
