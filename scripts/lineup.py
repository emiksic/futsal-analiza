"""Nasljeđivanje broja preko prekida tracka + postava kao stanje (igrač ostaje dok ga novi broj ne zamijeni).
python3 lineup.py tracks.json camera.json mosaic_S.npy goal_fit.json out_tracks.json out_lineup.json --right RIJ --left NVR
"""
import argparse, json, cv2, numpy as np
from collections import defaultdict
ap = argparse.ArgumentParser()
for k in ("tracks", "camera", "S", "court", "out_tracks", "out_lineup"): ap.add_argument(k)
ap.add_argument("--right", default="RIJ"); ap.add_argument("--left", default="NVR")
ap.add_argument("--max-gap", type=float, default=3.0); ap.add_argument("--field", type=int, default=4)
ap.add_argument("--cfg")
ap.add_argument("--init", help="početna postava, npr. RIJ:4,26,44,77;NVR:7,9,11,14")
a = ap.parse_args()
TEAM = {"bijeli": "RIJ", "ljubicasti": "NVR"}
if a.cfg:
    import os, sys; sys.path.insert(0, os.path.dirname(__file__))
    from matchcfg import Match
    Mt = Match(a.cfg); TEAM = dict(Mt.name)

d = json.load(open(a.tracks)); tl = d["timeline"]; cam = json.load(open(a.camera))
S = np.load(a.S); cf = json.load(open(a.court)); Hc = np.array(cf["H_img_to_court"]); hl = cf["length_m"] / 2
times = [cam[0]["t"] - (cam[1]["t"] - cam[0]["t"])]; Hacc = [np.eye(3)]   # početak kamere
for e in cam: times.append(e["t"]); Hacc.append(np.array(e["H"]) @ Hacc[-1])
times = np.array(times)

# pozicije na terenu za svaku detekciju
for fr in tl:
    M = Hc @ S @ np.linalg.inv(Hacc[int(np.argmin(abs(times - fr["t"])))])
    for p in fr["players"]:
        x1, y1, x2, y2 = p["box"]
        p["court"] = cv2.perspectiveTransform(np.float32([[[(x1 + x2) / 2, y2]]]), M)[0, 0].tolist()

# --- 1) nasljeđivanje broja ---
info = {}
for fr in tl:
    for p in fr["players"]:
        if p["team"] not in TEAM or p.get("gk"): continue
        s = info.setdefault(p["id"], {"team": p["team"], "t0": fr["t"], "p0": p["court"], "player": p.get("player")})
        s["t1"], s["p1"] = fr["t"], p["court"]
        if p.get("player"): s["player"] = p["player"]
def overlap(x, y): return min(x["t1"], y["t1"]) - max(x["t0"], y["t0"])

inherited = {}
changed = True
while changed:                      # ponavljaj dok se lanci šire
    changed = False
    labeled = [k for k, v in info.items() if v["player"]]
    for k in labeled:
        A = info[k]
        best = None
        for j, B in info.items():
            if B["player"] or B["team"] != A["team"]: continue
            for fwd in (True, False):              # B poslije A, ili B prije A
                gap = (B["t0"] - A["t1"]) if fwd else (A["t0"] - B["t1"])
                if not (-1.0 < gap <= a.max_gap): continue
                pa, pb = (A["p1"], B["p0"]) if fwd else (A["p0"], B["p1"])
                dist = float(np.hypot(pa[0] - pb[0], pa[1] - pb[1]))
                if dist > 3.0 + 4.0 * max(gap, 0): continue
                # isti broj ne smije biti na drugom tracku u isto vrijeme
                if any(v["player"] == A["player"] and overlap(v, B) > 1.0 for v in info.values()): continue
                cost = dist + 2 * abs(gap)
                if best is None or cost < best[0]: best = (cost, j)
        if best:
            info[best[1]]["player"] = A["player"]; inherited[best[1]] = A["player"]; changed = True
for fr in tl:
    for p in fr["players"]:
        if p["id"] in inherited: p["player"] = inherited[p["id"]]; p["inherited"] = True

# --- 2) postava kao stanje ---
if a.cfg and Mt.gk: gk_side = {Mt.name[k]: side for side, k in Mt.gk.items()}
else: gk_side = {"RIJ": "R" if a.right == "RIJ" else "L", "NVR": "R" if a.right == "NVR" else "L"}
on = {tm: {} for tm in TEAM.values()}            # broj -> zadnji put viđen
last_pos = {}; gk_last = {}
events = []; out = []; pending = {}
ENTER_MIN, ENTER_WIN, OUT_MIN = 1.0, 4.0, 3.0      # s
if a.init:                                          # poznata postava na početku (zapisnik ili isječak bez izmjena)
    for part in a.init.split(";"):
        tm, nums = part.split(":")
        for n in nums.split(","): on[tm][n] = tl[0]["t"] - 10.0       # "na terenu, još neviđen"
for fr in tl:
    t = fr["t"]
    for p in fr["players"]:
        if p["team"] not in TEAM: continue
        tm = TEAM[p["team"]]
        if p.get("gk"):
            gk_last[tm] = (t, p["court"]); continue
        if not p.get("player"): continue
        num = p["player"].split()[-1]; last_pos[p["player"]] = (t, p["court"])
        if num in on[tm]: on[tm][num] = t; continue
        # histereza: novi broj mora biti viđen dovoljno dugo, a izlazi samo dugo neviđen igrač
        pend = pending.setdefault((tm, num), [])
        pend.append(t); pend[:] = [x for x in pend if t - x <= ENTER_WIN]
        if pend[-1] - pend[0] < ENTER_MIN: continue
        if len(on[tm]) >= a.field:
            out_num = min(on[tm], key=on[tm].get)
            if t - on[tm][out_num] < OUT_MIN: continue          # svi nedavno viđeni -> vjerojatno krivo čitanje
            events.append({"t": t, "team": tm, "in": num, "out": out_num}); del on[tm][out_num]
        elif on[tm]:
            events.append({"t": t, "team": tm, "in": num, "out": None})
        on[tm][num] = t; pending.pop((tm, num), None)
    # golman: zadnja poznata pozicija stegnuta u peterac, inače sredina gola
    gk = {}
    for tm in TEAM.values():
        gx = hl if gk_side[tm] == "R" else -hl
        default = [gx - np.sign(gx) * 1.5, 0.0]
        if tm in gk_last:
            tg, pos = gk_last[tm]
            pos = [float(np.clip(pos[0], min(gx, gx - np.sign(gx) * 6), max(gx, gx - np.sign(gx) * 6))),
                   float(np.clip(pos[1], -6, 6))]
            gk[tm] = {"pos": pos, "visible": t - tg < 0.2}
        else:
            gk[tm] = {"pos": default, "visible": False}
    out.append({"t": t, "on": {tm: sorted(on[tm], key=int) for tm in on},
                "unseen": {tm: [n for n in on[tm] if t - on[tm][n] > 0.2] for tm in on},
                "last_pos": {k: v[1] for k, v in last_pos.items()}, "gk": gk})
# --- 3) eliminacija: neoznačeni track koji je većinu vremena jedini nepoznati svoje ekipe,
#        dok u postavi nedostaje točno jedan broj -> taj broj
hw = cf["width_m"] / 2
lt = np.array([x["t"] for x in out])
cand = defaultdict(lambda: defaultdict(int)); seen_n = defaultdict(int)
for fr in tl:
    st = out[int(np.argmin(abs(lt - fr["t"])))]
    for team, tm in TEAM.items():
        vis = [p for p in fr["players"] if p["team"] == team and not p.get("gk")
               and -hl - 3 <= p["court"][0] <= hl + 3 and -hw - 3 <= p["court"][1] <= hw + 0.5]
        unl = [p for p in vis if not p.get("player")]
        for p in unl: seen_n[p["id"]] += 1
        seen = {p["player"].split()[1] for p in vis if p.get("player")}
        missing = [n for n in st["on"][tm] if n not in seen]
        if len(unl) == 1 and len(missing) == 1: cand[unl[0]["id"]][f"{tm} {missing[0]}"] += 1
elim = {}
tspan = {}
for fr in tl:
    for p in fr["players"]:
        sp = tspan.setdefault(p["id"], [fr["t"], fr["t"]]); sp[1] = fr["t"]
lab_tracks = defaultdict(set)
for fr in tl:
    for p in fr["players"]:
        if p.get("player"): lab_tracks[p["player"]].add(p["id"])
def ov(i, j): return min(tspan[i][1], tspan[j][1]) - max(tspan[i][0], tspan[j][0])
for tid, c in sorted(cand.items(), key=lambda z: -max(z[1].values())):
    ranked = sorted(c.items(), key=lambda z: -z[1]); who, k = ranked[0]
    second = ranked[1][1] if len(ranked) > 1 else 0
    if seen_n[tid] < 5 or k / seen_n[tid] < 0.45 or k < 2 * second: continue
    if any(ov(tid, o) > 1.0 for o in lab_tracks[who]): continue          # igrač je već negdje drugdje
    elim[tid] = who; lab_tracks[who].add(tid)
for fr in tl:
    for p in fr["players"]:
        if p["id"] in elim and not p.get("player"): p["player"] = elim[p["id"]]; p["elim"] = True
print(f"eliminacijom: {len(elim)} trackova -> {sorted(set(elim.values()))}")
lab = sum(1 for fr in tl for p in fr["players"] if p.get("player"))
tot = sum(1 for fr in tl for p in fr["players"] if p["team"] in TEAM and not p.get("gk"))
print(f"detekcija s brojem nakon eliminacije: {lab}/{tot} ({lab/tot*100:.0f}%)")
for tid, c in sorted(cand.items(), key=lambda z: -seen_n[z[0]])[:8]:
    print(f"   track {tid}: vidljiv {seen_n[tid]}x, kandidati {dict(c)}")
json.dump(d, open(a.out_tracks, "w"))
json.dump({"timeline": out, "events": events}, open(a.out_lineup, "w"))
print(f"naslijeđen broj: {len(inherited)} trackova -> {sorted(set(inherited.values()))}")
lab = sum(1 for fr in tl for p in fr["players"] if p.get("player")); tot = sum(1 for fr in tl for p in fr["players"] if p["team"] in TEAM and not p.get("gk"))
print(f"detekcija s brojem: {lab}/{tot} ({lab/tot*100:.0f}%)")
print("postava na kraju:", out[-1]["on"])
for e in events: print(f"  {e['t']:5.1f}s {e['team']}: ulazi {e['in']}" + (f", izlazi {e['out']}" if e["out"] else ""))
