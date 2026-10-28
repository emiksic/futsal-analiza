"""Profil dvorane iz ručno odabranih točaka (u frameovima ili na panorami).
Točke: (t, x, y, oznaka) gdje je oznaka jedna od: GL_N, GL_F, GR_N, GR_F (stative: lijevi/desni gol, bliža/daljnja),
MF, MN (središnja ∩ daljnja / bliža uzdužna), FL, FR, NL, NR (kutovi), C (centar).
t = vrijeme framea u sekundama, ili None ako je točka očitana izravno na panorami.
python3 calib.py points.json camera.json tracks.json mosaic_S.npy out_profile.json [--L 36 44] [--W 16 25]
"""
import argparse, json, cv2, numpy as np
ap = argparse.ArgumentParser()
for k in ("points", "camera", "tracks", "S", "out"): ap.add_argument(k)
ap.add_argument("--L", type=float, nargs=2, default=[36, 44])
ap.add_argument("--R", type=float, default=3.0, help="radijus središnjeg kruga (futsal 3.0, košarka 1.8)"); ap.add_argument("--W", type=float, nargs=2, default=[16, 25])
a = ap.parse_args()

pts = json.load(open(a.points)); cam = json.load(open(a.camera)); tl = json.load(open(a.tracks))["timeline"]
S = np.load(a.S)
times = [tl[0]["t"]]; Hacc = [np.eye(3)]
for e in cam: times.append(e["t"]); Hacc.append(np.array(e["H"]) @ Hacc[-1])
times = np.array(times)
def to_canvas(t, x, y):
    if t is None: return np.array([x, y], float)
    M = S @ np.linalg.inv(Hacc[int(np.argmin(abs(times - t)))])
    return cv2.perspectiveTransform(np.float32([[[x, y]]]), M)[0, 0]

def court_xy(lbl, hl, hw):
    return {"GL_N": (-hl, 1.5), "GL_F": (-hl, -1.5), "GR_N": (hl, 1.5), "GR_F": (hl, -1.5),
            "MF": (0, -hw), "MN": (0, hw), "FL": (-hl, -hw), "FR": (hl, -hw), "NL": (-hl, hw), "NR": (hl, hw),
            "C": (0, 0)}[lbl]

R_CIRC = a.R
lab_pts = [p for p in pts if p["label"] not in ("CIRC", "MID")]
circ = np.float32([to_canvas(p["t"], p["x"], p["y"]) for p in pts if p["label"] == "CIRC"])
mid = np.float32([to_canvas(p["t"], p["x"], p["y"]) for p in pts if p["label"] == "MID"])
pts = lab_pts
src = np.float32([to_canvas(p["t"], p["x"], p["y"]) for p in pts])
best = None
for L in np.arange(a.L[0], a.L[1] + 1e-6, 0.1):
    for Wd in np.arange(a.W[0], a.W[1] + 1e-6, 0.1):
        dst = np.float32([court_xy(p["label"], L / 2, Wd / 2) for p in pts])
        H, _ = cv2.findHomography(src, dst, 0)
        if H is None: continue
        proj = cv2.perspectiveTransform(src.reshape(-1, 1, 2), H).reshape(-1, 2)
        err = np.sqrt(((proj - dst) ** 2).sum(1)).mean()
        if len(circ):
            c = cv2.perspectiveTransform(circ.reshape(-1, 1, 2), H).reshape(-1, 2)
            err += np.abs(np.linalg.norm(c, axis=1) - R_CIRC).mean()
        if len(mid):
            mm = cv2.perspectiveTransform(mid.reshape(-1, 1, 2), H).reshape(-1, 2)
            err += np.abs(mm[:, 0]).mean()
        if best is None or err < best[0]: best = (err, L, Wd, H)
err, L, Wd, H = best
print(f"teren {L:.1f} x {Wd:.1f} m, ukupna greska {err*100:.0f} cm  ({len(pts)} tocaka, {len(circ)} na krugu, {len(mid)} na srednjoj liniji)")
if len(circ):
    c = cv2.perspectiveTransform(circ.reshape(-1, 1, 2), H).reshape(-1, 2); r = np.linalg.norm(c, axis=1)
    print(f"  krug: radijus {r.mean():.2f} m (+-{r.std():.2f})")
proj = cv2.perspectiveTransform(src.reshape(-1, 1, 2), H).reshape(-1, 2)
for p, q in zip(pts, proj):
    t = court_xy(p["label"], L / 2, Wd / 2); print(f"  {p['label']:5s} -> ({q[0]:6.2f}, {q[1]:6.2f})  ocekivano ({t[0]:6.2f}, {t[1]:6.2f})  greska {np.hypot(q[0]-t[0], q[1]-t[1])*100:.0f} cm")
json.dump({"H_img_to_court": H.tolist(), "length_m": float(L), "width_m": float(Wd), "penalty_m": 6.0,
           "points": pts, "reproj_err_m": float(err)}, open(a.out, "w"), indent=1)
