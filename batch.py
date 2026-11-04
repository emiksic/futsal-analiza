"""Sve odigrane utakmice s YouTube prijenosom, jedna po jedna (od zadnjeg kola prema početku sezone), s uploadom na stranicu.

  python batch.py                              (sve lige; prekid = samo pokreni ponovno, gotove se preskaču)
  python batch.py --comps 1-hmnl-2026-27 kup-2026-27 --skip 7g1c-gR2Sck --max 4

Za svaku utakmicu:
  1. analyze.py: snimka (720p), TV traka, lopta, igrači  -> run/<youtube id>/
  2. na stranicu (treba .env sa SUPABASE_SECRET_KEY): točne sekunde golova i tempo igre (s TV trake)
  3. ako je dvorana kalibrirana (run/dvorane/<dvorana>/court_model.json + klikani kadrovi):
     teren za svaki kadar, video analiza s mini-mapom (upload) i automatske skice golova
Gotova utakmica dobije run/<id>/batch.done; korak koji ne uspije se zapiše i ide se na sljedeću utakmicu.
Kad se dvorana naknadno kalibrira, isto pokretanje za već analizirane utakmice napravi samo mini-mapu i skice (analiza se ne ponavlja).
Sve se zapisuje i u run/batch_log.txt.

  python batch.py --retraka    samo ponovno pročitaj TV traku (PARSeq) za već skinute utakmice kojima je traka
                               pročitana starim čitačem, pa upiši sekunde golova i tempo (stara ostaje kao traka_stara.json)

Dres domaćih (tamni/svijetli, za boje ekipa na mini-mapi) je u data/dresovi.json po klubu domaćinu;
bez toga se mini-mapa preskoči, a sve ostalo se napravi.
"""
import argparse, glob, json, os, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RUN = ROOT / "run"


def log(msg):
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(line, flush=True)
    with open(RUN / "batch_log.txt", "a", encoding="utf-8") as f: f.write(line + "\n")


def run(args, what):
    env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUNBUFFERED="1")
    r = subprocess.run([sys.executable] + [str(a) for a in args], cwd=ROOT, env=env)
    if r.returncode != 0: log(f"   ! {what}: greška (izlaz {r.returncode})")
    return r.returncode == 0


def yt_id(url):
    import re
    m = re.search(r"(?:v=|youtu\.be/|/live/|/shorts/)([\w-]{11})", url or ""); return m.group(1) if m else None


def main():
    for st in (sys.stdout, sys.stderr):
        try: st.reconfigure(encoding="utf-8", errors="replace")
        except Exception: pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--comps", nargs="*", help="samo ova natjecanja (npr. 1-hmnl-2026-27 kup-2026-27); zadano sva")
    ap.add_argument("--skip", nargs="*", default=[], help="YouTube ID-jevi ili ID-jevi utakmica koje se preskaču")
    ap.add_argument("--max", type=int, default=0, help="najviše toliko utakmica u ovom pokretanju (0 = sve)")
    ap.add_argument("--no-upload", action="store_true", help="samo analiza, ništa na stranicu")
    ap.add_argument("--list", action="store_true", help="samo ispiši redoslijed, ništa ne pokreći")
    ap.add_argument("--retraka", action="store_true", help="samo ponovno čitanje TV trake za već skinute utakmice")
    a = ap.parse_args()
    RUN.mkdir(exist_ok=True)
    if not a.list: subprocess.run(["git", "pull", "--ff-only", "-q"], cwd=ROOT)    # najnoviji raspored i rezultati

    clubs = {}
    seed = (ROOT / "site/src/lib/seed.js").read_text(encoding="utf-8")
    import re
    for m in re.finditer(r'\{ id: "([\w-]+)", name: "[^"]*", full: "[^"]*", short: "(\w+)", city: "[^"]*", hall: "([\w-]+)"', seed):
        clubs[m.group(1)] = {"short": m.group(2), "hall": m.group(3)}
    kits = json.load(open(ROOT / "data/dresovi.json", encoding="utf-8")) if (ROOT / "data/dresovi.json").exists() else {}

    ms = []
    for f in glob.glob(str(ROOT / "site/src/data/*.json")):
        for m in json.load(open(f, encoding="utf-8"))["matches"]:
            v = yt_id(m.get("youtube"))
            if m.get("status") != "finished" or not v: continue
            if a.comps and m["comp"] not in a.comps: continue
            if v in a.skip or m["id"] in a.skip: continue
            ms.append((m["date"], m, v))
    ms.sort(key=lambda x: x[0], reverse=True)                                  # od zadnjeg kola prema početku
    def hall_of(m): return m.get("hall") or clubs.get(m["home"], {}).get("hall")
    def pending(m, v):     # nije analizirana, ili je dvorana u međuvremenu kalibrirana a mini-mapa još nije napravljena
        if not (RUN / v / "batch.done").exists(): return True
        return (RUN / "dvorane" / str(hall_of(m)) / "court_model.json").exists() and kits.get(m["home"]) and not (RUN / v / "minimapa.done").exists()
    if a.retraka:
        def old(v):
            tj = RUN / v / "traka.json"
            if not (RUN / v / "video.mp4").exists(): return False
            return not tj.exists() or json.load(open(tj, encoding="utf-8")).get("reader") != "parseq"
        todo = [(m, v) for _, m, v in ms if old(v)]
        log(f"=== retraka: {len(todo)} utakmica")
        for n, (m, v) in enumerate(todo, 1):
            if a.list: print(f"  {m['date'][:10]}  {m['id']:45s} {v}"); continue
            tj = RUN / v / "traka.json"; t0 = time.time()
            log(f"--- [{n}/{len(todo)}] {m['id']}  traka")
            if tj.exists(): tj.replace(RUN / v / "traka_stara.json")
            if not run(["scripts/scoreboard.py", RUN / v / "video.mp4", tj], "traka"): continue
            if not a.no_upload:
                run(["scripts/goals_to_site.py", tj, "--match", m["id"], "--write"], "sekunde golova")
                run(["scripts/stats_to_site.py", tj, "--match", m["id"], "--write"], "tempo igre")
            (RUN / v / "court.done").unlink(missing_ok=True); (RUN / v / "minimapa.done").unlink(missing_ok=True)  # teren ovisi o traci
            log(f"   gotovo za {(time.time() - t0) / 60:.0f} min")
        return
    todo = [(m, v) for _, m, v in ms if pending(m, v)]
    log(f"=== batch: {len(ms)} utakmica s prijenosom, gotovih {len(ms) - len(todo)}, ostaje {len(todo)}")
    if a.max: todo = todo[:a.max]
    if a.list:
        for m, v in todo: print(f"  {m['date'][:10]}  {m['id']:45s} {v}")
        return

    for n, (m, v) in enumerate(todo, 1):
        out = RUN / v; t0 = time.time()
        log(f"--- [{n}/{len(todo)}] {m['id']} ({m['date'][:10]})  ->  run/{v}")
        if not run(["analyze.py", v], "analiza"):
            log("   analiza nije dovršena, idem na sljedeću (ponovno pokretanje nastavlja)"); continue
        traka = out / "traka.json"
        if not a.no_upload and traka.exists():
            run(["scripts/goals_to_site.py", traka, "--match", m["id"], "--write"], "sekunde golova")
            run(["scripts/stats_to_site.py", traka, "--match", m["id"], "--write"], "tempo igre")
        hall = hall_of(m)
        teren = RUN / "dvorane" / str(hall)
        kit = kits.get(m["home"])
        if (teren / "court_model.json").exists() and traka.exists():
            court = out / "court.json"
            if not (out / "court.done").exists():
                if run(["scripts/court_calib.py", "track", out / "video.mp4", teren, court, "--traka", traka, "--resume"], "kalibracija"):
                    (out / "court.done").write_text(time.strftime("%Y-%m-%d %H:%M:%S"))
            if court.exists() and kit and not a.no_upload:
                H, A = clubs.get(m["home"], {}).get("short", "DOM"), clubs.get(m["away"], {}).get("short", "GOS")
                base = ["--tracks", out / "tracks.json", "--ball", out / "lopta.json", "--court", court, "--traka", traka]
                if run(["scripts/export_match.py", *base, "--home", H, "--away", A, "--home-kit", kit, "--out", out / "web.json"], "izvoz"):
                    run(["scripts/upload_analysis.py", out / "web.json", "--match", m["id"], "--yt-offset", "0", "--team-map", f"{H}=home", f"{A}=away"], "upload analize")
                    (out / "minimapa.done").write_text(time.strftime("%Y-%m-%d %H:%M:%S"))
                run(["scripts/goal_sketches.py", *base, "--home-kit", kit, "--match", m["id"], "--write"], "skice golova")
            elif not kit: log(f"   mini-mapa preskočena: nema dresa za {m['home']} u data/dresovi.json")
        else:
            log(f"   mini-mapa preskočena: dvorana {hall} nije kalibrirana (run/dvorane/{hall}/)")
        (out / "batch.done").write_text(time.strftime("%Y-%m-%d %H:%M:%S"))
        log(f"   gotovo za {(time.time() - t0) / 60:.0f} min")
    log("=== batch gotov")


if __name__ == "__main__":
    main()
