"""Sirove detekcije lopte (COCO 'sports ball') za svaki N-ti frame, niski prag; filtriranje kasnije.
python3 ball_detect.py clip.mp4 out.json --start 50 --end 80 --step 2
"""
import argparse, json, cv2
from ultralytics import YOLO
ap = argparse.ArgumentParser()
ap.add_argument("video"); ap.add_argument("out")
ap.add_argument("--start", type=float); ap.add_argument("--end", type=float); ap.add_argument("--step", type=int, default=2)
a = ap.parse_args()
m = YOLO("yolo11s.pt"); cap = cv2.VideoCapture(a.video); fps = cap.get(5)
fi = round(a.start * fps); cap.set(1, fi); res = []
while fi / fps <= a.end:
    ok, f = cap.read()
    if not ok: break
    if fi % a.step == 0:
        r = m.predict(f, imgsz=1280, classes=[32], conf=0.05, verbose=False)[0]
        res.append({"t": round(fi / fps, 3), "dets": [[*map(lambda v: round(float(v), 1), b.xywh[0]), round(float(b.conf), 3)]
                                                     for b in r.boxes]})
    fi += 1
json.dump(res, open(a.out, "w"))
print("frameova", len(res), " s barem jednom detekcijom:", sum(bool(x["dets"]) for x in res))
