"""Od sirovih detekcija lopte do putanje: filtriranje -> tracklets -> odabir -> interpolacija.
python3 ball_track.py ball_raw.json camera.json tracks.json mosaic_S.npy goal_fit.json out_ball.json
"""
import sys, json, numpy as np, cv2

rawp, camp, trkp, Sp, cfp, outp = sys.argv[1:7]
raw = json.load(open(rawp)); cam = json.load(open(camp)); tl = json.load(open(trkp))["timeline"]
S = np.load(Sp); cf = json.load(open(cfp)); Hc = np.array(cf["H_img_to_court"])
hl, hw = cf["length_m"] / 2, cf["width_m"] / 2

times = [cam[0]["t"] - (cam[1]["t"] - cam[0]["t"])]; Hacc = [np.eye(3)]   # početak kamere
for e in cam: times.append(e["t"]); Hacc.append(np.array(e["H"]) @ Hacc[-1])
times = np.array(times)
def Hframe(t): return Hacc[int(np.argmin(abs(times - t)))]          # ref -> frame
def tf(H, p): return cv2.perspectiveTransform(np.float32(p).reshape(-1, 1, 2), H).reshape(-1, 2)

# 1) filtriranje kandidata
frames = []
for fr in raw:
    t = fr["t"]; Hi = np.linalg.inv(Hframe(t)); M = Hc @ S @ Hi
    c = []
    for x, y, w, h, conf in fr["dets"]:
        if not (5 <= w <= 30 and 5 <= h <= 30 and 0.6 <= w / h <= 1.6): continue
        if x < 430 and y < 105: continue                                # scoreboard
        gx, gy = tf(M, [[x, y + h / 2]])[0]                              # projekcija na pod
        if gy < -hw - 6 or abs(gx) > hl + 6: continue                   # daleko na tribinama
        rx, ry = tf(Hi, [[x, y]])[0]                                     # ref koordinate (bez kamere)
        c.append({"x": x, "y": y, "conf": conf, "ref": (float(rx), float(ry))})
    frames.append({"t": t, "c": c})
dt = np.median(np.diff([f["t"] for f in frames]))
print("frameova", len(frames), " s kandidatom nakon filtra:", sum(bool(f["c"]) for f in frames))

# 2) tracklets: pohlepno povezivanje u ref koordinatama
MAX_GAP = 3; GATE = 45      # px po frameu (≈ do ~25 m/s u širokom kadru)
tracklets = []; active = []
for k, fr in enumerate(frames):
    used = set(); new_active = []
    for tr in active:
        lk, lc = tr["pts"][-1]; gap = k - lk
        if gap > MAX_GAP: tracklets.append(tr); continue
        # predikcija s brzinom
        if len(tr["pts"]) >= 2:
            (k0, c0), (k1, c1) = tr["pts"][-2], tr["pts"][-1]
            v = (np.array(c1["ref"]) - np.array(c0["ref"])) / (k1 - k0)
        else: v = np.zeros(2)
        pred = np.array(lc["ref"]) + v * gap
        best, bd = None, GATE * gap
        for j, c in enumerate(fr["c"]):
            if j in used: continue
            d = np.linalg.norm(np.array(c["ref"]) - pred)
            if d < bd: best, bd = j, d
        if best is not None: used.add(best); tr["pts"].append((k, fr["c"][best]))
        new_active.append(tr)
    for j, c in enumerate(fr["c"]):
        if j not in used: new_active.append({"pts": [(k, c)]})
    active = new_active
tracklets += active
for tr in tracklets:
    tr["start"], tr["end"] = tr["pts"][0][0], tr["pts"][-1][0]
    n = len(tr["pts"])
    tr["score"] = sum(c["conf"] for _, c in tr["pts"]) * (1 if n >= 3 else 0.2)
cand = [tr for tr in tracklets if len(tr["pts"]) >= 2]

# 3) weighted interval scheduling (nepreklapajući tracklets, max ukupni score)
cand.sort(key=lambda tr: tr["end"])
ends = [tr["end"] for tr in cand]
import bisect
best = [0.0] * (len(cand) + 1); choice = [None] * (len(cand) + 1)
for i, tr in enumerate(cand, 1):
    j = bisect.bisect_left(ends, tr["start"])            # zadnji koji završava prije početka
    take = tr["score"] + best[j]
    if take > best[i - 1]: best[i], choice[i] = take, ("take", j)
    else: best[i], choice[i] = best[i - 1], ("skip", i - 1)
sel = []; i = len(cand)
while i > 0:
    kind, j = choice[i]
    if kind == "take": sel.append(cand[i - 1]); i = j
    else: i = j
sel.sort(key=lambda tr: tr["start"])

# 4) putanja po frameu + interpolacija rupa (u ref koordinatama)
traj = [None] * len(frames); src = ["none"] * len(frames)
for tr in sel:
    for k, c in tr["pts"]: traj[k] = np.array(c["ref"]); src[k] = "det"
MAX_INTERP = int(round(0.7 / dt))
k = 0
known = [i for i, p in enumerate(traj) if p is not None]
for a, b in zip(known, known[1:]):
    gap = b - a
    if 1 < gap <= MAX_INTERP and np.linalg.norm(traj[b] - traj[a]) < GATE * gap:
        for i in range(a + 1, b):
            traj[i] = traj[a] + (traj[b] - traj[a]) * (i - a) / gap; src[i] = "interp"

out = []
for k, fr in enumerate(frames):
    if traj[k] is None: out.append({"t": fr["t"], "ball": None}); continue
    img = tf(Hframe(fr["t"]), [traj[k]])[0]
    out.append({"t": fr["t"], "ball": [float(img[0]), float(img[1])], "ref": traj[k].tolist(), "src": src[k]})
json.dump(out, open(outp, "w"))
n = len(out); d = sum(o["ball"] is not None and o["src"] == "det" for o in out)
ip = sum(o["ball"] is not None and o["src"] == "interp" for o in out)
print(f"lopta poznata: {(d+ip)/n*100:.0f}% frameova  (detekcija {d/n*100:.0f}%, interpolirano {ip/n*100:.0f}%),"
      f" odabranih putanja {len(sel)}")
