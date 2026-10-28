"""Konfiguracija utakmice: ekipe (ime, boja za crtanje, Lab boja dresa), centri boja za klasifikaciju, strana golova.
Primjer match.json:
{"teams": {"A": {"name": "DIN", "bgr": [180,60,40], "lab": [80,140,90]}, "B": {...}},
 "colors": {"centers": [[...], ...], "roles": ["A", "?", "sudac", "B", "?"]},
 "gk": {"L": "B", "R": "A"}}
"""
import json, cv2, numpy as np

DEFAULT_BGR = {"sudac": (0, 0, 255), "klupa": (180, 105, 255), "?": (160, 160, 160), "osoblje": (120, 120, 120)}

class Match:
    def __init__(self, path):
        self.c = json.load(open(path))
        self.teams = list(self.c["teams"])                                   # interne oznake ekipa
        self.name = {k: v["name"] for k, v in self.c["teams"].items()}       # oznaka -> kratko ime
        self.key_of = {v: k for k, v in self.name.items()}                   # ime -> oznaka
        self.bgr = dict(DEFAULT_BGR); self.bgr.update({k: tuple(v["bgr"]) for k, v in self.c["teams"].items()})
        self.kit_lab = {k: np.array(v["lab"], float) for k, v in self.c["teams"].items()}
        col = self.c.get("colors", {})
        self.centers = np.array(col.get("centers", []), float); self.roles = col.get("roles", [])
        self.gk = self.c.get("gk", {})                                       # strana gola -> oznaka ekipe

    def classify(self, feat):
        if feat is None or not len(self.centers): return "?"
        return self.roles[int(np.argmin(np.linalg.norm(self.centers - np.array(feat), axis=1)))]

    def save(self, path): json.dump(self.c, open(path, "w"), indent=1)

def _torso(frame, box):
    x1, y1, x2, y2 = map(int, box); h, w = y2 - y1, x2 - x1
    return frame[max(0, y1 + int(.18 * h)): y1 + int(.5 * h), max(0, x1 + int(.25 * w)): x2 - int(.25 * w)]

def _not_floor(c):
    hsv = cv2.cvtColor(c, cv2.COLOR_BGR2HSV).reshape(-1, 3)
    return ~((hsv[:, 0] >= 8) & (hsv[:, 0] <= 28) & (hsv[:, 1] > 50) & (hsv[:, 2] > 90))   # parket / koža

def chroma_feat(frame, box):
    """značajka za grupiranje ekipa: ton boje dominira, svjetlina malo"""
    c = _torso(frame, box)
    if c.size == 0: return None
    lab = cv2.cvtColor(c, cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(float)[_not_floor(c)]
    if len(lab) < 10: return None
    L, A, B = np.median(lab, 0)
    return [L * 0.25, A, B]

def torso_lab(frame, box):
    c = _torso(frame, box)
    if c.size == 0: return None
    lab = cv2.cvtColor(c, cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(float)[_not_floor(c)]
    return None if len(lab) < 10 else np.median(lab, 0)
