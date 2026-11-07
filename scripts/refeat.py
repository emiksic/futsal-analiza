"""Ponovno izračunaj boju dresa (feat) u tracks.json, bez piksela poda (scripts/kitcolor.py). Brže od novog praćenja:
samo se čita video i računa boja za već postojeće okvire igrača.

  python scripts/refeat.py run/<id>/video.mp4 run/<id>/tracks.json
"""
import json, os, sys, time
import cv2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kitcolor import torso_feat


def main():
    video, tj = sys.argv[1], sys.argv[2]
    d = json.load(open(tj)); tl = d["timeline"]
    cap = cv2.VideoCapture(video); fps = cap.get(cv2.CAP_PROP_FPS) or 30
    want = sorted(range(len(tl)), key=lambda k: tl[k]["t"]); i, pos, t0 = 0, 0, time.time()
    frame = None
    for n, k in enumerate(want):
        target = int(round(tl[k]["t"] * fps))
        while pos <= target:
            ok = cap.grab() if pos < target else None
            if pos == target:
                ok, frame = cap.read()
            pos += 1
            if ok is False: break
        if frame is None: continue
        for p in tl[k]["players"]: p["feat"] = torso_feat(frame, p["box"])
        if n % 5000 == 0: print(f"  {tl[k]['t'] / 60:5.1f} min  ({time.time() - t0:.0f} s)", flush=True)
    d = {"featv": 2, **{k: v for k, v in d.items() if k != "featv"}}
    tmp = tj + ".tmp"; json.dump(d, open(tmp, "w")); os.replace(tmp, tj)
    print(f"boja dresa ponovno izračunata za {len(tl)} kadrova ({(time.time() - t0) / 60:.1f} min)")


if __name__ == "__main__":
    main()
