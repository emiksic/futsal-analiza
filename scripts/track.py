"""Korak 2: detekcija + tracking + ekipa po boji + preskakanje replaya.
Upotreba: python3 track.py clip.mp4 out_dir [--step 5]
"""
import argparse, json, collections
import cv2, numpy as np
from ultralytics import YOLO

ap = argparse.ArgumentParser()
ap.add_argument("video"); ap.add_argument("out")
ap.add_argument("--step", type=int, default=5, help="obradi svaki N-ti frame")
ap.add_argument("--imgsz", type=int, default=1280)
ap.add_argument("--conf", type=float, default=0.25)
ap.add_argument("--tracker", default="bytetrack.yaml")
ap.add_argument("--start", type=float, default=0)
ap.add_argument("--end", type=float, default=1e9)
a = ap.parse_args()

TEAM_BGR = {"ljubicasti": (200, 60, 140), "bijeli": (255, 255, 255), "golman_z": (0, 230, 255),
            "sudac": (0, 0, 255), "klupa": (180, 105, 255), "?": (128, 128, 128)}

def torso_color(frame, box):
    x1, y1, x2, y2 = map(int, box); h, w = y2 - y1, x2 - x1
    c = frame[y1 + int(.18*h): y1 + int(.5*h), x1 + int(.25*w): x2 - int(.25*w)]
    if c.size == 0: return "?"
    hsv = cv2.cvtColor(c, cv2.COLOR_BGR2HSV); H, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    m = {
        "ljubicasti": (H >= 115) & (H <= 160) & (S > 50) & (V > 30) & (V < 180),
        "klupa":      (H >= 145) & (H <= 175) & (S > 60) & (V >= 180),
        "sudac":      ((H < 8) | (H > 172)) & (S > 120) & (V > 80),
        "golman_z":   (H >= 24) & (H <= 40) & (S > 120) & (V > 150),
        "bijeli":     (S < 50) & (V > 165),
    }
    frac = {k: v.mean() for k, v in m.items()}
    k = max(frac, key=frac.get)
    return k if frac[k] > 0.12 else "?"

def torso_feat(frame, box):
    """srednja Lab boja torza (bez piksela poda) - za automatsko grupiranje ekipa"""
    x1, y1, x2, y2 = map(int, box); h, w = y2 - y1, x2 - x1
    c = frame[y1 + int(.18*h): y1 + int(.5*h), x1 + int(.25*w): x2 - int(.25*w)]
    if c.size == 0: return None
    lab = cv2.cvtColor(c, cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(float)
    return [round(v, 1) for v in np.median(lab, 0)]

def black_ratio(frame):
    g = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)[60:, :]
    return (g < 15).mean()

model = YOLO("yolo11s.pt")
cap = cv2.VideoCapture(a.video); fps = cap.get(cv2.CAP_PROP_FPS)
cap.set(cv2.CAP_PROP_POS_FRAMES, int(a.start*fps))
W, H = int(cap.get(3)), int(cap.get(4))
vw = cv2.VideoWriter(f"{a.out}/annotated.mp4", cv2.VideoWriter_fourcc(*"mp4v"), fps / a.step, (W, H))

votes = collections.defaultdict(collections.Counter)   # track_id -> boje
timeline = []
replay, in_trans, replay_start = False, False, 0.0
i = int(a.start*fps)
while True:
    ok, f = cap.read()
    if not ok: break
    t = i / fps
    if t > a.end: break
    # replay detektor gleda SVAKI frame (prijelaz traje ~0.3 s)
    br = black_ratio(f)
    if br > 0.45 and not in_trans:
        in_trans = True; replay = not replay; replay_start = t
        print(f"{t:6.2f}s  prijelaz -> {'REPLAY' if replay else 'LIVE'}")
    elif br < 0.2:
        in_trans = False
    if replay and t - replay_start > 30:
        replay = False; print(f"{t:6.2f}s  timeout -> LIVE")

    if i % a.step == 0:
        if replay or in_trans:
            out = f.copy()
            cv2.putText(out, "REPLAY - preskoceno", (450, 380), 0, 1.5, (0, 0, 255), 3)
            vw.write(out)
        else:
            r = model.track(f, imgsz=a.imgsz, classes=[0], conf=a.conf, persist=True,
                            tracker=a.tracker, verbose=False)[0]
            rows = []
            if r.boxes.id is not None:
                for box, tid in zip(r.boxes.xyxy.cpu().numpy(), r.boxes.id.int().tolist()):
                    col = torso_color(f, box); votes[tid][col] += 1
                    team = votes[tid].most_common(1)[0][0]
                    rows.append({"id": tid, "team": team, "box": [round(float(v)) for v in box],
                                 "feat": torso_feat(f, box)})
                    x1, y1, x2, y2 = map(int, box)
                    cv2.rectangle(f, (x1, y1), (x2, y2), TEAM_BGR[team], 2)
                    cv2.putText(f, str(tid), (x1, y1 - 4), 0, 0.5, TEAM_BGR[team], 2)
            cnt = collections.Counter(x["team"] for x in rows)
            cv2.putText(f, f"t={t:5.1f}s  " + "  ".join(f"{k}:{v}" for k, v in sorted(cnt.items())),
                        (10, H - 15), 0, 0.7, (0, 255, 255), 2)
            vw.write(f)
            timeline.append({"t": round(t, 2), "players": rows})
    i += 1
    if i % 300 == 0: print(f"{t:6.1f}s obradjeno", flush=True)

vw.release()
json.dump({"timeline": timeline, "votes": {k: dict(v) for k, v in votes.items()}},
          open(f"{a.out}/tracks.json", "w"))
print("gotovo, trackova:", len(votes))
