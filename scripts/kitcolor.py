"""Boja dresa (torzo) za grupiranje ekipa: medijan Lab boje torza BEZ piksela poda.

Kamera je visoko, pa je iza i oko igrača uglavnom pod. Bez uklanjanja poda narančasti parket (Sutinska)
ili žuta boja (Gripe) uđe u boju dresa i ekipe se ne mogu razdvojiti. Boja poda se uzme lokalno, s obje strane
torza i ispod stopala, pa se iz torza izbace pikseli slični podu.
"""
import cv2, numpy as np

FLOOR_DE = 22.0          # Lab udaljenost (OpenCV 8-bit skala) ispod koje je piksel "pod"


def torso_feat(frame, box):
    H, W = frame.shape[:2]
    x1, y1, x2, y2 = map(int, box); h, w = y2 - y1, x2 - x1
    if h < 8 or w < 4: return None
    ty0, ty1 = max(0, y1 + int(.18 * h)), min(H, y1 + int(.5 * h))
    c = frame[ty0:ty1, max(0, x1 + int(.25 * w)):min(W, x2 - int(.25 * w))]
    if c.size == 0: return None
    lab = cv2.cvtColor(c, cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32)
    pw = max(3, int(.35 * w))
    patches = [frame[ty0:ty1, max(0, x1 - pw):max(0, x1)], frame[ty0:ty1, min(W, x2):min(W, x2 + pw)],
               frame[min(H, y2):min(H, y2 + max(3, int(.12 * h))), max(0, x1):min(W, x2)]]
    fl = [cv2.cvtColor(p, cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32) for p in patches if p.size]
    if fl:
        fl = np.concatenate(fl)
        if len(fl) >= 20:
            keep = np.linalg.norm(lab - np.median(fl, 0), axis=1) > FLOOR_DE
            if keep.mean() > 0.2: lab = lab[keep]
    return [round(float(v), 1) for v in np.median(lab, 0)]
