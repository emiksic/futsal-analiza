"""Okviri za treniranje detekcije lopte.

Skine YouTube snimke (yt-dlp), iz svake izvuče N okvira raspoređenih kroz utakmicu i za svaki okvir
zapiše prijedlog gdje je lopta (postojeći COCO model, klasa 'sports ball'). Prijedlozi samo ubrzavaju
označavanje, ne moraju biti točni.

Primjer (u mapi repoa):
  pip install yt-dlp ultralytics opencv-python
  python ball/extract_frames.py --out ~/futsal-ball --per-match 250
  python ball/extract_frames.py --out ~/futsal-ball --urls https://www.youtube.com/watch?v=XXXX  (samo odabrane)
  python ball/extract_frames.py --out ~/futsal-ball --per-match 400 --model ~/futsal-ball/runs/ball/weights/best.pt
      (drugi krug: novi okviri s prijedlozima vlastitog modela; već izvučeni okviri ostaju)
  python ball/extract_frames.py --per-match 200 --model ~/futsal-ball/runs/ball/weights/best.pt --hard 0.7 --delete-video
      (ciljani krug: 70 % okvira gdje je model nesiguran, ne nađe loptu ili je lopta na udaljenoj strani terena,
       30 % nasumičnih; bira između --pool x više kandidata)

Treba i ffmpeg u PATH-u (yt-dlp ga koristi). Jedna snimka u 1080p je oko 1-3 GB.

Rezultat:
  ~/futsal-ball/videos/<id>.mp4          (preuzeti video, može se obrisati nakon izvlačenja)
  ~/futsal-ball/frames/<id>_<sekunda>.jpg
  ~/futsal-ball/suggestions.json         {okvir: [x, y, pouzdanost] ili null}
"""
import argparse, json, os, random, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

def default_urls():
    urls = []
    for f in (ROOT / "site" / "src" / "data").glob("*.json"):
        for m in json.load(open(f, encoding="utf-8"))["matches"]:
            if m.get("youtube") and m.get("status") == "finished": urls.append(m["youtube"])
    return sorted(set(urls))

def yt_id(url):
    m = re.search(r"(?:v=|youtu\.be/|live/)([\w-]{11})", url); return m.group(1) if m else None

def suggest(model, fr, cls):
    r = model.predict(fr, imgsz=1280, classes=cls, conf=0.05, verbose=False)[0]
    if not len(r.boxes): return None
    i = int(r.boxes.conf.argmax()); x1, y1, x2, y2 = r.boxes.xyxy[i].tolist()
    return [round((x1 + x2) / 2, 1), round((y1 + y2) / 2, 1), round(float(r.boxes.conf[i]), 3)]

def hardness(s, h):
    """Koliko je okvir koristan za učenje: model ništa ne nađe ili je nesiguran, a lopta na udaljenoj strani je teža."""
    c = s[2] if s else 0.0
    v = 1.0 if c < 0.1 else 0.8 if c < 0.5 else 0.2
    if s and s[1] < 0.45 * h: v += 0.3        # gornji dio slike = druga strana terena, lopta je mala
    return v

def pick_hard(cap, model, cls, out, vid, t0, t1, a, cv2):
    """Pregleda per_match * pool nasumičnih trenutaka i odabere hard-udio najtežih + ostatak nasumično."""
    rnd = random.Random(vid + "-hard")
    old = [float(f.stem.split("_")[-1]) for f in (out / "frames").glob(f"{vid}_*.jpg")]
    cand = sorted(rnd.uniform(t0, t1) for _ in range(a.per_match * a.pool))
    cand = [round(t, 1) for t in cand if all(abs(t - o) >= a.min_gap for o in old)]
    seen = {}
    print(f"  pregledavam {len(cand)} kandidata …")
    for t in cand:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000); ok, fr = cap.read()
        if not ok: continue
        s = suggest(model, fr, cls); seen[t] = (s, hardness(s, fr.shape[0]) + rnd.random() * 0.05)   # slika se ne čuva (RAM)
    if not seen:
        print("  ! OpenCV ne čita ovaj video, uzimam nasumične okvire"); return sorted(cand[:a.per_match]), {}
    n_hard = round(a.per_match * a.hard); pick = []
    def take(ts, n):
        for t in ts:
            if len(pick) >= n: break
            if all(abs(t - p) >= a.min_gap for p in pick): pick.append(t)
    take(sorted(seen, key=lambda t: -seen[t][1]), n_hard)
    rest = [t for t in seen if t not in pick]; rnd.shuffle(rest)
    take(rest, a.per_match)
    keep = {t: seen[t][0] for t in pick}             # prijedlog modela za odabrane (ne računa se ponovno)
    nh = sum(1 for t in pick if seen[t][1] >= 0.8)
    print(f"  odabrano {len(pick)} okvira ({nh} teških)")
    return sorted(pick), keep

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(Path.home() / "futsal-ball"))
    ap.add_argument("--urls", nargs="*", help="YouTube linkovi (zadano: sve odigrane utakmice s YouTube prijenosom iz site/src/data)")
    ap.add_argument("--per-match", type=int, default=250)
    ap.add_argument("--height", type=int, default=1080, help="visina videa za preuzimanje (1080 je bolje za malu loptu)")
    ap.add_argument("--skip-start", type=float, default=0.06, help="dio snimke na početku koji se preskače (najava, zagrijavanje)")
    ap.add_argument("--skip-end", type=float, default=0.04)
    ap.add_argument("--no-suggest", action="store_true", help="bez prijedloga (brže, ne treba ultralytics)")
    ap.add_argument("--model", help="vlastiti model lopte za prijedloge (nakon prvog treninga su prijedlozi puno bolji)")
    ap.add_argument("--delete-video", action="store_true", help="obriši video nakon izvlačenja okvira (štedi disk)")
    ap.add_argument("--hard", type=float, default=0.0,
                    help="udio 'teških' okvira (0-1): model nesiguran / ništa ne nađe / lopta daleko. Traži --model.")
    ap.add_argument("--pool", type=int, default=4, help="za --hard: koliko puta više kandidata se pregleda")
    ap.add_argument("--min-gap", type=float, default=2.0, help="za --hard: najmanji razmak (s) između odabranih okvira")
    a = ap.parse_args()
    import cv2
    out = Path(os.path.expanduser(a.out)); (out / "videos").mkdir(parents=True, exist_ok=True); (out / "frames").mkdir(exist_ok=True)
    urls = a.urls or default_urls()
    print(f"{len(urls)} snimki")
    model = None
    if not a.no_suggest:
        from ultralytics import YOLO
        model = YOLO(os.path.expanduser(a.model) if a.model else "yolo11s.pt")
    cls = None if a.model else [32]
    if a.hard and not a.model: sys.exit("--hard ima smisla samo s vlastitim modelom (--model …/best.pt)")
    sug_path = out / "suggestions.json"
    sug = json.load(open(sug_path)) if sug_path.exists() else {}
    for url in urls:
        vid = yt_id(url)
        if not vid: print("  preskačem (nije YouTube link):", url); continue
        path = out / "videos" / f"{vid}.mp4"
        have = len(list((out / "frames").glob(f"{vid}_*.jpg")))
        if have >= a.per_match * 0.9 and not path.exists() and not a.hard:
            print(f"  {vid}: već ima {have} okvira, preskačem"); continue
        if not path.exists():
            print(f"preuzimam {vid} …")
            # H.264 (avc1) prvo: OpenCV često ne zna dekodirati AV1/VP9 pa ne bi izvukao nijedan okvir
            subprocess.run([sys.executable, "-m", "yt_dlp", "-f",
                            f"bv*[height<={a.height}][vcodec^=avc1]/bv*[height<={a.height}][ext=mp4]/bv*[height<={a.height}]",
                            "--no-audio", "-N", "6", "--retries", "30", "--fragment-retries", "30", "-o", str(path), url], check=True)
        cap = cv2.VideoCapture(str(path)); fps = cap.get(cv2.CAP_PROP_FPS) or 25; n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        dur = n / fps
        rnd = random.Random(vid)
        t0, t1 = dur * a.skip_start, dur * (1 - a.skip_end)
        times = sorted(rnd.uniform(t0, t1) for _ in range(a.per_match))
        pre = {}                                   # t -> prijedlog za okvire već pregledane u odabiru
        if a.hard:
            times, pre = pick_hard(cap, model, cls, out, vid, t0, t1, a, cv2)
        done = fail = 0; use_ffmpeg = False
        for t in times:
            name = f"{vid}_{t:07.1f}.jpg"
            fp = out / "frames" / name
            if fp.exists(): continue
            fr = None
            if not use_ffmpeg:
                cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000); ok, fr = cap.read()
                if not ok:
                    fr = None
                    if done == 0: use_ffmpeg = True; print("  OpenCV ne čita ovaj video, prebacujem na ffmpeg")
            if use_ffmpeg:
                subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-ss", f"{t:.2f}", "-i", str(path), "-frames:v", "1", "-q:v", "2", str(fp)])
                fr = cv2.imread(str(fp)) if fp.exists() else None
            if fr is None: fail += 1; continue
            if not fp.exists(): cv2.imwrite(str(fp), fr, [cv2.IMWRITE_JPEG_QUALITY, 92])
            done += 1
            if t in pre: sug[name] = pre[t]
            elif model is not None: sug[name] = suggest(model, fr, cls)
        cap.release()
        if done == 0 and fail:
            print(f"  ! {vid}: nijedan okvir nije izvučen, video ostaje u {path} za provjeru")
        elif a.delete_video: path.unlink()
        json.dump(sug, open(sug_path, "w"))
        print(f"  {vid}: {done} novih okvira ({dur/60:.0f} min snimke)")
    print(f"gotovo: {len(list((out / 'frames').glob('*.jpg')))} okvira u {out / 'frames'}")
    print("sljedeće: otvori ball/label.html u pregledniku i odaberi mapu", out)

if __name__ == "__main__":
    main()
