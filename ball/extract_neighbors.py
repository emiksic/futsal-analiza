"""Susjedni frameovi uz svaki označeni okvir (za TrackNet: model gleda 3 uzastopna framea).

  python ball/extract_neighbors.py [--data ~/futsal-ball] [--gap 0.033] [--delete-video]

Za svaki označeni okvir frames/<id>_<sekunda>.jpg (oznake iz labels.json, bez "skip") spremi
  frames3/<id>_<sekunda>_p.jpg   (oko --gap s prije)
  frames3/<id>_<sekunda>_n.jpg   (oko --gap s poslije)
Srednji frame se ponovno pronađe u videu i usporedi s postojećim jpg-om (mora biti isti), pa su oznake i dalje točne.
Snimke se ponovno skidaju (yt-dlp) ako ih nema u videos/; --delete-video ih briše nakon obrade.
Može se prekinuti i ponovno pokrenuti: već obrađeni okviri se preskaču.
"""
import argparse, json, os, subprocess, sys
from collections import defaultdict
from pathlib import Path
import cv2, numpy as np


def small(img): return cv2.resize(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (160, 90)).astype(np.float32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(Path.home() / "futsal-ball"))
    ap.add_argument("--gap", type=float, default=1 / 30, help="razmak do susjednog framea (s)")
    ap.add_argument("--height", type=int, default=1080)
    ap.add_argument("--delete-video", action="store_true")
    ap.add_argument("--videos", help="mapa sa snimkama (zadano <data>/videos), npr. na disku s više mjesta")
    ap.add_argument("--max-mae", type=float, default=6.0, help="koliko smije odstupati pronađeni srednji frame od spremljenog jpg-a")
    a = ap.parse_args()
    data = Path(os.path.expanduser(a.data)); out = data / "frames3"; out.mkdir(exist_ok=True)
    lab = json.load(open(data / "labels.json", encoding="utf-8"))["frames"]
    meta_p = out / "meta.json"; meta = json.load(open(meta_p)) if meta_p.exists() else {}
    by_vid = defaultdict(list)
    for n, v in lab.items():
        if v == "skip" or not (data / "frames" / n).exists(): continue
        if n in meta and (out / (Path(n).stem + "_p.jpg")).exists(): continue
        by_vid[n.rsplit("_", 1)[0]].append(n)
    print(f"{sum(map(len, by_vid.values()))} okvira u {len(by_vid)} snimki za obradu")
    for vid, names in sorted(by_vid.items()):
        vdir = Path(os.path.expanduser(a.videos)) if a.videos else data / "videos"; vdir.mkdir(parents=True, exist_ok=True)
        path = vdir / f"{vid}.mp4"
        if not path.exists():
            print(f"preuzimam {vid} …")
            fmt = f"bv*[height<={a.height}][vcodec^=avc1]/bv*[height<={a.height}][ext=mp4]/bv*[height<={a.height}]"
            r = subprocess.run([sys.executable, "-m", "yt_dlp", "-f", fmt, "--no-audio", "-N", "4", "--retries", "30",
                                "--fragment-retries", "30", "-o", str(path), f"https://www.youtube.com/watch?v={vid}"])
            if r.returncode or not path.exists(): print(f"  ! {vid} nije skinut, preskačem"); continue
        cap = cv2.VideoCapture(str(path)); fps = cap.get(cv2.CAP_PROP_FPS) or 30
        step = max(1, round(a.gap * fps)); ok_n = bad = 0
        for n in sorted(names):
            ref = cv2.imread(str(data / "frames" / n)); t = float(Path(n).stem.rsplit("_", 1)[1])
            # isti način kao extract_frames.py (POS_MSEC), pa provjera i traženje ±3 framea oko toga
            cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000); idx0 = int(cap.get(cv2.CAP_PROP_POS_FRAMES))
            E = 3                                            # rezerva za duplicirane frameove u streamu
            lo = max(0, idx0 - 3 - step - E); cap.set(cv2.CAP_PROP_POS_FRAMES, lo)
            buf = []
            for _ in range(idx0 + 3 + step + E - lo + 1):
                okr, f = cap.read()
                if not okr: break
                buf.append(f)
            if len(buf) < 2 * step + 1: bad += 1; continue
            rs = small(cv2.resize(ref, (buf[0].shape[1], buf[0].shape[0])) if ref.shape != buf[0].shape else ref)
            cand = [(float(np.mean(np.abs(small(buf[i]) - rs))), i) for i in range(step + E, len(buf) - step - E)]
            mae, i = min(cand)
            if mae > a.max_mae: bad += 1; meta[n] = {"mae": round(mae, 2), "ok": False}; continue
            sz = (ref.shape[1], ref.shape[0]); sc = small(buf[i])
            def pick(j0, d):                                 # prvi frame od j0 dalje koji nije duplikat srednjeg
                for j in range(j0, j0 + d * (E + 1), d):
                    if float(np.mean(np.abs(small(buf[j]) - sc))) > 0.6: return j
                return j0
            for suf, j in (("_p", pick(i - step, -1)), ("_n", pick(i + step, 1))):
                f = buf[j] if buf[j].shape[:2] == ref.shape[:2] else cv2.resize(buf[j], sz)
                cv2.imwrite(str(out / (Path(n).stem + suf + ".jpg")), f, [cv2.IMWRITE_JPEG_QUALITY, 92])
            meta[n] = {"mae": round(mae, 2), "ok": True, "fps": fps, "step": step}; ok_n += 1
        cap.release()
        json.dump(meta, open(meta_p, "w"))
        print(f"  {vid}: {ok_n} okvira s susjedima, {bad} nije pronađeno (fps {fps:.0f}, korak {step})")
        if a.delete_video and ok_n: path.unlink()
    good = sum(1 for m in meta.values() if m.get("ok"))
    print(f"gotovo: {good} okvira ima susjede u {out}")


if __name__ == "__main__":
    main()
