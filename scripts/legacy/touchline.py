"""Uzdužna linija terena = linija najbliža stopalima suca.
python3 touchline.py clip.mp4 tracks.json out_dir [--every 0.5]
"""
import argparse, json, os, cv2, numpy as np

ap = argparse.ArgumentParser()
ap.add_argument("video"); ap.add_argument("tracks"); ap.add_argument("out")
ap.add_argument("--every", type=float, default=0.5)
ap.add_argument("--max-dist", type=float, default=35, help="max px od stopala do linije")
a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)

def line_masks(f):
    g = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY)
    k = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
    dark = cv2.morphologyEx(g, cv2.MORPH_BLACKHAT, k)       # tanke tamne linije
    bright = cv2.morphologyEx(g, cv2.MORPH_TOPHAT, k)       # tanke svijetle linije
    hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV)
    red = (((hsv[..., 0] < 8) | (hsv[..., 0] > 170)) & (hsv[..., 1] > 90)).astype(np.uint8) * 255
    return {"tamna": (dark > 18).astype(np.uint8) * 255,
            "bijela": (bright > 35).astype(np.uint8) * 255,
            "crvena": red}

def segments(mask, people):
    m = mask.copy(); m[:100, :420] = 0
    for (x1, y1, x2, y2) in people: m[y1:y2 + 5, x1:x2] = 0      # igrači nisu linije
    L = cv2.HoughLinesP(m, 1, np.pi / 360, 60, minLineLength=80, maxLineGap=12)
    return [] if L is None else list(L.reshape(-1, 4))

def dist_point_seg(p, s):
    x1, y1, x2, y2 = map(float, s); a_ = np.array([x1, y1]); b = np.array([x2, y2])
    t = np.clip(np.dot(p - a_, b - a_) / max(np.dot(b - a_, b - a_), 1e-6), 0, 1)
    return np.linalg.norm(p - (a_ + t * (b - a_))), t

def is_alongside(p, s):
    """stopalo mora biti uz segment (projekcija unutar segmenta), linija ne smije biti strma"""
    x1, y1, x2, y2 = s
    ang = abs(np.degrees(np.arctan2(y2 - y1, x2 - x1)))
    ang = min(ang, 180 - ang)
    return ang < 35

tl = json.load(open(a.tracks))["timeline"]
cap = cv2.VideoCapture(a.video); fps = cap.get(5)
res = []; last_t = -9
for fr in tl:
    if fr["t"] - last_t < a.every: continue
    refs = [p["box"] for p in fr["players"] if p["team"] == "sudac"]
    if not refs: continue
    last_t = fr["t"]
    cap.set(1, round(fr["t"] * fps)); f = cap.read()[1]
    people = [p["box"] for p in fr["players"]]
    masks = line_masks(f)
    vis = f.copy()
    for (x1, y1, x2, y2) in refs:
        foot = np.array([(x1 + x2) / 2, y2], float)
        best = None
        for color, m in masks.items():
            for s in segments(m, people):
                if not is_alongside(foot, s): continue
                d, t = dist_point_seg(foot, s)
                if 0.02 < t < 0.98 or d < a.max_dist / 2:
                    if d < a.max_dist and (best is None or d < best[0]):
                        best = (d, color, s)
        cv2.circle(vis, tuple(map(int, foot)), 6, (0, 255, 255), -1)
        if best:
            d, color, s = best
            # produži segment preko cijele slike
            x1s, y1s, x2s, y2s = map(float, s); k_ = (y2s - y1s) / (x2s - x1s + 1e-6)
            p1 = (0, int(y1s - k_ * x1s)); p2 = (1279, int(y1s + k_ * (1279 - x1s)))
            cv2.line(vis, p1, p2, (0, 255, 0), 2)
            cv2.line(vis, (int(x1s), int(y1s)), (int(x2s), int(y2s)), (0, 0, 255), 3)
            res.append({"t": fr["t"], "foot": foot.tolist(), "color": color, "dist": round(d, 1),
                        "seg": [int(v) for v in s], "slope": round(k_, 4)})
        else:
            res.append({"t": fr["t"], "foot": foot.tolist(), "color": None})
    cv2.putText(vis, f"t={fr['t']:.1f}", (10, 700), 0, 0.8, (0, 255, 255), 2)
    cv2.imwrite(f"{a.out}/tl_{fr['t']:06.2f}.jpg", vis)
json.dump(res, open(f"{a.out}/touchline.json", "w"), indent=0)
from collections import Counter
print("uzoraka:", len(res), " boje:", Counter(r["color"] for r in res))
