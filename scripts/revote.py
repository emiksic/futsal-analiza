"""Ponovno glasanje za brojeve iz već spremljenih čitanja (bez ponovnog OCR-a).
- čitanje '1' ima malu težinu (pruge, djelomični brojevi)
- jednoznamenkasto čitanje djelomično podržava dvoznamenkasti broj koji ga sadrži (4 -> 44, 1 -> 11)
python3 revote.py tracks.json numbers.json out_tracks.json
"""
import sys, json
from collections import defaultdict
trk, nump, outp = sys.argv[1:4]
import os; sys.path.insert(0, os.path.dirname(__file__))
from matchcfg import Match
Mt = Match(sys.argv[4]) if len(sys.argv) > 4 else None
TEAMS = tuple(Mt.teams) if Mt else ("bijeli", "ljubicasti")
d = json.load(open(trk)); tl = d["timeline"]; reads = json.load(open(nump))["reads"]

team_of, span, gk = {}, defaultdict(lambda: [1e9, -1e9]), set()
for fr in tl:
    for p in fr["players"]:
        team_of[p["id"]] = p["team"]; s = span[p["id"]]; s[0] = min(s[0], fr["t"]); s[1] = max(s[1], fr["t"])
        if p.get("gk"): gk.add(p["id"])

ROSTER_MODE = len(sys.argv) > 5 and sys.argv[5] == "--roster"
W_ONE = 1.0 if ROSTER_MODE else 0.25; W_SUPPORT = 0.0 if ROSTER_MODE else 0.5   # sa zapisnikom: bez heuristika za "1" i djelomične brojeve
raw = defaultdict(lambda: defaultdict(float)); n = defaultdict(int)
for r in reads:
    if team_of.get(r["id"]) not in TEAMS or r["id"] in gk: continue
    w = r["conf"] ** 2 * (W_ONE if r["num"] == "1" else 1.0)
    raw[r["id"]][r["num"]] += w; n[r["id"]] += 1

track_num = {}
for tid, v in raw.items():
    score = dict(v)
    for num in list(v):                                   # podrška jednoznamenkastih za dvoznamenkaste
        if len(num) == 2:
            for dgt in set(num):
                if dgt in v: score[num] += W_SUPPORT * v[dgt]
    tot = sum(v.values()) + 1e-9
    num, sc = max(score.items(), key=lambda z: z[1])
    share = min(1.0, sc / tot)
    if sc >= 0.8 and share >= 0.5:
        track_num[tid] = {"num": num, "score": round(sc, 2), "share": round(share, 2), "n": n[tid]}

players = defaultdict(list); conflicts = []
for tid, info in sorted(track_num.items(), key=lambda z: -z[1]["score"]):
    key = (team_of[tid], info["num"])
    OVERLAP_OK = 1.0          # s: kratko preklapanje = predaja tracka, isti igrač
    if any(min(span[tid][1], span[o][1]) - max(span[tid][0], span[o][0]) > OVERLAP_OK for o in players[key]):
        conflicts.append((tid, key)); continue
    players[key].append(tid)
name = (lambda t, nm: f"{Mt.name[t]} {nm}") if Mt else (lambda t, nm: f"{'RIJ' if t == 'bijeli' else 'NVR'} {nm}")
pid_of = {tid: name(t, nm) for (t, nm), tids in players.items() for tid in tids}
for fr in tl:
    for p in fr["players"]:
        p.pop("player", None)
        if p["id"] in pid_of: p["player"] = pid_of[p["id"]]
json.dump(d, open(outp, "w"))

tot_det = sum(1 for fr in tl for p in fr["players"] if p["team"] in TEAMS and p["id"] not in gk)
lab_det = sum(1 for fr in tl for p in fr["players"] if "player" in p)
print(f"trackova s brojem: {len(track_num)}  | detekcija igraca s poznatim brojem: {lab_det}/{tot_det} ({lab_det/tot_det*100:.0f}%)")
for (t, nm), tids in sorted(players.items(), key=lambda z: (z[0][0], int(z[0][1]))):
    dur = sum(span[x][1] - span[x][0] for x in tids)
    print(f"  {name(t, nm):7s} trackovi {tids}  (~{dur:.0f} s)")
if conflicts: print("  konflikti:", conflicts)
