"""Osoblje (trener i sl.) među trackovima ekipe: hlače ili majica jasno drukčije od ostatka ekipe.
python3 staff_filter.py clip.mp4 tracks.json out.json --cfg match.json [--shorts 40] [--shirt 22]
"""
import argparse, json, os, sys, cv2, numpy as np
from collections import defaultdict
sys.path.insert(0, os.path.dirname(__file__))
from matchcfg import Match
ap = argparse.ArgumentParser()
ap.add_argument("video"); ap.add_argument("tracks"); ap.add_argument("out"); ap.add_argument("--cfg", required=True)
ap.add_argument("--shorts", type=float, default=40); ap.add_argument("--shirt", type=float, default=22)
ap.add_argument("--every", type=int, default=3)
ap.add_argument("--hw", type=float, default=10.0, help="pola širine terena (m); osoblje je uz uzdužnu liniju ili izvan")
a = ap.parse_args()
Mt = Match(a.cfg)
d = json.load(open(a.tracks)); tl = d["timeline"]
cap = cv2.VideoCapture(a.video); fps = cap.get(5)

def region_lab(f, box, y0, y1):
    x1, ya, x2, yb = box; h, w = yb - ya, x2 - x1
    c = f[ya + int(y0 * h): ya + int(y1 * h), x1 + int(.25 * w): x2 - int(.25 * w)]
    if c.size == 0: return None
    hsv = cv2.cvtColor(c, cv2.COLOR_BGR2HSV).reshape(-1, 3)
    keep = ~((hsv[:, 0] >= 8) & (hsv[:, 0] <= 28) & (hsv[:, 1] > 50) & (hsv[:, 2] > 90))
    lab = cv2.cvtColor(c, cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(float)[keep]
    return None if len(lab) < 8 else np.median(lab, 0)
def dist(x, y): return float(np.hypot(0.5 * (x[0] - y[0]), np.hypot(x[1] - y[1], x[2] - y[2])))

shorts, shirt = defaultdict(list), defaultdict(list)
for k, fr in enumerate(tl):
    if k % a.every: continue
    cand = [p for p in fr["players"] if p["team"] in Mt.teams and not p.get("gk") and p["box"][3] < 715
            and p["box"][3] - p["box"][1] > 40]
    if not cand: continue
    cap.set(1, round(fr["t"] * fps)); f = cap.read()[1]
    for p in cand:
        s = region_lab(f, p["box"], .52, .68); t = region_lab(f, p["box"], .18, .45)
        if s is not None: shorts[p["id"]].append(s)
        if t is not None: shirt[p["id"]].append(t)
team_of = {p["id"]: p["team"] for fr in tl for p in fr["players"]}
ypos = defaultdict(list)
for fr in tl:
    for p in fr["players"]:
        if "court" in p: ypos[p["id"]].append(p["court"][1])
def at_line(i): return not ypos[i] or abs(np.median(ypos[i])) > a.hw - 1.5
staff = set()
for tm in Mt.teams:
    ids = [i for i in shorts if team_of.get(i) == tm and len(shorts[i]) >= 3]
    if not ids: continue
    ref_s = np.median(np.concatenate([shorts[i] for i in ids]), 0)
    ref_t = np.median(np.concatenate([shirt[i] for i in ids if shirt[i]]), 0)
    for i in ids:
        ds = dist(np.median(shorts[i], 0), ref_s)
        dt = dist(np.median(shirt[i], 0), ref_t) if len(shirt[i]) >= 3 else 0
        if (ds > a.shorts or dt > a.shirt) and at_line(i):
            staff.add(i); print(f"  osoblje? track {i} ({Mt.name[tm]}): hlače {ds:.0f}, majica {dt:.0f}, uzoraka {len(shorts[i])}")
for fr in tl:
    for p in fr["players"]:
        if p["id"] in staff: p["team"] = "osoblje"
json.dump(d, open(a.out, "w"))
print("trackova osoblja:", sorted(staff))
