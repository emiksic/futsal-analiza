"""Homografija slika -> teren (metri) iz: uzdužnih linija, središnje linije, plavog kruga (r=3 m)
i plavih peteraca (unutarnji rub = 6 m od gol linije). Duljina/širina terena se procjenjuju.
python3 court_fit.py mosaic_full.png court.json out_prefix
"""
import sys, json, cv2, numpy as np

mos_p, corners_p, outp = sys.argv[1:4]
R = float(sys.argv[4]) if len(sys.argv) > 4 else 1.8   # radijus plavog kruga (kosarkaski = 1.8 m)
m = cv2.imread(mos_p); C = json.load(open(corners_p))
hsv = cv2.cvtColor(m, cv2.COLOR_BGR2HSV)
blue = ((hsv[..., 0] > 95) & (hsv[..., 0] < 125) & (hsv[..., 1] > 80)).astype(np.uint8)
blue = cv2.morphologyEx(blue, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
Hh, Ww = blue.shape

def P(k): return np.array(C[k], float)
def hom(p): return np.array([p[0], p[1], 1.0])
def meet(l1, l2): x = np.cross(l1, l2); return x[:2] / x[2]
far = np.cross(hom(P("FL")), hom(P("FR")))
near = np.cross(hom(P("NL")), hom(P("NR")))
MF, MN = P("MF"), P("MN")

# plave komponente: krug (sredina) i dva peterca (najveće lijevo/desno)
n, lab, st, cen = cv2.connectedComponentsWithStats(blue)
comps = [i for i in range(1, n) if st[i, 4] > 1500]
circ = min(comps, key=lambda i: abs(cen[i][0] - Ww / 2) + (0 if st[i, 4] < 60000 else 1e9))
left = [i for i in comps if cen[i][0] < cen[circ][0] - 200]
right = [i for i in comps if cen[i][0] > cen[circ][0] + 200]
dL = max(left, key=lambda i: st[i, 4]); dR = max(right, key=lambda i: st[i, 4])

# središte kruga = središte elipse (projekcija središta nije točno središte elipse, ali ga
# koristimo samo za smjer osi; točne točke dolaze iz homografije)
cnts, _ = cv2.findContours((lab == circ).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
circle_pts = max(cnts, key=len).reshape(-1, 2).astype(float)
# središte kruga: sjecište središnje linije i pravca kroz VP i centroid (dovoljno točno za os)
VP = meet(far, near)
mid = np.cross(hom(MF), hom(MN))
axis0 = np.cross(hom(cen[circ]), hom(VP))
center = meet(mid, axis0)
axis = np.cross(hom(center), hom(VP))

def first_hit(comp, direction):
    """kreni od središta po osi prema VP-u (ili od njega) dok ne udariš u plavi peterac"""
    d = (VP - center); d /= np.linalg.norm(d); d *= direction
    for s in range(0, 4000):
        x, y = (center + s * d).astype(int)
        if not (0 <= x < Ww and 0 <= y < Hh): return None
        if lab[y, x] == comp: return center + s * d
    return None
# VP je desno ili lijevo? smjer prema VP-u ide prema peterac-u na toj strani
toward_R = (VP[0] - center[0]) > 0
AR = first_hit(dR, +1 if toward_R else -1)
AL = first_hit(dL, -1 if toward_R else +1)
print("os terena: VP", VP.round(0), " vrh peterca L", AL.round(0), " D", AR.round(0))

# H(1,1): slika -> normalizirani teren gdje AL=(-1,0), AR=(1,0), MF=(0,-1), MN=(0,1)
src = np.float32([AL, AR, MF, MN]); dst = np.float32([[-1, 0], [1, 0], [0, -1], [0, 1]])
H1 = cv2.getPerspectiveTransform(src, dst)
uv = cv2.perspectiveTransform(circle_pts.reshape(-1, 1, 2).astype(np.float32), H1).reshape(-1, 2)
# pravi teren: x = a*u, y = b*v ; krug r=3: a²u² + b²v² = 9  -> linearno u (a², b²)
A = np.stack([uv[:, 0] ** 2, uv[:, 1] ** 2], 1)
sol, *_ = np.linalg.lstsq(A, np.full(len(uv), R**2), rcond=None)
a, b = np.sqrt(sol)
L, Wd = 2 * (a + 6), 2 * b
resid = np.sqrt(A @ sol) - R
print(f"procjena terena: duljina {L:.1f} m, sirina {Wd:.1f} m  | odstupanje kruga od r=3m: {np.abs(resid).mean()*100:.0f} cm")

Hc = np.diag([a, b, 1.0]) @ H1                      # slika (panorama) -> teren u metrima, (0,0)=centar
Hi = np.linalg.inv(Hc)
def to_img(pts): return cv2.perspectiveTransform(np.float32(pts).reshape(-1, 1, 2), Hi).reshape(-1, 2)

# model terena za crtanje
hl, hw = L / 2, Wd / 2
model = {
    "rub": [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw], [-hl, -hw]],
    "srednja": [[0, -hw], [0, hw]],
    "krug": [[R * np.cos(t), R * np.sin(t)] for t in np.linspace(0, 2 * np.pi, 80)],
}
for s in (-1, 1):   # peterac: četvrtkrugovi r=6 oko stativa (±1.5) + ravni dio
    gx = s * hl
    arc1 = [[gx - s * 6 * np.cos(t), -1.5 - 6 * np.sin(t)] for t in np.linspace(0, np.pi / 2, 20)]
    arc2 = [[gx - s * 6 * np.cos(t), 1.5 + 6 * np.sin(t)] for t in np.linspace(0, np.pi / 2, 20)][::-1]
    model[f"peterac{s}"] = arc1 + arc2[::-1][::-1]
    model[f"gol{s}"] = [[gx, -1.5], [gx + s * 1.0, -1.5], [gx + s * 1.0, 1.5], [gx, 1.5]]

pad = 300
vis = cv2.copyMakeBorder(m, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=(30, 30, 30))
for k, pts in model.items():
    ip = (to_img(pts) + pad).astype(np.int32)
    col = (0, 255, 255) if k.startswith("gol") else (0, 255, 0)
    cv2.polylines(vis, [ip], k in ("krug",), col, 2)
for p, c in ((AL, (255, 0, 255)), (AR, (255, 0, 255)), (MF, (0, 0, 255)), (MN, (0, 0, 255)), (center, (255, 255, 255))):
    cv2.circle(vis, tuple((p + pad).astype(int)), 9, c, -1)
cv2.putText(vis, f"teren {L:.1f} x {Wd:.1f} m", (pad + 20, pad - 30), 0, 1.6, (0, 255, 0), 3)
cv2.imwrite(outp + ".jpg", vis[::2, ::2])
json.dump({"H_img_to_court": Hc.tolist(), "length_m": L, "width_m": Wd}, open(outp + ".json", "w"), indent=1)
