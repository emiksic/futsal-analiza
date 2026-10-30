"""Kalibracija terena: točke + središnja linija + automatski pronađeni bijeli lukovi 6 m (ICP).
Teren se pretpostavlja L x W (default 40 x 20); dužina/širina se mogu i fitati (--fit-lw).
python3 calib2.py clip.mp4 points.json camera.json tracks.json S.npy out_profile.json --arcs 110.0 55.0 [--fit-lw]
python3 calib2.py clip.mp4 points.json camera.json tracks.json mosaic_S.npy court.json --arcs-mosaic
    (točke iz admina, Dvorane -> Kalibriraj: kliknute na panorami, "canvas": true; lukovi se traže na panorami)
"""
import argparse, json, cv2, numpy as np
from scipy.optimize import least_squares
ap = argparse.ArgumentParser()
for k in ("video", "points", "camera", "tracks", "S", "out"): ap.add_argument(k)
ap.add_argument("--arcs", type=float, nargs="*", default=[], help="vremena frameova s vidljivim lukom 6 m")
ap.add_argument("--L", type=float, default=40.0); ap.add_argument("--W", type=float, default=20.0)
ap.add_argument("--D", type=float, default=6.0, help="radijus luka peterca")
ap.add_argument("--fit-lw", action="store_true")
ap.add_argument("--arcs-mosaic", action="store_true", help="bijele piksele lukova traži na panorami (<S bez _S.npy>.png)")
ap.add_argument("--render", type=float, nargs="*", default=[], help="vremena frameova za provjeru")
a = ap.parse_args()

pts = json.load(open(a.points)); cam = json.load(open(a.camera)); tl = json.load(open(a.tracks))["timeline"]
S = np.load(a.S)
times = [cam[0]["t"] - (cam[1]["t"] - cam[0]["t"])]; Hacc = [np.eye(3)]   # početak kamere
for e in cam: times.append(e["t"]); Hacc.append(np.array(e["H"]) @ Hacc[-1])
times = np.array(times); tlt = np.array([f["t"] for f in tl])
def F2C(t): return S @ np.linalg.inv(Hacc[int(np.argmin(abs(times - t)))])        # frame -> platno
def tf(H, p): return cv2.perspectiveTransform(np.float32(p).reshape(-1, 1, 2), H).reshape(-1, 2)
cap = cv2.VideoCapture(a.video); fps = cap.get(5)
def frame(t): cap.set(1, round(t * fps)); return cap.read()[1]

def model_xy(lbl, hl, hw):
    return {"GL_N": (-hl, 1.5), "GL_F": (-hl, -1.5), "GR_N": (hl, 1.5), "GR_F": (hl, -1.5), "MF": (0, -hw),
            "MN": (0, hw), "FL": (-hl, -hw), "FR": (hl, -hw), "NL": (-hl, hw), "NR": (hl, hw), "C": (0, 0)}[lbl]
if isinstance(pts, dict):                                     # format iz admina: {"L", "W", "points": [...]}
    a.L, a.W = float(pts.get("L", a.L)), float(pts.get("W", a.W)); pts = pts["points"]
def to_canvas(p): return [p["x"], p["y"]] if p.get("canvas") else tf(F2C(p["t"]), [[p["x"], p["y"]]])[0]
lab = [p for p in pts if p["label"] not in ("CIRC", "MID")]
P_lab = np.float32([to_canvas(p) for p in lab])
P_mid = np.float32([to_canvas(p) for p in pts if p["label"] == "MID"]).reshape(-1, 2)

def arc_dist(xy, hl):
    """udaljenost od najbližeg luka 6 m (lijevi ili desni gol)"""
    out = np.full(len(xy), np.inf)
    for s in (-1, 1):
        gx = s * hl; dx = (gx - xy[:, 0]) * s; dy = np.maximum(0, np.abs(xy[:, 1]) - 1.5)
        d = np.abs(np.hypot(np.maximum(dx, 0), dy) - a.D)
        d[dx < -0.5] = np.inf                                   # iza gol linije ne vrijedi
        out = np.minimum(out, d)
    return out

def H_from(p):            # 8 parametara -> homografija platno -> teren (m)
    return np.r_[p[:8], 1.0].reshape(3, 3)

def residuals(p, P_arc):
    H = H_from(p); hl, hw = (p[8] / 2, p[9] / 2) if a.fit_lw else (a.L / 2, a.W / 2)
    r = [(tf(H, P_lab) - np.float32([model_xy(q["label"], hl, hw) for q in lab])).ravel() * 3]   # točke teže
    if len(P_mid): r.append(tf(H, P_mid)[:, 0])
    if len(P_arc): r.append(arc_dist(tf(H, P_arc), hl))
    return np.concatenate(r)

# početni H iz označenih točaka
H0, _ = cv2.findHomography(P_lab, np.float32([model_xy(q["label"], a.L / 2, a.W / 2) for q in lab]), 0)
H0 /= H0[2, 2]
p = np.r_[H0.ravel()[:8], a.L, a.W] if a.fit_lw else H0.ravel()[:8]
p = least_squares(lambda q: residuals(q, np.zeros((0, 2), np.float32)), p, loss="soft_l1", f_scale=0.3).x

# bijeli pikseli u frameovima s lukovima (bez igrača i ograde/grafike u donjem dijelu)
white_px = []
for t in a.arcs:
    f = frame(t); g = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY); hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV)
    th = cv2.morphologyEx(g, cv2.MORPH_TOPHAT, cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9)))
    m = (th > 25) & (hsv[..., 1] < 70) & (g > 140)
    for q in tl[int(np.argmin(abs(tlt - t)))]["players"]:
        x1, y1, x2, y2 = q["box"]; m[max(0, y1 - 5):y2 + 5, max(0, x1 - 5):x2 + 5] = False
    m[:150, :330] = False                                              # scoreboard
    ys, xs = np.nonzero(m); sel = np.random.default_rng(0).choice(len(xs), min(4000, len(xs)), replace=False)
    white_px.append(tf(F2C(t), np.c_[xs[sel], ys[sel]].astype(np.float32)))
if a.arcs_mosaic:                                                    # panorama: igrača i grafike već nema
    f = cv2.imread(a.S.rsplit("_S.npy", 1)[0] + ".png"); g = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY); hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV)
    th = cv2.morphologyEx(g, cv2.MORPH_TOPHAT, cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7)))
    ys, xs = np.nonzero((th > 25) & (hsv[..., 1] < 70) & (g > 140))
    sel = np.random.default_rng(0).choice(len(xs), min(8000, len(xs)), replace=False)
    white_px.append(np.c_[xs[sel], ys[sel]].astype(np.float32))
white_px = np.concatenate(white_px) if white_px else np.zeros((0, 2), np.float32)

for gate in (1.5, 1.0, 0.6, 0.4, 0.3):
    hl = (p[8] / 2) if a.fit_lw else a.L / 2
    d = arc_dist(tf(H_from(p), white_px), hl)
    P_arc = white_px[d < gate]
    p = least_squares(lambda q: residuals(q, P_arc), p, loss="soft_l1", f_scale=0.15).x
    print(f"  prozor {gate:.1f} m: piksela luka {len(P_arc):4d}")

H = H_from(p); hl, hw = (p[8] / 2, p[9] / 2) if a.fit_lw else (a.L / 2, a.W / 2)
e_lab = np.linalg.norm(tf(H, P_lab) - np.float32([model_xy(q["label"], hl, hw) for q in lab]), axis=1)
e_arc = arc_dist(tf(H, P_arc), hl)
print(f"teren {2*hl:.1f} x {2*hw:.1f} m | točke: medijan {np.median(e_lab)*100:.0f} cm, max {e_lab.max()*100:.0f} cm"
      f" | luk: medijan {np.median(e_arc)*100:.0f} cm (n={len(P_arc)})"
      + (f" | srednja linija: medijan {np.median(np.abs(tf(H, P_mid)[:, 0]))*100:.0f} cm" if len(P_mid) else ""))
json.dump({"H_img_to_court": H.tolist(), "length_m": float(2 * hl), "width_m": float(2 * hw), "penalty_m": a.D},
          open(a.out, "w"), indent=1)

# provjera: nacrtaj model na frameovima
model = [[[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw], [-hl, -hw]], [[0, -hw], [0, hw]]]
for s in (-1, 1):
    gx = s * hl
    model.append([[gx - s * a.D * np.cos(u), -1.5 - a.D * np.sin(u)] for u in np.linspace(np.pi / 2, 0, 20)] +
                 [[gx - s * a.D * np.cos(u), 1.5 + a.D * np.sin(u)] for u in np.linspace(0, np.pi / 2, 20)])
    model.append([[gx, -1.5], [gx + s, -1.5], [gx + s, 1.5], [gx, 1.5]])
tiles = []
for t in a.render:
    f = frame(t); Mi = np.linalg.inv(H @ F2C(t))
    for seg in model:
        dense = np.concatenate([np.linspace(seg[i], seg[i + 1], 30) for i in range(len(seg) - 1)])
        cv2.polylines(f, [tf(Mi, dense).astype(np.int32)], False, (0, 255, 0), 2)
    cv2.putText(f, f"t={t}", (10, 700), 0, 1, (0, 255, 255), 2); tiles.append(cv2.resize(f, (640, 360)))
if tiles:
    while len(tiles) % 2: tiles.append(np.zeros_like(tiles[0]))
    cv2.imwrite(a.out.rsplit(".", 1)[0] + "_check.jpg", np.vstack([np.hstack(tiles[i:i + 2]) for i in range(0, len(tiles), 2)]))
