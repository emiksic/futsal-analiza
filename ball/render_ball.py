"""Brzi pregled modela lopte: video s ucrtanom loptom (bez igrača i kalibracije).

  python ball/render_ball.py run/val_klip.mp4 run/lopta.mp4 --model ~/futsal-ball/runs/ball/weights/best.pt
  python ball/render_ball.py run/val_klip.mp4 run/lopta.mp4 --dets run/ball_novi.json      (gotove detekcije iz ball_detect.py)
       [--start 0 --end 240] [--step 2] [--raw]

Praćenje (jednostavno, samo u slici):
  - lopta se "uhvati" kad je detekcija sigurna (>= --start-conf)
  - dalje se uzima detekcija najbliža predviđenoj poziciji (pozicija + brzina), unutar vrata koja se širi dok lopte nema
  - do --max-miss koraka bez detekcije pozicija se predviđa (žuto), nakon toga se lopta smatra izgubljenom
Boje: zeleno = model je vidi, žuto = predviđeno, sivo (--raw) = sve sirove detekcije >= 0.1.
Izlaz je H.264 preko ffmpeg-a (ako nije u PATH-u: mp4v, otvara VLC).
"""
import argparse, json, math, os, shutil, subprocess, sys
import cv2, numpy as np


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video"); ap.add_argument("out")
    ap.add_argument("--model"); ap.add_argument("--dets", help="JSON iz scripts/ball_detect.py umjesto modela")
    ap.add_argument("--start", type=float, default=0); ap.add_argument("--end", type=float, default=1e9)
    ap.add_argument("--step", type=int, default=2, help="svaki N-ti frame (60 fps snimka -> 2 = 30 fps)")
    ap.add_argument("--imgsz", type=int, default=1280)
    ap.add_argument("--min-conf", type=float, default=0.1, help="detekcije ispod ovoga se ignoriraju")
    ap.add_argument("--start-conf", type=float, default=0.4, help="koliko sigurna mora biti prva detekcija")
    ap.add_argument("--max-miss", type=int, default=8, help="koraka bez detekcije prije nego se lopta izgubi")
    ap.add_argument("--raw", action="store_true", help="nacrtaj i sve sirove detekcije")
    a = ap.parse_args()
    if not (a.model or a.dets): sys.exit("Treba --model ili --dets")

    cap = cv2.VideoCapture(a.video); fps = cap.get(cv2.CAP_PROP_FPS) or 30
    W, H = int(cap.get(3)), int(cap.get(4)); nfr = int(cap.get(7))
    f0 = round(a.start * fps); f1 = min(nfr, round(min(a.end, nfr / fps) * fps))
    cap.set(cv2.CAP_PROP_POS_FRAMES, f0)

    pre = None
    if a.dets:
        pre = {round(d["t"], 2): d["dets"] for d in json.load(open(a.dets))}
    else:
        from ultralytics import YOLO
        model = YOLO(os.path.expanduser(a.model))

    out_fps = fps / a.step
    if shutil.which("ffmpeg"):
        enc = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}",
                                "-r", f"{out_fps:.3f}", "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                                "-pix_fmt", "yuv420p", a.out], stdin=subprocess.PIPE)
        write = lambda img: enc.stdin.write(img.tobytes())
    else:
        vw = cv2.VideoWriter(a.out, cv2.VideoWriter_fourcc(*"mp4v"), out_fps, (W, H)); write = vw.write

    pos = vel = None; miss = 0; trail = []; n = seen = pred_n = 0
    fi = f0
    while fi < f1:
        ok, img = cap.read()
        if not ok: break
        if (fi - f0) % a.step:
            fi += 1; continue
        t = fi / fps
        if pre is not None:
            dets = pre.get(round(t, 2)) or pre.get(round(t, 3)) or []
        else:
            r = model.predict(img, imgsz=a.imgsz, conf=0.05, verbose=False)[0]
            dets = [[*b.xywh[0].tolist(), float(b.conf)] for b in r.boxes]
        dets = [d for d in dets if d[4] >= a.min_conf]

        # --- praćenje ---
        pick = None
        if pos is not None:
            guess = (pos[0] + vel[0] * (miss + 1), pos[1] + vel[1] * (miss + 1))
            gate = 45 + 20 * miss
            best = -1e9
            for d in dets:
                dist = math.hypot(d[0] - guess[0], d[1] - guess[1])
                if dist > gate: continue
                score = d[4] - dist / gate * 0.5
                if score > best: best, pick = score, d
        if pick is None:
            strong = [d for d in dets if d[4] >= a.start_conf]
            if strong and (pos is None or miss >= 3):          # novo hvatanje
                pick = max(strong, key=lambda d: d[4]); vel = (0.0, 0.0); pos = None
        if pick is not None:
            if pos is not None:
                k = miss + 1
                nv = ((pick[0] - pos[0]) / k, (pick[1] - pos[1]) / k)
                vel = (0.6 * nv[0] + 0.4 * vel[0], 0.6 * nv[1] + 0.4 * vel[1])
            pos = (pick[0], pick[1]); miss = 0; state = "det"
        elif pos is not None and miss < a.max_miss:
            miss += 1; state = "pred"
        else:
            pos = None; miss = 0; state = None

        # --- crtanje ---
        if a.raw:
            for d in dets: cv2.circle(img, (int(d[0]), int(d[1])), 10, (160, 160, 160), 1, cv2.LINE_AA)
        if state:
            p = (pos[0] + vel[0] * miss, pos[1] + vel[1] * miss) if state == "pred" else pos
            trail.append(p)
            col = (60, 220, 60) if state == "det" else (0, 210, 255)
            cv2.circle(img, (int(p[0]), int(p[1])), 13, col, 2, cv2.LINE_AA)
            seen += state == "det"; pred_n += state == "pred"
        else:
            trail.append(None)
        trail = trail[-14:]
        for q0, q1 in zip(trail, trail[1:]):
            if q0 and q1: cv2.line(img, (int(q0[0]), int(q0[1])), (int(q1[0]), int(q1[1])), (60, 220, 60), 2, cv2.LINE_AA)
        cv2.putText(img, f"{int(t // 60)}:{t % 60:04.1f}", (W - 130, H - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2, cv2.LINE_AA)
        write(img); n += 1; fi += 1
        if n % 300 == 0: print(f"  {t:6.1f} s")

    if shutil.which("ffmpeg"): enc.stdin.close(); enc.wait()
    else: vw.release()
    print(f"{n} frameova: lopta viđena {seen / max(n, 1):.0%}, predviđena {pred_n / max(n, 1):.0%}, "
          f"ukupno prikazana {(seen + pred_n) / max(n, 1):.0%}  -> {a.out}")


if __name__ == "__main__":
    main()
