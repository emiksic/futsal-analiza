"""Automatske ekipe: k-means na boji torza (po tracku) -> match.json + tracks s oznakama A/B/sudac/?.
python3 team_cluster.py clip.mp4 tracks.json out_tracks.json match.json [--k 5] [--names DIN,OLM] [--every 2]
       [--court court.json --camera camera_global.json --S mosaic_S.npy]   (preporučeno: samo igrači na terenu)
S kalibracijom se klasteriraju samo trackovi koji su većinom na terenu, pa publika ispred kamere ne postane "ekipa".
Ekipa A = veća od dvije glavne skupine. Imena se mogu kasnije promijeniti u match.json.
"""
import argparse, json, os, sys, numpy as np, cv2
from collections import defaultdict, Counter
from sklearn.cluster import KMeans
sys.path.insert(0, os.path.dirname(__file__))
from matchcfg import chroma_feat, torso_lab

ap = argparse.ArgumentParser()
for k in ("video", "tracks", "out", "cfg"): ap.add_argument(k)
ap.add_argument("--k", type=int, default=5); ap.add_argument("--every", type=int, default=2)
ap.add_argument("--names", default="A,B")
ap.add_argument("--court"); ap.add_argument("--camera"); ap.add_argument("--S")
a = ap.parse_args()
d = json.load(open(a.tracks)); tl = d["timeline"]
cap = cv2.VideoCapture(a.video); fps = cap.get(5)

on_share = None                                  # udio detekcija tracka na terenu (ako je zadana kalibracija)
if a.court and a.camera and a.S:
    cam = json.load(open(a.camera)); S = np.load(a.S); cf = json.load(open(a.court)); Hc = np.array(cf["H_img_to_court"])
    hl, hw = cf["length_m"] / 2, cf["width_m"] / 2
    times = [cam[0]["t"] - (cam[1]["t"] - cam[0]["t"])]; Hacc = [np.eye(3)]
    for e in cam: times.append(e["t"]); Hacc.append(np.array(e["H"]) @ Hacc[-1])
    times = np.array(times); onc = defaultdict(lambda: [0, 0]); FH = int(cv2.VideoCapture(a.video).get(4)) or 720
    for fr in tl:
        Mx = Hc @ S @ np.linalg.inv(Hacc[int(np.argmin(abs(times - fr["t"])))])
        for p in fr["players"]:
            x1, y1, x2, y2 = p["box"]; gx, gy = cv2.perspectiveTransform(np.float32([[[(x1 + x2) / 2, y2]]]), Mx)[0, 0]
            whole = y2 < FH - 8 and (y2 - y1) >= 1.4 * (x2 - x1)          # cijela osoba (stopala u slici), ne glava/leđa publike
            onc[p["id"]][0] += bool(whole and abs(gx) <= hl + 1 and abs(gy) <= hw + 1); onc[p["id"]][1] += 1
    on_share = {t: c[0] / c[1] for t, c in onc.items()}
    print(f"trackova većinom na terenu: {sum(v >= 0.5 for v in on_share.values())} / {len(on_share)}")

labs = defaultdict(list)
for fr in tl:                                   # makni staru značajku iz track.py (drugi prostor boja)
    for p in fr["players"]: p.pop("feat", None)
for k, fr in enumerate(tl):
    if k % a.every: continue
    cap.set(1, round(fr["t"] * fps)); f = cap.read()[1]
    for p in fr["players"]:
        p["feat"] = chroma_feat(f, p["box"]); L = torso_lab(f, p["box"])
        if L is not None: labs[p["id"]].append(L)
feats = defaultdict(list)
for fr in tl:
    for p in fr["players"]:
        if p.get("feat"): feats[p["id"]].append(p["feat"])
tids = [t for t, v in feats.items() if len(v) >= 3 and (on_share is None or on_share.get(t, 0) >= 0.5)]
X = np.array([np.median(feats[t], 0) for t in tids]); wts = np.array([len(feats[t]) for t in tids])
km = KMeans(a.k, n_init=20, random_state=0).fit(X, sample_weight=wts)
lab = km.labels_; C = km.cluster_centers_
mass = np.array([wts[lab == c].sum() for c in range(a.k)])
redness = C[:, 1] - 128
ref = [c for c in range(a.k) if redness[c] > 25]
order = [c for c in np.argsort(-mass) if c not in ref]
role = {int(order[0]): "A", int(order[1]): "B"}
for c in ref: role[int(c)] = "sudac"
roles = [role.get(c, "?") for c in range(a.k)]

def nearest(f): return int(np.argmin(np.linalg.norm(C - np.array(f), axis=1)))
votes = defaultdict(Counter)
for fr in tl:
    for p in fr["players"]:
        if p.get("feat"): votes[p["id"]][nearest(p["feat"])] += 1
track_role = {t: roles[v.most_common(1)[0][0]] for t, v in votes.items()
              if on_share is None or on_share.get(t, 0) >= 0.3}             # publika/klupa izvan terena ostaje "?"
for fr in tl:
    for p in fr["players"]: p["team"] = track_role.get(p["id"], "?")
json.dump(d, open(a.out, "w"))

names = a.names.split(",")
teams = {}
for key, nm in zip(("A", "B"), names):
    kl = np.median(np.concatenate([labs[t] for t, r in track_role.items() if r == key and labs[t]]), 0)
    bgr = cv2.cvtColor(np.uint8([[kl]]), cv2.COLOR_LAB2BGR)[0, 0].astype(int)
    # za crtanje: posvijetli tamne boje da se vide na parketu
    hsv = cv2.cvtColor(np.uint8([[bgr]]), cv2.COLOR_BGR2HSV)[0, 0]; hsv[2] = max(hsv[2], 200); hsv[1] = max(hsv[1], 120) if hsv[1] > 40 else hsv[1]
    draw = cv2.cvtColor(np.uint8([[hsv]]), cv2.COLOR_HSV2BGR)[0, 0].tolist()
    teams[key] = {"name": nm, "bgr": draw, "lab": kl.round(1).tolist()}
cfg = {"teams": teams, "colors": {"centers": C.round(2).tolist(), "roles": roles}, "gk": {}}
json.dump(cfg, open(a.cfg, "w"), indent=1)
for c in range(a.k):
    print(f"skupina {c}: {roles[c]:6s} detekcija {mass[c]:5d}  trackova {(lab == c).sum()}")
for k_, v in teams.items(): print(f"ekipa {k_} ({v['name']}): Lab dresa {v['lab']}")
