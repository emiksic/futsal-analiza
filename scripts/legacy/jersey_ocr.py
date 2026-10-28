"""Čitanje brojeva na dresu + glasanje po tracku.
python3 jersey_ocr.py clip.mp4 tracks.json out.json [--every 2] [--min-h 55] [--debug dir]
"""
import argparse, json, os, re, cv2, numpy as np, easyocr
from collections import defaultdict

ap = argparse.ArgumentParser()
ap.add_argument("video"); ap.add_argument("tracks"); ap.add_argument("out")
ap.add_argument("--every", type=int, default=2, help="svaki N-ti zapis timelinea")
ap.add_argument("--min-h", type=int, default=55)
ap.add_argument("--min-conf", type=float, default=0.4)
ap.add_argument("--debug")
ap.add_argument("--limit", type=int, default=0)
a = ap.parse_args()
if a.debug: os.makedirs(a.debug, exist_ok=True)

reader = easyocr.Reader(["en"], gpu=False, verbose=False)
TEAMS = {"ljubicasti", "bijeli", "golman_z"}

def prep(crop, team):
    h = crop.shape[0]; s = 160 / max(h, 1)
    big = cv2.resize(crop, None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC)
    if team == "bijeli":
        g = big[..., 2]                       # crveni kanal: svijetloplavi broj taman na bijelom
    else:
        g = cv2.cvtColor(big, cv2.COLOR_BGR2GRAY)
    g = cv2.createCLAHE(3.0, (4, 4)).apply(g)
    return g

def read_number(img):
    out = []
    for inv in (False, True):              # bijeli broj na ljubičastom / tamni broj na bijelom
        im = 255 - img if inv else img
        for box, txt, conf in reader.readtext(im, allowlist="0123456789", detail=1, paragraph=False,
                                               text_threshold=0.5, low_text=0.3, mag_ratio=1.0):
            txt = txt.strip()
            if re.fullmatch(r"[1-9][0-9]?", txt):
                bw = max(p[0] for p in box) - min(p[0] for p in box)
                out.append((txt, float(conf), bw))
    return out

d = json.load(open(a.tracks)); tl = d["timeline"]
cap = cv2.VideoCapture(a.video); fps = cap.get(5)
votes = defaultdict(lambda: defaultdict(float)); reads = []
n_crops = 0
for k, fr in enumerate(tl):
    if k % a.every: continue
    cap.set(1, round(fr["t"] * fps)); f = cap.read()[1]
    for p in fr["players"]:
        if p["team"] not in TEAMS: continue
        x1, y1, x2, y2 = p["box"]; h = y2 - y1
        if h < a.min_h or x1 < 2 or x2 > 1278 or y2 > 718: continue
        crop = f[y1 + int(.12 * h): y1 + int(.62 * h), max(0, x1 - 3): x2 + 3]
        img = prep(crop, p["team"]); n_crops += 1
        res = read_number(img)
        if res:
            txt, conf, _ = max(res, key=lambda r: r[1])
            if conf >= a.min_conf:
                votes[p["id"]][txt] += conf
                reads.append({"t": fr["t"], "id": p["id"], "team": p["team"], "num": txt, "conf": round(conf, 2), "h": h})
                if a.debug and len(reads) <= 60:
                    cv2.imwrite(f"{a.debug}/{len(reads):03d}_{p['team'][:3]}_{txt}_{conf:.2f}.png", img)
        if a.limit and n_crops >= a.limit: break
    if a.limit and n_crops >= a.limit: break

result = {}
for tid, v in votes.items():
    tot = sum(v.values()); num, sc = max(v.items(), key=lambda z: z[1])
    result[tid] = {"num": num, "score": round(sc, 2), "share": round(sc / tot, 2), "n": sum(1 for r in reads if r["id"] == tid)}
json.dump({"tracks": result, "reads": reads}, open(a.out, "w"), indent=0)
print(f"izrezaka {n_crops}, ocitanja {len(reads)} ({len(reads)/max(n_crops,1)*100:.0f}%), trackova s brojem {len(result)}")
