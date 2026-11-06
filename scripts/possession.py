"""Posjed iz izvoza utakmice (web.json iz export_match.py): tko ima loptu u svakom kadru i zbroj po ekipi.

  python scripts/possession.py run/<id>/web.json            dodaj posjed u web.json i ispiši
  python scripts/possession.py --all [--upload]             sve utakmice u run/ (iz site/src/data), uz --upload i na stranicu

Pravilo (samo dok teče sat):
- lopta je kod igrača koji joj je najbliži, ako je bliže od 1,5 m (stopala igrača -> lopta, u metrima na terenu)
- promjena ekipe tek kad je nova ekipa najbliža 2 kadra zaredom (0,4 s pri 5/s), da kratki prolaz kraj protivnika nije promjena
- kad lopta nije viđena ili nitko nije blizu, posjed ostaje zadnjoj ekipi najviše 2,5 s
- sat stoji (aut, prekršaj, gol): nitko nema posjed
Rezultat: f["pc"] = sekunde posjeda [ekipa 0, ekipa 1] do tog kadra, f["h"] = indeks igrača s loptom u f["p"] (ili -1).
"""
import argparse, glob, json, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NEAR, CONFIRM, HOLD = 1.5, 2, 2.5


def add_possession(D):
    dt = 1 / D.get("fps", 5); cur, cand, n_cand, last_seen = -1, -1, 0, -1e9
    pc = [0.0, 0.0]
    for f in D["frames"]:
        f["h"] = -1
        if not f.get("live"):
            cur, cand, n_cand = -1, -1, 0
        else:
            near = None
            if f.get("b"):
                bx, by = f["b"][2], f["b"][3]; best = NEAR
                for i, p in enumerate(f["p"]):
                    if p[0] not in (0, 1): continue
                    d = ((p[7] - bx) ** 2 + (p[8] - by) ** 2) ** 0.5
                    if d < best: best, near = d, i
            if near is not None:
                ti = f["p"][near][0]
                n_cand = n_cand + 1 if ti == cand else 1; cand = ti
                if cur < 0 or ti == cur or n_cand >= CONFIRM: cur = ti
                if ti == cur: last_seen = f["t"]; f["h"] = near
            elif f["t"] - last_seen > HOLD:
                cur = -1
            if cur >= 0: pc[cur] += dt
        f["pc"] = [round(pc[0], 1), round(pc[1], 1)]
    return pc


def summary(D, pc):
    live = sum(1 for f in D["frames"] if f.get("live")) / D.get("fps", 5)
    tot = pc[0] + pc[1]
    a = round(100 * pc[0] / tot) if tot else 0
    return f"{D['teams'][0]['name']} {a} % – {100 - a} % {D['teams'][1]['name']}  (posjed poznat {tot / max(live, 1):.0%} vremena igre)"


def yt_id(url):
    m = re.search(r"(?:v=|youtu\.be/|/live/|/shorts/)([\w-]{11})", url or ""); return m.group(1) if m else None


def main():
    for st in (sys.stdout, sys.stderr):
        try: st.reconfigure(encoding="utf-8", errors="replace")
        except Exception: pass
    ap = argparse.ArgumentParser()
    ap.add_argument("web", nargs="?"); ap.add_argument("--all", action="store_true"); ap.add_argument("--upload", action="store_true")
    a = ap.parse_args()
    if a.web:
        D = json.load(open(a.web, encoding="utf-8")); pc = add_possession(D)
        json.dump(D, open(a.web, "w", encoding="utf-8"), separators=(",", ":")); print(summary(D, pc)); return
    if not a.all: ap.error("zadaj web.json ili --all")
    matches = {}
    for f in glob.glob(str(ROOT / "site/src/data/*.json")):
        for m in json.load(open(f, encoding="utf-8"))["matches"]:
            v = yt_id(m.get("youtube"))
            if v: matches[v] = m
    for v, m in sorted(matches.items(), key=lambda x: x[1]["date"]):
        w = ROOT / "run" / v / "web.json"
        if not w.exists(): continue
        D = json.load(open(w, encoding="utf-8")); pc = add_possession(D)
        json.dump(D, open(w, "w", encoding="utf-8"), separators=(",", ":"))
        print(f"{m['id']:45s} {summary(D, pc)}", flush=True)
        if a.upload:
            H, A = D["teams"][0]["name"], D["teams"][1]["name"]
            subprocess.run([sys.executable, str(ROOT / "scripts" / "upload_analysis.py"), str(w), "--match", m["id"], "--yt-offset", "0",
                            "--team-map", f"{H}=home", f"{A}=away"], cwd=ROOT / "scripts")


if __name__ == "__main__":
    main()
