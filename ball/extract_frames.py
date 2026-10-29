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
    sug_path = out / "suggestions.json"
    sug = json.load(open(sug_path)) if sug_path.exists() else {}
    for url in urls:
        vid = yt_id(url)
        if not vid: print("  preskačem (nije YouTube link):", url); continue
        path = out / "videos" / f"{vid}.mp4"
        if not path.exists():
            print(f"preuzimam {vid} …")
            subprocess.run([sys.executable, "-m", "yt_dlp", "-f", f"bv*[height<={a.height}][ext=mp4]/bv*[height<={a.height}]",
                            "--no-audio", "-o", str(path), url], check=True)
        cap = cv2.VideoCapture(str(path)); fps = cap.get(cv2.CAP_PROP_FPS) or 25; n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        dur = n / fps
        rnd = random.Random(vid)
        t0, t1 = dur * a.skip_start, dur * (1 - a.skip_end)
        times = sorted(rnd.uniform(t0, t1) for _ in range(a.per_match))
        done = 0
        for t in times:
            name = f"{vid}_{t:07.1f}.jpg"
            fp = out / "frames" / name
            if fp.exists(): continue
            cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000); ok, fr = cap.read()
            if not ok: continue
            cv2.imwrite(str(fp), fr, [cv2.IMWRITE_JPEG_QUALITY, 92]); done += 1
            if model is not None:
                r = model.predict(fr, imgsz=1280, classes=cls, conf=0.05, verbose=False)[0]
                if len(r.boxes):
                    i = int(r.boxes.conf.argmax()); x1, y1, x2, y2 = r.boxes.xyxy[i].tolist()
                    sug[name] = [round((x1 + x2) / 2, 1), round((y1 + y2) / 2, 1), round(float(r.boxes.conf[i]), 3)]
                else: sug[name] = None
        cap.release()
        if a.delete_video: path.unlink()
        json.dump(sug, open(sug_path, "w"))
        print(f"  {vid}: {done} novih okvira ({dur/60:.0f} min snimke)")
    print(f"gotovo: {len(list((out / 'frames').glob('*.jpg')))} okvira u {out / 'frames'}")
    print("sljedeće: otvori ball/label.html u pregledniku i odaberi mapu", out)

if __name__ == "__main__":
    main()
