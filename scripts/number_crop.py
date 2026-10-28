"""Lokalizacija broja na dresu: pikseli koji se jasno razlikuju od boje dresa (bilo koje boje), unutar dresa.
from number_crop import number_crop;  crop, mask = number_crop(frame, box, kit_lab)
"""
import cv2, numpy as np

def number_crop(frame, box, kit_lab, num_lab=None):
    x1, y1, x2, y2 = box; h, w = y2 - y1, x2 - x1
    ty1, ty2 = y1 + int(.12 * h), y1 + int(.58 * h)
    tx1, tx2 = max(0, x1 + int(.05 * w)), min(frame.shape[1], x2 - int(.05 * w))
    torso = frame[max(0, ty1):ty2, tx1:tx2]
    if torso.size == 0: return None, None
    lab = cv2.cvtColor(torso, cv2.COLOR_BGR2LAB).astype(float)
    hsv = cv2.cvtColor(torso, cv2.COLOR_BGR2HSV)
    dL = lab[..., 0] - kit_lab[0]; dC = np.hypot(lab[..., 1] - kit_lab[1], lab[..., 2] - kit_lab[2])
    floor_skin = (hsv[..., 0] >= 5) & (hsv[..., 0] <= 28) & (hsv[..., 1] > 45) & (hsv[..., 2] > 80)
    kit_chroma = np.hypot(kit_lab[1] - 128, kit_lab[2] - 128)
    neutral = kit_chroma < 15                       # bijeli / crni / sivi dres: broj se razlikuje uglavnom tonom
    tL, tC = (25, 12) if neutral else (45, 28)
    kit = (np.abs(dL) < 45) & (dC < (10 if neutral else 18))
    digit = ((np.abs(dL) > tL) | (dC > tC)) & ~floor_skin
    if num_lab is not None:                         # naučena boja broja: puno preciznije
        nl = np.asarray(num_lab, float)
        dn = np.hypot(0.5 * (lab[..., 0] - nl[0]), np.hypot(lab[..., 1] - nl[1], lab[..., 2] - nl[2]))
        digit = (dn < 18) & ~floor_skin
    kit_d = cv2.dilate(kit.astype(np.uint8), np.ones((5, 5), np.uint8))
    m = (digit & (kit_d > 0)).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    n, labc, st, _ = cv2.connectedComponentsWithStats(m)
    th, tw = m.shape
    comps = [i for i in range(1, n) if st[i, 4] >= max(6, 0.004 * th * tw) and st[i, 3] >= 0.18 * th
             and st[i, 2] <= 0.6 * tw]
    if not comps: return None, m
    main = max(comps, key=lambda i: st[i, 4]); my, mh = st[main, 1], st[main, 3]
    sel = [i for i in comps if abs((st[i, 1] + st[i, 3] / 2) - (my + mh / 2)) < 0.5 * mh and st[i, 3] > 0.5 * mh]
    xs = [st[i, 0] for i in sel] + [st[i, 0] + st[i, 2] for i in sel]
    ys = [st[i, 1] for i in sel] + [st[i, 1] + st[i, 3] for i in sel]
    bx1, bx2, by1, by2 = min(xs), max(xs), min(ys), max(ys)
    if (by2 - by1) < 6: return None, m
    pad = max(2, int(0.25 * (by2 - by1)))
    cx1, cy1 = max(0, bx1 - pad), max(0, by1 - pad); cx2, cy2 = min(tw, bx2 + pad), min(th, by2 + pad)
    return torso[cy1:cy2, cx1:cx2].copy(), m
