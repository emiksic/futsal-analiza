"""Nauči boju brojeva na dresu za svaku ekipu i upiši je u match.json (teams[k]["num_lab"]).
Pikseli u sredini torza koji nisu boja dresa ni parket/koža -> k-means -> najčešća boja = boja broja.
python3 num_color.py clip.mp4 tracks.json match.json [--samples 400]
"""
import argparse, json, os, sys, cv2, numpy as np
from sklearn.cluster import KMeans
sys.path.insert(0, os.path.dirname(__file__))
from matchcfg import Match
ap = argparse.ArgumentParser(); ap.add_argument("video"); ap.add_argument("tracks"); ap.add_argument("cfg")
ap.add_argument("--samples", type=int, default=400); ap.add_argument("--min-h", type=int, default=80)
a = ap.parse_args()
Mt = Match(a.cfg); tl = json.load(open(a.tracks))["timeline"]
cap = cv2.VideoCapture(a.video); fps = cap.get(5)
rng = np.random.default_rng(0)
items = [(fr["t"], p) for fr in tl for p in fr["players"]
         if p["team"] in Mt.teams and not p.get("gk") and p["box"][3] - p["box"][1] >= a.min_h and p["box"][3] < 716]
rng.shuffle(items)
px = {k: [] for k in Mt.teams}; cnt = {k: 0 for k in Mt.teams}
for t, p in items:
    tm = p["team"]
    if cnt[tm] >= a.samples: continue
    cap.set(1, round(t * fps)); f = cap.read()[1]
    x1, y1, x2, y2 = p["box"]; h, w = y2 - y1, x2 - x1
    c = f[y1 + int(.18 * h): y1 + int(.45 * h), x1 + int(.3 * w): x2 - int(.3 * w)]
    if c.size == 0: continue
    lab = cv2.cvtColor(c, cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(float)
    hsv = cv2.cvtColor(c, cv2.COLOR_BGR2HSV).reshape(-1, 3)
    kl = Mt.kit_lab[tm]
    dL = lab[:, 0] - kl[0]; dC = np.hypot(lab[:, 1] - kl[1], lab[:, 2] - kl[2])
    skin = (hsv[:, 0] >= 5) & (hsv[:, 0] <= 28) & (hsv[:, 1] > 45) & (hsv[:, 2] > 80)
    far = ((np.abs(dL) > 30) | (dC > 14)) & ~skin
    if far.sum() >= 5: px[tm].append(lab[far]); cnt[tm] += 1
for tm in Mt.teams:
    if not px[tm]: print(f"{Mt.name[tm]}: premalo uzoraka"); continue
    P = np.concatenate(px[tm]); P = P[rng.choice(len(P), min(20000, len(P)), replace=False)]
    km = KMeans(3, n_init=5, random_state=0).fit(P * [0.5, 1, 1])
    sizes = np.bincount(km.labels_, minlength=3)
    # boja broja: najveća skupina koja nije tamna sjena dresa (sjene su bliže dresu po tonu, tamnije)
    order = np.argsort(-sizes); best = None
    for c in order:
        cen = km.cluster_centers_[c] / [0.5, 1, 1]
        dC = np.hypot(cen[1] - Mt.kit_lab[tm][1], cen[2] - Mt.kit_lab[tm][2])
        if dC > 10 or abs(cen[0] - Mt.kit_lab[tm][0]) > 60: best = cen; break
    if best is None: best = km.cluster_centers_[order[0]] / [0.5, 1, 1]
    Mt.c["teams"][tm]["num_lab"] = best.round(1).tolist()
    sw = cv2.cvtColor(np.uint8([[best]]), cv2.COLOR_LAB2BGR)[0, 0].tolist()
    print(f"{Mt.name[tm]}: dres Lab {Mt.kit_lab[tm].round(0).tolist()} -> broj Lab {best.round(0).tolist()} (BGR {sw}), uzoraka {cnt[tm]}")
Mt.save(a.cfg)
