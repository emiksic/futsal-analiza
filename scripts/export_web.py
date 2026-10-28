"""Izvoz analize za web preglednik: kompaktan JSON po frameu (igrači, lopta, postava, posjed, homografija teren->slika).
python3 export_web.py tracks.json camera.json S.npy court.json match.json out.json --title "..." --t0 128
       [--ball ball.json] [--clock clock.json] [--lineup lineup.json] [--start s] [--end s]
--t0: vrijeme podataka koje odgovara početku (0 s) web videa.
"""
import argparse, json, os, sys, cv2, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from matchcfg import Match
from smooth import foot_and_cov, smooth_positions

ap = argparse.ArgumentParser()
for k in ("tracks", "camera", "S", "court", "cfg", "out"): ap.add_argument(k)
ap.add_argument("--title", required=True); ap.add_argument("--t0", type=float, default=0.0)
ap.add_argument("--ball"); ap.add_argument("--clock"); ap.add_argument("--lineup")
ap.add_argument("--start", type=float, default=0); ap.add_argument("--end", type=float, default=1e9)
a = ap.parse_args()
Mt = Match(a.cfg); TEAMS = Mt.teams[:2]
MARGIN_FAR, MARGIN_ENDS, MARGIN_NEAR, POSS_DIST = 3.0, 3.0, 0.5, 1.5

tl = [fr for fr in json.load(open(a.tracks))["timeline"] if a.start <= fr["t"] <= a.end]
cam = json.load(open(a.camera)); S = np.load(a.S); cf = json.load(open(a.court)); Hc = np.array(cf["H_img_to_court"])
hl, hw, D = cf["length_m"] / 2, cf["width_m"] / 2, cf["penalty_m"]
ball = json.load(open(a.ball)) if a.ball else []; bt = np.array([b["t"] for b in ball]) if ball else None
clock = json.load(open(a.clock)) if a.clock else None; ct = np.array([c["t"] for c in clock]) if clock else None
lineup = json.load(open(a.lineup)) if a.lineup else None
lt = np.array([x["t"] for x in lineup["timeline"]]) if lineup else None
times = [cam[0]["t"] - (cam[1]["t"] - cam[0]["t"])]; Hacc = [np.eye(3)]
for e in cam: times.append(e["t"]); Hacc.append(np.array(e["H"]) @ Hacc[-1])
times = np.array(times)
def Mframe(t): return Hc @ S @ np.linalg.inv(Hacc[int(np.argmin(abs(times - t)))])
def on_court(x, y): return -hl - MARGIN_ENDS <= x <= hl + MARGIN_ENDS and -hw - MARGIN_FAR <= y <= hw + MARGIN_NEAR
def team_idx(t): return TEAMS.index(t) if t in TEAMS else (2 if t == "sudac" else None)

# izglađene pozicije
samples = {}; Ms = {}
for fr in tl:
    M = Mframe(fr["t"]); Ms[fr["t"]] = M
    for p in fr["players"]:
        if team_idx(p["team"]) is None: continue
        z, R = foot_and_cov(M, p["box"])
        if on_court(*z): samples.setdefault(p["id"], []).append((fr["t"], z, R))
SM = smooth_positions(samples)

players = sorted({p["player"] for fr in tl for p in fr["players"] if p.get("player")},
                 key=lambda s: (s.split()[0], int(s.split()[-1])))
pidx = {s: i for i, s in enumerate(players)}
states, state_idx = [], {}
frames = []; poss = [0, 0]; last_team = None
r1 = lambda v: round(float(v), 1); r2 = lambda v: round(float(v), 2)
for fr in tl:
    t = fr["t"]; M = Ms[t]
    Hci = np.linalg.inv(M); Hci = Hci / Hci[2, 2]
    P = []; cand = []
    for p in fr["players"]:
        ti = team_idx(p["team"])
        if ti is None: continue
        x1, y1, x2, y2 = p["box"]
        raw = cv2.perspectiveTransform(np.float32([[[(x1 + x2) / 2, y2]]]), M)[0, 0]
        if not on_court(*raw): continue
        sx, sy = SM.get((p["id"], round(float(t), 3)), raw)
        P.append([ti, pidx.get(p.get("player"), -1), int(bool(p.get("gk"))), x1, y1, x2, y2, r2(sx), r2(sy)])
        if ti < 2: cand.append((len(P) - 1, raw))
    B = None; holder = -1
    if ball:
        b = ball[int(np.argmin(abs(bt - t)))]
        if b["ball"] is not None and abs(b["t"] - t) < 0.05:
            g = cv2.perspectiveTransform(np.float32([[b["ball"]]]), M)[0, 0]
            B = [r1(b["ball"][0]), r1(b["ball"][1]), r2(g[0]), r2(g[1]), 1 if b["src"] == "det" else 0]
            near = [(np.hypot(*(raw - g)), i) for i, raw in cand]
            if near:
                d, i = min(near)
                if d < POSS_DIST: holder = i
    live = True if clock is None else clock[int(np.argmin(abs(ct - t)))]["running"]
    if holder >= 0: last_team = P[holder][0]
    if last_team is not None and live: poss[last_team] += 1
    L = None; G = []
    if lineup:
        st = lineup["timeline"][int(np.argmin(abs(lt - t)))]
        key = json.dumps([[st["on"].get(Mt.name[k], []) for k in TEAMS], [st["unseen"].get(Mt.name[k], []) for k in TEAMS]])
        if key not in state_idx: state_idx[key] = len(states); states.append(json.loads(key))
        L = state_idx[key]
        for k_i, k in enumerate(TEAMS):
            g = st["gk"].get(Mt.name[k])
            if g and not g["visible"]: G.append([k_i, r2(g["pos"][0]), r2(g["pos"][1])])
    frames.append({"t": round(t - a.t0, 3), "H": [float(f"{v:.6g}") for v in Hci.ravel()[:8]], "p": P, "b": B,
                   "h": holder, "live": int(live), "pc": list(poss), "L": L, "g": G})

def hexc(bgr): return "#%02x%02x%02x" % (int(bgr[2]), int(bgr[1]), int(bgr[0]))
events = []
if lineup:
    for e in lineup["events"]:
        if a.start <= e["t"] <= a.end and e.get("out"):
            events.append({"t": round(e["t"] - a.t0, 2), "team": [Mt.name[k] for k in TEAMS].index(e["team"]), "in": e["in"], "out": e["out"]})
out = {"title": a.title, "fps": round(1 / (tl[1]["t"] - tl[0]["t"]), 2), "img": [1280, 720],
       "teams": [{"name": Mt.name[k], "color": hexc(Mt.bgr[k])} for k in TEAMS] + [{"name": "Sudac", "color": "#e5484d"}],
       "court": {"L": round(2 * hl, 2), "W": round(2 * hw, 2), "D": round(D, 2)},
       "players": players, "states": states, "events": events, "frames": frames}
json.dump(out, open(a.out, "w"), separators=(",", ":"))
print(f"{a.title}: {len(frames)} frameova, {len(players)} igrača, {len(states)} stanja postave, "
      f"{len(events)} izmjena, {os.path.getsize(a.out)/1e6:.2f} MB, posjed {poss}")
