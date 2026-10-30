"""Od sirovih detekcija lopte do putanje (u metrima na terenu).
python3 ball_track.py ball_raw.json camera.json tracks.json mosaic_S.npy court.json out_ball.json [--vmax 28] [--jump 1.5]

1. filtriranje: veličina/oblik, scoreboard, izvan terena (+ malo prostora oko njega)
2. trackleti: detekcije se povezuju u metrima (pomak kamere je poništen), vrata rastu s rupom i --vmax
3. putanja: niz trackleta koji se ne preklapaju s najvećom ukupnom pouzdanošću; prijelaz koji bi tražio
   brzinu iznad --vmax se kažnjava (--jump), pa nema teleportiranja preko terena
4. izglađivanje unutar trackleta + linearno popunjavanje rupa do --max-gap s (samo ako je fizički moguće)
Izlaz (za render_full.py / export_web.py): [{"t", "ball": [x, y] u slici, "ref": [x, y], "court": [x, y] m, "src": det|interp}]
Projekcija pretpostavlja loptu na podu; lopta u zraku je u metrima pomaknuta, ali putanja ostaje neprekinuta.
"""
import argparse, json, math, numpy as np, cv2

ap = argparse.ArgumentParser()
for k in ("raw", "camera", "tracks", "S", "court", "out"): ap.add_argument(k)
ap.add_argument("--vmax", type=float, default=28.0, help="najveća brzina lopte (m/s)")
ap.add_argument("--jump", type=float, default=1.5, help="kazna za nemoguć prijelaz (jedinice pouzdanosti)")
ap.add_argument("--max-gap", type=float, default=0.8, help="najdulja rupa (s) koja se popunjava")
ap.add_argument("--min-conf", type=float, default=0.1)
a = ap.parse_args()

raw = json.load(open(a.raw)); cam = json.load(open(a.camera))
S = np.load(a.S); cf = json.load(open(a.court)); Hc = np.array(cf["H_img_to_court"])
hl, hw = cf["length_m"] / 2, cf["width_m"] / 2
C2R = np.linalg.inv(Hc @ S)                                          # teren -> ref

times = [cam[0]["t"] - (cam[1]["t"] - cam[0]["t"])]; Hacc = [np.eye(3)]
for e in cam: times.append(e["t"]); Hacc.append(np.array(e["H"]) @ Hacc[-1])
times = np.array(times)
def Hframe(t): return Hacc[int(np.argmin(abs(times - t)))]          # ref -> frame
def tf(H, p): return cv2.perspectiveTransform(np.float32(p).reshape(-1, 1, 2), H).reshape(-1, 2)

# 1) filtriranje
frames = []
for fr in raw:
    t = fr["t"]; Hi = np.linalg.inv(Hframe(t)); M = Hc @ S @ Hi
    c = []
    for x, y, w, h, conf in fr["dets"]:
        if conf < a.min_conf: continue
        if not (4 <= w <= 34 and 4 <= h <= 34 and 0.55 <= w / h <= 1.8): continue
        if x < 480 and y < 100: continue                             # scoreboard (gore lijevo)
        gx, gy = tf(M, [[x, y + h / 2]])[0]                          # točka dodira s podom
        if abs(gx) > hl + 3 or gy < -hw - 2.5 or gy > hw + 4: continue
        c.append({"g": np.array([gx, gy]), "conf": conf, "r": h / 2})
    frames.append({"t": t, "c": c})
n = len(frames); dt = float(np.median(np.diff([f["t"] for f in frames])))
print("frameova", n, " s kandidatom nakon filtra:", sum(bool(f["c"]) for f in frames))
step_m = a.vmax * dt                                                 # najveći pomak po koraku (m)

# 2) trackleti
done, active = [], []
for k, fr in enumerate(frames):
    alive = [tr for tr in active if k - tr["k1"] <= 4]; done += [tr for tr in active if k - tr["k1"] > 4]; active = alive
    used = set()
    for j in sorted(range(len(fr["c"])), key=lambda j: -fr["c"][j]["conf"]):
        d = fr["c"][j]; best, bd = None, 1e9
        for tr in active:
            if id(tr) in used: continue
            g = k - tr["k1"]; pred = tr["pts"][tr["k1"]]["g"] + tr["v"] * g
            dist = np.linalg.norm(d["g"] - pred)
            if dist <= 1.0 + step_m * g and dist < bd: best, bd = tr, dist
        if best is None:
            tr = {"k0": k, "k1": k, "pts": {k: d}, "v": np.zeros(2)}; active.append(tr); used.add(id(tr))
        else:
            g = k - best["k1"]; nv = (d["g"] - best["pts"][best["k1"]]["g"]) / g
            best["v"] = nv if len(best["pts"]) == 1 else 0.6 * nv + 0.4 * best["v"]
            best["pts"][k] = d; best["k1"] = k; used.add(id(best))
done += active
trs = []
for tr in done:
    cs = [p["conf"] for p in tr["pts"].values()]
    if len(cs) < 3 and max(cs) < 0.5: continue                      # kratko i nesigurno = šum
    tr["score"] = sum(cs); trs.append(tr)

# 3) najbolja putanja (DP preko trackleta)
trs.sort(key=lambda tr: tr["k0"])
def plausible(p, b):
    gap = b["k0"] - p["k1"]
    return np.linalg.norm(b["pts"][b["k0"]]["g"] - p["pts"][p["k1"]]["g"]) <= 1.5 + step_m * gap
dp = [0.0] * len(trs); prev = [-1] * len(trs)
for i, b in enumerate(trs):
    dp[i] = b["score"]
    for j in range(i):
        p = trs[j]
        if p["k1"] >= b["k0"]: continue
        v = dp[j] + b["score"] - (0 if plausible(p, b) else a.jump)
        if v > dp[i]: dp[i], prev[i] = v, j
chain = []
if trs:
    i = int(np.argmax(dp))
    while i >= 0: chain.append(trs[i]); i = prev[i]
    chain.reverse()

# 4) izglađivanje + popunjavanje
pos = [None] * n; src = ["none"] * n; rad = [6.0] * n          # rad: polumjer u slici (sredina = dodir - rad)
for tr in chain:
    ks = sorted(tr["pts"]); G = np.array([tr["pts"][k]["g"] for k in ks])
    if len(G) >= 5:                                                  # pomični prosjek 3, krajevi ostaju
        Gs = G.copy(); Gs[1:-1] = (G[:-2] + G[1:-1] + G[2:]) / 3; G = Gs
    for k, g in zip(ks, G): pos[k] = g; src[k] = "det"; rad[k] = tr["pts"][k]["r"]
    for k0, k1 in zip(ks, ks[1:]):                                   # rupe unutar trackleta
        for k in range(k0 + 1, k1):
            u = (k - k0) / (k1 - k0); pos[k] = pos[k0] + (pos[k1] - pos[k0]) * u; src[k] = "interp"; rad[k] = rad[k0]
max_gap = int(round(a.max_gap / dt)); jumps = 0
for p, b in zip(chain, chain[1:]):
    gap = b["k0"] - p["k1"]
    if not plausible(p, b): jumps += 1; continue
    if gap > max_gap: continue
    g0, g1 = pos[p["k1"]], pos[b["k0"]]
    for k in range(p["k1"] + 1, b["k0"]):
        pos[k] = g0 + (g1 - g0) * (k - p["k1"]) / gap; src[k] = "interp"; rad[k] = rad[p["k1"]]

out = []
for k, fr in enumerate(frames):
    if pos[k] is None: out.append({"t": fr["t"], "ball": None}); continue
    ref = tf(C2R, [pos[k]])[0]; img = tf(Hframe(fr["t"]), [ref])[0]; img[1] -= rad[k]
    ref = tf(np.linalg.inv(Hframe(fr["t"])), [img])[0]            # ref sredine lopte (kao prije)
    out.append({"t": fr["t"], "ball": [float(img[0]), float(img[1])], "ref": ref.tolist(),
                "court": [round(float(pos[k][0]), 2), round(float(pos[k][1]), 2)], "src": src[k]})
json.dump(out, open(a.out, "w"))
d = sum(s == "det" for s in src); ip = sum(s == "interp" for s in src)
print(f"lopta poznata: {(d + ip) / n * 100:.0f}% frameova  (detekcija {d / n * 100:.0f}%, popunjeno {ip / n * 100:.0f}%),"
      f" dijelova putanje {len(chain)}, nemogućih skokova {jumps}")
