"""Golman = track koji je većinu vremena u petercu (bez obzira na boju: golmani imaju drukčiji dres, pa ih
podjela po bojama često svrsta u suce, drugu ekipu ili "?"). Ekipa po strani gola iz match.json ("gk": {"L": .., "R": ..});
ako nije zadano, procjena: ekipa čiji je igrač u polju češće najbliži nekom golu brani taj gol.
python3 gk_fix.py tracks.json camera.json S.npy court.json out.json --cfg match.json
"""
import argparse, json, os, sys, cv2, numpy as np
from collections import defaultdict, Counter
sys.path.insert(0, os.path.dirname(__file__))
from matchcfg import Match
ap = argparse.ArgumentParser()
for k in ("tracks", "camera", "S", "court", "out"): ap.add_argument(k)
ap.add_argument("--cfg", required=True); ap.add_argument("--min-share", type=float, default=0.6)
ap.add_argument("--max-depth", type=float, default=6.0, help="medijan udaljenosti od gol-linije (m)")
a = ap.parse_args()
Mt = Match(a.cfg)
d = json.load(open(a.tracks)); tl = d["timeline"]; cam = json.load(open(a.camera))
S = np.load(a.S); cf = json.load(open(a.court)); Hc = np.array(cf["H_img_to_court"])
hl, hw, D = cf["length_m"] / 2, cf["width_m"] / 2, cf["penalty_m"]
times = [cam[0]["t"] - (cam[1]["t"] - cam[0]["t"])]; Hacc = [np.eye(3)]   # početak kamere
for e in cam: times.append(e["t"]); Hacc.append(np.array(e["H"]) @ Hacc[-1])
times = np.array(times)
for fr in tl:
    Mx = Hc @ S @ np.linalg.inv(Hacc[int(np.argmin(abs(times - fr["t"])))])
    for p in fr["players"]:
        x1, y1, x2, y2 = p["box"]
        p["court"] = cv2.perspectiveTransform(np.float32([[[(x1 + x2) / 2, y2]]]), Mx)[0, 0].tolist()

def in_box(x, y):
    for side, gx in (("R", hl), ("L", -hl)):
        dx = abs(x - gx); dy = max(0, abs(y) - 1.5)
        if dx <= hl and np.hypot(dx, dy) <= D + 1.0: return side
    return None
def on_court(x, y): return abs(x) <= hl + 2 and -hw - 2 <= y <= hw + 0.5

stat = defaultdict(Counter); gdist = defaultdict(list); span = {}
for fr in tl:
    for p in fr["players"]:
        if p["team"] in ("klupa", "osoblje") or not on_court(*p["court"]): continue
        side = in_box(*p["court"]); stat[p["id"]][side] += 1; stat[p["id"]]["n"] += 1
        if side: gdist[(p["id"], side)].append(hl - abs(p["court"][0]))
        sp = span.setdefault(p["id"], [fr["t"], fr["t"]]); sp[1] = fr["t"]
cand = []
for tid, s in stat.items():
    for side in ("L", "R"):
        if s["n"] >= 8 and s[side] / s["n"] >= a.min_share and np.median(gdist[(tid, side)]) <= a.max_depth:
            cand.append((s[side], tid, side))
gks = {}; taken = defaultdict(list)                         # jedan golman po golu u isto vrijeme
for score, tid, side in sorted(cand, reverse=True):
    if any(min(span[tid][1], span[o][1]) - max(span[tid][0], span[o][0]) > 0.5 for o in taken[side]): continue
    gks[tid] = side; taken[side].append(tid)

sides = dict(Mt.gk)
if set(sides) != {"L", "R"}:
    deep = {"L": Counter(), "R": Counter()}
    for fr in tl:
        out = [p for p in fr["players"] if p["team"] in Mt.teams[:2] and p["id"] not in gks and on_court(*p["court"])]
        if len(out) < 4: continue
        deep["L"][min(out, key=lambda p: p["court"][0])["team"]] += 1
        deep["R"][max(out, key=lambda p: p["court"][0])["team"]] += 1
    tA, tB = Mt.teams[:2]
    score = (deep["L"][tA] - deep["L"][tB]) + (deep["R"][tB] - deep["R"][tA])     # >0: A brani lijevo
    sides = {"L": tA, "R": tB} if score > 0 else {"L": tB, "R": tA}
    print(f"strana golova procijenjena (zadnji igrač): L={Mt.name[sides['L']]}, R={Mt.name[sides['R']]}  "
          f"(L: {dict(deep['L'])}, R: {dict(deep['R'])}) -> zapiši u match.json 'gk' ako treba ispraviti")
    Mt.c["gk"] = sides; Mt.save(a.cfg)
for fr in tl:
    for p in fr["players"]:
        if p["id"] in gks: p["gk"] = True; p["team"] = sides[gks[p["id"]]]
json.dump(d, open(a.out, "w"))
for tid, side in gks.items():
    print(f"golman: track {tid}, gol {side} -> {Mt.name[sides[side]]}  ({stat[tid][side]}/{stat[tid]['n']} u petercu)")
