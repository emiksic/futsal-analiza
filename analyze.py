"""Analiza cijele utakmice jednom naredbom. Svaki korak se preskače ako je već gotov, pa nakon prekida
(restart, nestanak struje, Ctrl+C) samo pokreneš istu naredbu ponovno i nastavi gdje je stalo.

  python analyze.py 7g1c-gR2Sck
  python analyze.py https://www.youtube.com/watch?v=7g1c-gR2Sck
  python analyze.py 1-hmnl-2026-27-k2-square-rijeka           (ID utakmice sa stranice, link se uzme iz podataka)
        [--model ~/futsal-ball/runs/tracknet/last.pt] [--height 720] [--render] [--only video,lopta,igraci]

Rezultat ide u run/<youtube id>/:
  video.mp4     snimka (720p, H.264, bez zvuka)
  lopta.json    TrackNet detekcije lopte, 30 u sekundi snimke (isti format kao tracknet.py detect)
  tracks.json   igrači: okviri, ID-jevi i boja dresa, 15 u sekundi snimke
  lopta.mp4     (samo uz --render) snimka s ucrtanom loptom za pregled
  log.txt       sve što su koraci ispisali

Dok radi, Windows ne ide na spavanje (ali Windows Update i dalje može restartati: pauziraj ažuriranja).
"""
import argparse, glob, json, os, re, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def keep_awake(on=True):
    """Windows: zabrani spavanje dok proces radi (SetThreadExecutionState). Na drugim sustavima ništa."""
    if os.name != "nt": return
    import ctypes
    ES_CONTINUOUS, ES_SYSTEM_REQUIRED = 0x80000000, 0x00000001
    ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS | (ES_SYSTEM_REQUIRED if on else 0))


def youtube_id(arg):
    m = re.search(r"(?:v=|youtu\.be/|/live/|/shorts/)([\w-]{11})", arg)
    if m: return m.group(1)
    if re.fullmatch(r"[\w-]{11}", arg): return arg
    for f in glob.glob(str(ROOT / "site" / "src" / "data" / "*.json")):     # ID utakmice sa stranice
        for mt in json.load(open(f, encoding="utf-8"))["matches"]:
            if mt["id"] == arg:
                if not mt.get("youtube"): sys.exit(f"Utakmica {arg} nema YouTube link u podacima.")
                return youtube_id(mt["youtube"])
    sys.exit(f"Ne prepoznajem '{arg}': zadaj YouTube link, YouTube ID ili ID utakmice sa stranice.")


class Log:
    def __init__(self, path): self.f = open(path, "a", encoding="utf-8")
    def __call__(self, msg):
        line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
        print(line, flush=True); self.f.write(line + "\n"); self.f.flush()


def run(cmd, log):
    """Pokreni korak, ispis ide i na ekran i u log. Vraća True ako je uspio."""
    log("$ " + " ".join(str(c) for c in cmd))
    env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUNBUFFERED="1")
    p = subprocess.Popen([str(c) for c in cmd], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, cwd=ROOT, env=env,
                         text=True, encoding="utf-8", errors="replace")
    for line in p.stdout:
        print(line, end="", flush=True); log.f.write(line); log.f.flush()
    return p.wait() == 0


def video_fps(path):
    import cv2
    cap = cv2.VideoCapture(str(path)); fps = cap.get(cv2.CAP_PROP_FPS) or 30; n = cap.get(cv2.CAP_PROP_FRAME_COUNT)
    return fps, n / fps


def main():
    for st in (sys.stdout, sys.stderr):
        try: st.reconfigure(encoding="utf-8", errors="replace")
        except Exception: pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("match", help="YouTube link, YouTube ID ili ID utakmice sa stranice")
    ap.add_argument("--model", default=str(Path.home() / "futsal-ball" / "runs" / "tracknet" / "last.pt"))
    ap.add_argument("--height", type=int, default=720, help="visina snimke za skidanje (720 je dovoljno za oba modela)")
    ap.add_argument("--batch", type=int, default=4, help="paket za loptu (2 ako javi out of memory)")
    ap.add_argument("--render", action="store_true", help="na kraju napravi i snimku s loptom (dugo za cijelu utakmicu)")
    ap.add_argument("--only", help="samo ovi koraci, npr. lopta,igraci")
    ap.add_argument("--out", help="izlazna mapa (zadano run/<youtube id>)")
    a = ap.parse_args()

    vid = youtube_id(a.match)
    out = Path(a.out) if a.out else ROOT / "run" / vid
    out.mkdir(parents=True, exist_ok=True)
    log = Log(out / "log.txt"); py = sys.executable
    steps = a.only.split(",") if a.only else ["video", "lopta", "igraci"] + (["render"] if a.render else [])
    keep_awake(True); T0 = time.time()
    log(f"=== {vid} -> {out}   koraci: {', '.join(steps)}")
    video = out / "video.mp4"

    try:
        if "video" in steps:
            if video.exists(): log("video: već postoji")
            else:
                ok = False
                for attempt in range(3):           # prekid usred skidanja: idući pokušaj nastavlja .part datoteku
                    h = a.height
                    ok = run([py, "-m", "yt_dlp", "-f", f"bv*[height<={h}][vcodec^=avc1]/bv*[height<={h}][ext=mp4]/bv*[height<={h}]",
                              "--no-audio", "-N", "4", "--retries", "30", "--fragment-retries", "30", "-o", video,
                              f"https://www.youtube.com/watch?v={vid}"], log) and video.exists()
                    if ok: break
                    log(f"video: skidanje nije uspjelo (pokušaj {attempt + 1}/3)")
                if not ok: sys.exit("Video se nije skinuo. Probaj: pip install -U yt-dlp, pa ista naredba ponovno.")
            fps, dur = video_fps(video); log(f"video: {fps:.0f} fps, {dur / 60:.0f} min")

        if "lopta" in steps:
            lj = out / "lopta.json"; done = out / "lopta.done"
            if done.exists(): log("lopta: već gotova")
            else:
                if not Path(os.path.expanduser(a.model)).exists(): sys.exit(f"Nema modela lopte: {a.model} (zadaj --model)")
                t = time.time()
                if not run([py, "ball/tracknet.py", "detect", video, lj, "--model", a.model, "--hz", "30",
                            "--batch", a.batch, "--resume"], log): sys.exit("lopta: greška (vidi gore). Ista naredba nastavlja.")
                done.write_text(time.strftime("%Y-%m-%d %H:%M:%S")); log(f"lopta: gotova za {(time.time() - t) / 60:.0f} min")

        if "igraci" in steps:
            tj = out / "tracks.json"
            fin = tj.exists() and json.load(open(tj)).get("done", False)
            if fin: log("igrači: već gotovi")
            else:
                fps, _ = video_fps(video); step = max(1, round(fps / 15)); t = time.time()
                if not run([py, "scripts/track.py", video, out, "--step", step, "--conf", "0.1",
                            "--tracker", "scripts/botsort_v2.yaml", "--no-video"], log):
                    sys.exit("igrači: greška (vidi gore). Ista naredba kreće ispočetka za igrače.")
                log(f"igrači: gotovi za {(time.time() - t) / 60:.0f} min")

        if "render" in steps:
            rv = out / "lopta.mp4"
            if rv.exists(): log("render: već postoji")
            elif not run([py, "ball/render_ball.py", video, rv, "--dets", out / "lopta.json", "--min-conf", "0.45",
                          "--short-conf", "0.62", "--people", "yolo11s.pt"], log): sys.exit("render: greška (vidi gore)")
    finally:
        keep_awake(False)
    log(f"=== gotovo za {(time.time() - T0) / 60:.0f} min -> {out}")


if __name__ == "__main__":
    main()
