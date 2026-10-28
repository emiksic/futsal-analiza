"""Panorama poda: medijan svih frameova preslikanih u referentni okvir (igrači nestanu).
python3 mosaic.py clip.mp4 camera.json tracks.json out.png [--every 0.5] [--scale 0.5]
"""
import argparse, json, cv2, numpy as np

ap = argparse.ArgumentParser()
ap.add_argument("video"); ap.add_argument("camera"); ap.add_argument("tracks"); ap.add_argument("out")
ap.add_argument("--every", type=float, default=0.5); ap.add_argument("--scale", type=float, default=0.5)
a = ap.parse_args()

tl = json.load(open(a.tracks))["timeline"]; cam = json.load(open(a.camera))
times = [tl[0]["t"]]; Hs = [np.eye(3)]
for e in cam: times.append(e["t"]); Hs.append(np.array(e["H"]) @ Hs[-1])
times = np.array(times)
W, H = 1280, 720

sel = []; last = -9
for t, Hm in zip(times, Hs):
    if t - last >= a.every: sel.append((t, np.linalg.inv(Hm))); last = t   # frame t -> ref

# granice platna
corners = np.float32([[0, 100], [W, 100], [W, H], [0, H]]).reshape(-1, 1, 2)   # bez tribina gore
allc = np.concatenate([cv2.perspectiveTransform(corners, Hi) for _, Hi in sel]).reshape(-1, 2)
x0, y0 = allc.min(0) - 20; x1, y1 = allc.max(0) + 20
S = np.array([[a.scale, 0, -x0 * a.scale], [0, a.scale, -y0 * a.scale], [0, 0, 1]])
CW, CH = int((x1 - x0) * a.scale), int((y1 - y0) * a.scale)
print("platno", CW, "x", CH, " frameova", len(sel))

cap = cv2.VideoCapture(a.video); fps = cap.get(5)
# grafika preko slike (scoreboard, logo): pikseli koji se kroz cijelu snimku skoro ne mijenjaju
samp = []
for t, _ in sel[::max(1, len(sel) // 30)]:
    cap.set(1, round(t * fps)); samp.append(cv2.cvtColor(cap.read()[1], cv2.COLOR_BGR2GRAY))
samp = np.array(samp, np.int16)
overlay = ((samp.max(0) - samp.min(0)) < 50).astype(np.uint8)
overlay = cv2.dilate(cv2.morphologyEx(overlay, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8)), np.ones((9, 9), np.uint8))
print("maskirano grafike:", round(overlay.mean() * 100, 1), "% slike")
stack = np.zeros((len(sel), CH, CW, 3), np.uint8)       # uint8 umjesto float32 (4x manje memorije)
valid = np.zeros((len(sel), CH, CW), bool)
for i, (t, Hi) in enumerate(sel):
    cap.set(1, round(t * fps)); f = cap.read()[1]
    mask = np.zeros((H, W), np.uint8); mask[100:, :] = 255; mask[overlay > 0] = 0
    fr = min(tl, key=lambda r: abs(r["t"] - t))
    for p in fr["players"]:                       # igrače maknemo odmah, medijan dovrši ostalo
        x1_, y1_, x2_, y2_ = p["box"]; mask[max(0, y1_ - 5):y2_ + 8, max(0, x1_ - 5):x2_ + 5] = 0
    M = S @ Hi
    stack[i] = cv2.warpPerspective(f, M, (CW, CH))
    valid[i] = cv2.warpPerspective(mask, M, (CW, CH), flags=cv2.INTER_NEAREST) > 0
mos = np.zeros((CH, CW, 3), np.uint8)
for r0 in range(0, CH, 48):                                 # medijan po trakama
    blk = stack[:, r0:r0 + 48].astype(np.float32); vb = valid[:, r0:r0 + 48]
    blk[~vb] = np.nan
    with np.errstate(all="ignore"):
        import warnings; warnings.simplefilter("ignore")
        mos[r0:r0 + 48] = np.nan_to_num(np.nanmedian(blk, axis=0)).astype(np.uint8)
cover = valid.sum(0)
cv2.imwrite(a.out, mos)
np.save(a.out.rsplit(".", 1)[0] + "_S.npy", S)          # ref -> platno
print("pokriveno piksela:", round((cover > 0).mean() * 100), "%")
