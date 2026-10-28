"""Automatski pronađi znamenke sekundi na scoreboardu: područje koje se mijenja ~1x u sekundi, periodično.
python3 find_clock.py clip.mp4 [--start 0 --dur 60]  ->  ispis ROI (x1 y1 x2 y2) + slika provjere
"""
import argparse, cv2, numpy as np
ap = argparse.ArgumentParser(); ap.add_argument("video")
ap.add_argument("--start", type=float, default=0); ap.add_argument("--dur", type=float, default=60)
ap.add_argument("--out", default="clock_found.png")
a = ap.parse_args()
cap = cv2.VideoCapture(a.video); fps = cap.get(5); W, H = int(cap.get(3)), int(cap.get(4))
RH, RW = H // 3, W                     # sat je skoro uvijek u gornjoj trećini
step = 3; fi = round(a.start * fps); cap.set(1, fi)
prev = None; events = []; ts = []; frames = []
while fi / fps < a.start + a.dur:
    ok, f = cap.read()
    if not ok: break
    if fi % step == 0:
        g = cv2.cvtColor(f[:RH], cv2.COLOR_BGR2GRAY).astype(np.int16)
        if prev is not None: events.append(np.abs(g - prev) > 60); ts.append(fi / fps)
        frames.append(g.astype(np.uint8))
        prev = g
    fi += 1
E = np.array(events)                      # [T, h, w]
ts = np.array(ts); n_sec = ts[-1] - ts[0]
cnt = E.sum(0)
# grafika preko slike: većinu vremena mirna (medijan apsolutne promjene ~0), iako kamera panira
F = np.array(frames, np.int16)
# strogo statično kroz CIJELI interval (pozadina se uz paniranje uvijek promijeni)
static = ((F.max(0) - F.min(0)) < 50).astype(np.uint8)
static = cv2.morphologyEx(static, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
near_static = cv2.dilate(static, np.ones((9, 9), np.uint8)) > 0
# 1) pikseli koji se mijenjaju otprilike jednom u sekundi (ne stalno - to su igrači/kamera)
cand = (cnt > 0.25 * n_sec) & (cnt < 1.6 * n_sec) & near_static
# 2) i čiji su trenuci promjene sinkronizirani s ostalim kandidatima (isti sat)
sig = E[:, cand].mean(1)                  # udio kandidata koji se mijenja u svakom koraku
peaks = sig > np.percentile(sig, 90)
sync = (E[peaks][:, cand].mean(0) > 0.3)
mask = np.zeros(cand.shape, bool); idx = np.argwhere(cand)[sync]; mask[idx[:, 0], idx[:, 1]] = True
mask = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
n, lab, st, cen = cv2.connectedComponentsWithStats(mask)
comps = [i for i in range(1, n) if st[i, 4] > 20]
if not comps: raise SystemExit("sat nije pronađen (možda u tom intervalu stoji) - probaj drugi --start")
# najgušća komponenta s periodičnošću ~1 s
def period(i):
    s = E[:, lab == i].mean(1); t = ts[s > 0.15]
    if len(t) < 3: return 9
    d = np.diff(t); d = d[d > 0.4]
    return abs(np.median(d) - 1.0) if len(d) else 9
def ring_static(i):
    m = (lab == i).astype(np.uint8)
    ring = (cv2.dilate(m, np.ones((15, 15), np.uint8)) > 0) & (m == 0)
    return static[ring].mean() if ring.any() else 0
comps = [i for i in comps if ring_static(i) > 0.5] or comps
best = min(comps, key=lambda i: (round(period(i), 1), -ring_static(i), -st[i, 4]))
x, y, w, h = st[best, :4]
# proširi na cijelu visinu: kutija grafike (statično + zatvoreno) koja sadrži pronađenu znamenku
box = cv2.morphologyEx(static, cv2.MORPH_CLOSE, np.ones((21, 21), np.uint8))
nb, lb, sb, _ = cv2.connectedComponentsWithStats(box)
cx, cy = x + w // 2, y + h // 2
k = lb[cy, cx]
if k > 0:
    bx, by, bw, bh = sb[k, :4]
    y1, y2 = by, by + bh
else:
    y1, y2 = max(0, y - 2 * h), y + 3 * h
roi = (max(0, x - 3), int(y1), min(RW, x + w + 3), int(min(y2, y1 + 6 * max(h, 8))))
cap.set(1, round((a.start + 1) * fps)); f = cap.read()[1]
vis = f[:RH].copy(); cv2.rectangle(vis, roi[:2], roi[2:], (0, 0, 255), 2)
cv2.imwrite(a.out, vis)
print("ROI sekundi:", *roi, f" (period {period(best)+1:.2f}s)")
