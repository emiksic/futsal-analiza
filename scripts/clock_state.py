"""Teče li sat? Promjena znamenki sekundi na scoreboardu ~svake 1 s = lopta u igri.
python3 clock_state.py clip.mp4 out.json --start 50 --end 80 [--step 2]
"""
import argparse, json, cv2, numpy as np
ap = argparse.ArgumentParser()
ap.add_argument("video"); ap.add_argument("out")
ap.add_argument("--start", type=float, default=0); ap.add_argument("--end", type=float, default=1e9)
ap.add_argument("--step", type=int, default=2)
ap.add_argument("--roi", type=int, nargs=4, default=[70, 55, 102, 86], help="x1 y1 x2 y2 (iz find_clock.py)")
a = ap.parse_args()
SEC = tuple(a.roi)

cap = cv2.VideoCapture(a.video); fps = cap.get(5)
fi = round(a.start * fps); cap.set(1, fi)
ts, masks = [], []
while fi / fps <= a.end:
    ok, f = cap.read()
    if not ok: break
    if fi % a.step == 0:
        x1, y1, x2, y2 = SEC
        g = cv2.cvtColor(f[y1:y2, x1:x2], cv2.COLOR_BGR2GRAY)
        masks.append(g)                                   # binarizacija kasnije, s jednim pragom
        ts.append(fi / fps)
    fi += 1
ts = np.array(ts)
G = np.array(masks)
thr = np.median([cv2.threshold(g, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[0] for g in G[::10]])
masks = list(G > thr)                                     # isti prag za cijelu snimku
# trenuci promjene znamenke
changes = [ts[i] for i in range(1, len(masks)) if (masks[i] != masks[i - 1]).mean() > 0.015]
# spoji promjene bliže od 0.3 s (prijelaz znamenke traje par frameova)
ch = []
for c in changes:
    if not ch or c - ch[-1] > 0.3: ch.append(c)
ch = np.array(ch)
# sat teče u t ako su prethodna i sljedeća promjena obje unutar ~1.25 s, a razmak između njih ~1 s
running = []
for t in ts:
    prev = ch[ch <= t]; nxt = ch[ch > t]
    r = bool(len(prev) and len(nxt) and (nxt[0] - prev[-1]) < 1.35)
    running.append(r)
# prvih/zadnjih ~1 s: proširi stanje susjeda
out = [{"t": round(float(t), 3), "running": r} for t, r in zip(ts, running)]
json.dump(out, open(a.out, "w"))
runs = []; cur = None
for o in out:
    if cur is None or o["running"] != cur[0]: cur = [o["running"], o["t"], o["t"]]; runs.append(cur)
    else: cur[2] = o["t"]
print(f"promjena sekundi: {len(ch)}  | sat tece {np.mean(running)*100:.0f}% vremena")
for r, t0, t1 in runs: print(f"  {t0:6.1f}-{t1:6.1f}s  {'TECE' if r else 'STOJI'}")
