"""Samo procjena pomaka kamere (homografija frame->frame) za segment.
python3 camera.py clip.mp4 tracks.json out_camera.json out_tracks.json --start 38.6 --end 154 [--step 2]
out_tracks.json = timeline ograničen na segment (prvi zapis = referentni frame)
"""
import argparse, json, cv2, numpy as np

ap = argparse.ArgumentParser()
ap.add_argument("video"); ap.add_argument("tracks"); ap.add_argument("out_cam"); ap.add_argument("out_tracks")
ap.add_argument("--start", type=float); ap.add_argument("--end", type=float); ap.add_argument("--step", type=int, default=2)
a = ap.parse_args()

tl_all = json.load(open(a.tracks))["timeline"]
tl = [f for f in tl_all if a.start <= f["t"] <= a.end]
json.dump({"timeline": tl}, open(a.out_tracks, "w"))
t0 = tl[0]["t"]
ts = np.array([f["t"] for f in tl])

cap = cv2.VideoCapture(a.video); fps = cap.get(5); W, H = 1280, 720
def mask_at(t):
    m = np.full((H, W), 255, np.uint8); m[:100, :420] = 0
    fr = tl[int(np.argmin(abs(ts - t)))]
    for p in fr["players"]:
        x1, y1, x2, y2 = p["box"]; m[max(0, y1 - 25):y2 + 25, max(0, x1 - 25):x2 + 25] = 0
    return m

fi = round(t0 * fps); cap.set(1, fi); prev = cv2.cvtColor(cap.read()[1], cv2.COLOR_BGR2GRAY)
out = []; fi += a.step
while fi / fps <= a.end:
    cap.set(1, fi); ok, f = cap.read()
    if not ok: break
    g = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY); t = fi / fps
    p0 = cv2.goodFeaturesToTrack(prev, 800, 0.01, 10, mask=mask_at(t))
    Hm, n = np.eye(3), 0
    if p0 is not None and len(p0) > 20:
        p1, st, _ = cv2.calcOpticalFlowPyrLK(prev, g, p0, None, winSize=(21, 21), maxLevel=3)
        okk = st.ravel() == 1
        if okk.sum() > 20:
            Hc, inl = cv2.findHomography(p0[okk], p1[okk], cv2.RANSAC, 2.5)
            if Hc is not None: Hm, n = Hc, int(inl.sum())
    out.append({"t": round(t, 3), "H": Hm.tolist(), "inliers": n})
    prev = g; fi += a.step
json.dump(out, open(a.out_cam, "w"))
print("frameova:", len(out), " min inliera:", min(o["inliers"] for o in out), " prosjek:", int(np.mean([o["inliers"] for o in out])))
