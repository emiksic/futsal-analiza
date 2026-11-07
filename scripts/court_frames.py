"""Kandidati za klikanje točaka terena (scripts/court_label.html): kadrovi iz igre raspoređeni kroz utakmicu.

  python scripts/court_frames.py run/<id>/video.mp4 run/<id>/teren [--traka run/<id>/traka.json] [--n 16]

S trakom uzima samo trenutke kad sat teče (glavna kamera, bez reprize). Klikni barem 5 kadrova koji zajedno
pokrivaju cijeli teren (lijevi gol, sredina, desni gol); ostale preskoči.
"""
import argparse, json, os
import cv2, numpy as np

ap = argparse.ArgumentParser(); ap.add_argument("video"); ap.add_argument("out")
ap.add_argument("--traka"); ap.add_argument("--n", type=int, default=16)
ap.add_argument("--prefix", default="t", help="početak imena slika (druga snimka u istoj dvorani: npr. --prefix t2)")
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
cap = cv2.VideoCapture(a.video); fps = cap.get(cv2.CAP_PROP_FPS) or 30; dur = cap.get(cv2.CAP_PROP_FRAME_COUNT) / fps
if a.traka:
    play = [p for p in json.load(open(a.traka))["play"] if p[1] - p[0] >= 4]
    cand = [(p[0] + p[1]) / 2 for p in play]
    if len(cand) < a.n:
        print(f"traka ima samo {len(cand)} odsječaka igre (stari čitač?) -> kadrovi ravnomjerno kroz snimku")
        cand = []
else:
    cand = []
if not cand: cand = list(np.linspace(dur * 0.1, dur * 0.9, a.n * 3))
times = [cand[int(i)] for i in np.linspace(0, len(cand) - 1, a.n)]
for t in times:
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000); ok, f = cap.read()
    if not ok: continue
    if f.shape[1] != 1280: f = cv2.resize(f, (1280, 720), interpolation=cv2.INTER_AREA)
    cv2.imwrite(os.path.join(a.out, f"{a.prefix}_{t:08.2f}.jpg"), f, [cv2.IMWRITE_JPEG_QUALITY, 92])
print(f"{len(times)} kadrova u {a.out}. Otvori scripts/court_label.html u Chromeu i odaberi tu mapu.")
