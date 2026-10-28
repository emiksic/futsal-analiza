"""Model terena iz: MF, MN (središnja ∩ uzdužne) + baze stativa desnog gola (razmak 3 m).
Nepoznate duljina/širina traže se tako da je plavi krug okrugao i da su peterci simetrični.
Radijus kruga i dubina peterca se MJERE, ne pretpostavljaju.
python3 goal_fit.py mosaic_full.png court.json out_prefix
"""
import sys, json, cv2, numpy as np

mos_p, corners_p, outp = sys.argv[1:4]
POST_FAR, POST_NEAR = (2135, 222), (2257, 269)          # baze stativa na panorami (ručno očitano)
m = cv2.imread(mos_p); C = json.load(open(corners_p))
hsv = cv2.cvtColor(m, cv2.COLOR_BGR2HSV)
blue = ((hsv[..., 0] > 95) & (hsv[..., 0] < 125) & (hsv[..., 1] > 80)).astype(np.uint8)
blue = cv2.morphologyEx(blue, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
Hh, Ww = blue.shape
n, lab, st, cen = cv2.connectedComponentsWithStats(blue)
comps = [i for i in range(1, n) if st[i, 4] > 1500]
circ = min(comps, key=lambda i: abs(cen[i][0] - Ww / 2))
dL = max([i for i in comps if cen[i][0] < cen[circ][0] - 200], key=lambda i: st[i, 4])
dR = max([i for i in comps if cen[i][0] > cen[circ][0] + 200], key=lambda i: st[i, 4])
def contour(i):
    c, _ = cv2.findContours((lab == i).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    return max(c, key=len).reshape(-1, 2).astype(np.float32)
circle_px = contour(circ)
# rub peterca: samo pikseli koji nisu na rubu pokrivenosti panorame
valid = cv2.erode((cv2.cvtColor(m, cv2.COLOR_BGR2GRAY) > 0).astype(np.uint8), np.ones((25, 25), np.uint8))
def inner(px): return px[valid[px[:, 1].astype(int), px[:, 0].astype(int)] > 0]
DL_px, DR_px = inner(contour(dL)), inner(contour(dR))
MF, MN = np.float32(C["MF"]), np.float32(C["MN"])
src = np.float32([MF, MN, POST_FAR, POST_NEAR])

def H_for(hl, hw):
    return cv2.getPerspectiveTransform(src, np.float32([[0, -hw], [0, hw], [hl, -1.5], [hl, 1.5]]))
def tf(H, p): return cv2.perspectiveTransform(p.reshape(-1, 1, 2), H).reshape(-1, 2)

def evaluate(hl, hw):
    H = H_for(hl, hw)
    c = tf(H, circle_px); r = np.linalg.norm(c - c.mean(0), axis=1)
    round_err = r.std() / r.mean()
    # unutarnji rub peterca = točka konture najbliža središnjoj liniji, blizu osi (|y|<1.5)
    dl, dr = tf(H, DL_px), tf(H, DR_px)
    def apex(d, side):
        sel = d[np.abs(d[:, 1]) < 1.5]
        if len(sel) == 0: return np.nan
        return sel[:, 0].max() if side < 0 else sel[:, 0].min()
    aL, aR = apex(dl, -1), apex(dr, +1)
    sym_err = (aL + aR) / hl                      # aL je negativan; simetrija -> aL = -aR
    return round_err, sym_err, r.mean(), aL, aR, H

best = None
for hl in np.arange(17, 24, 0.05):
    for hw in np.arange(8, 13, 0.05):
        re, se, *_ = evaluate(hl, hw)
        if np.isnan(se): continue
        cost = re ** 2 + se ** 2
        if best is None or cost < best[0]: best = (cost, hl, hw)
_, hl, hw = best
re, se, R, aL, aR, H = evaluate(hl, hw)
print(f"teren: {2*hl:.1f} x {2*hw:.1f} m")
print(f"izmjereno: radijus plavog kruga {R:.2f} m (okruglost {re*100:.1f}%),"
      f" peterac lijevo {hl + aL:.2f} m, desno {hl - aR:.2f} m od gol linije")

# provjera oblika peterca: udaljenost rubnih piksela desnog peterca od najbliže stative
dr = tf(H, DR_px)
near_goal = dr[(dr[:, 0] < hl - 0.5)]
dpost = np.minimum(np.linalg.norm(near_goal - [hl, -1.5], axis=1), np.linalg.norm(near_goal - [hl, 1.5], axis=1))
flat = np.abs(near_goal[:, 1]) < 1.5
rad = np.where(flat, hl - near_goal[:, 0], dpost)
print(f"rub desnog peterca od gola/stativa: medijan {np.median(rad):.2f} m, raspon 10-90% {np.percentile(rad,10):.2f}-{np.percentile(rad,90):.2f} m")

D = float(np.median(rad))
Hi = np.linalg.inv(H)
model = {"rub": [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw], [-hl, -hw]], "srednja": [[0, -hw], [0, hw]],
         "krug": [[R * np.cos(t), R * np.sin(t)] for t in np.linspace(0, 2 * np.pi, 80)]}
for s in (-1, 1):
    gx = s * hl
    model[f"pet{s}"] = ([[gx - s * D * np.cos(t), -1.5 - D * np.sin(t)] for t in np.linspace(np.pi / 2, 0, 20)] +
                        [[gx - s * D * np.cos(t), 1.5 + D * np.sin(t)] for t in np.linspace(0, np.pi / 2, 20)])
    model[f"gol{s}"] = [[gx, -1.5], [gx + s, -1.5], [gx + s, 1.5], [gx, 1.5]]
pad = 300
vis = cv2.copyMakeBorder(m, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=(30, 30, 30))
for k, pts in model.items():
    ip = (tf(Hi, np.float32(pts)) + pad).astype(np.int32)
    cv2.polylines(vis, [ip], k == "krug", (0, 255, 255) if k.startswith("gol") else (0, 255, 0), 2)
for p in (POST_FAR, POST_NEAR): cv2.circle(vis, (p[0] + pad, p[1] + pad), 7, (0, 0, 255), -1)
cv2.putText(vis, f"teren {2*hl:.1f} x {2*hw:.1f} m, peterac {D:.1f} m, krug r={R:.2f} m", (pad + 20, pad - 30), 0, 1.4, (0, 255, 0), 3)
cv2.imwrite(outp + ".jpg", vis[::2, ::2])
cv2.imwrite(outp + "_goal.jpg", vis[pad + 60:pad + 330, pad + 1950:pad + 2300])
json.dump({"H_img_to_court": H.tolist(), "length_m": float(2 * hl), "width_m": float(2 * hw), "penalty_m": float(D), "circle_r_m": float(R)},
          open(outp + ".json", "w"), indent=1)
