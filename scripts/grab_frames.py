"""Izvadi pojedinačne frameove iz YouTube snimke (bez skidanja cijelog videa), npr. za profile TV grafike.

  python scripts/grab_frames.py "https://www.youtube.com/watch?v=XXXX" 2:00 25:00 1:05:30 [--out run/grafika] [--height 1080]

Spremi run/grafika/<id>_<h-mm-ss>.png u izvornoj rezoluciji snimke.
Treba ffmpeg u PATH-u i yt-dlp (pip install -U yt-dlp).
"""
import argparse, os, re, subprocess, sys


def secs(t):
    p = [float(x) for x in t.split(":")]
    return sum(v * 60 ** i for i, v in enumerate(reversed(p)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url"); ap.add_argument("times", nargs="+", help="vremena u snimci: ss, mm:ss ili h:mm:ss")
    ap.add_argument("--out", default=os.path.join("run", "grafika")); ap.add_argument("--height", type=int, default=1080)
    a = ap.parse_args()
    m = re.search(r"(?:v=|youtu\.be/|live/)([\w-]{11})", a.url); vid = m.group(1) if m else "video"
    os.makedirs(a.out, exist_ok=True)
    fmt = f"bv*[height<={a.height}][vcodec^=avc1]/bv*[height<={a.height}]"
    r = subprocess.run([sys.executable, "-m", "yt_dlp", "-g", "-f", fmt, a.url], capture_output=True, text=True)
    if r.returncode or not r.stdout.strip():
        sys.exit("yt-dlp nije dao link na video:\n" + r.stderr[-800:])
    src = r.stdout.strip().splitlines()[0]
    for t in a.times:
        s = secs(t); name = f"{vid}_{int(s // 3600)}-{int(s % 3600 // 60):02d}-{int(s % 60):02d}.png"
        out = os.path.join(a.out, name)
        p = subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-ss", f"{s:.2f}", "-i", src, "-frames:v", "1", out])
        print(("  " if p.returncode == 0 and os.path.exists(out) else "  ! nije uspjelo: ") + out)


if __name__ == "__main__":
    main()
