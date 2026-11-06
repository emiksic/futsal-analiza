"""Pregled TV trake za sve utakmice u run/ i (po želji) ponovni upis golova i tempa u bazu.

  python scripts/traka_status.py                  tablica: koja utakmica ima kakvu traku (novi PARSeq / stari čitač / nema)
  python scripts/traka_status.py --promote        traka_test.json (PARSeq) postaje traka.json ako je bolja (stari čitač, ili više sata / pročitanih slika), stara ide u traka_stara.json
  python scripts/traka_status.py --write          za sve s PARSeq trakom: goals_to_site.py i stats_to_site.py --write
"""
import argparse, glob, json, os, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent; RUN = ROOT / "run"


def yt_id(url):
    m = re.search(r"(?:v=|youtu\.be/|/live/|/shorts/)([\w-]{11})", url or ""); return m.group(1) if m else None


def info(p):
    try: d = json.load(open(p, encoding="utf-8"))
    except Exception: return None
    r = d.get("reads", []); g = [x for x in d.get("goals", []) if not x.get("corrected")]
    return {"reader": d.get("reader", "tpl"), "profile": d.get("profile", "?"),
            "pct": sum(x[1] is not None for x in r) / max(1, len(r)), "play": sum(x[1] - x[0] for x in d.get("play", [])) / 60,
            "goals": len(g), "score": "-".join(map(str, g[-1]["score"])) if g else "0-0"}


def main():
    for st in (sys.stdout, sys.stderr):
        try: st.reconfigure(encoding="utf-8", errors="replace")
        except Exception: pass
    ap = argparse.ArgumentParser(); ap.add_argument("--promote", action="store_true"); ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    matches = {}
    for f in glob.glob(str(ROOT / "site/src/data/*.json")):
        for m in json.load(open(f, encoding="utf-8"))["matches"]:
            v = yt_id(m.get("youtube"))
            if v: matches[v] = m
    rows = []
    for d in sorted(RUN.iterdir()):
        if not d.is_dir() or d.name not in matches: continue
        m = matches[d.name]; tj, tt = d / "traka.json", d / "traka_test.json"
        new, cur = info(tt) if tt.exists() else None, info(tj) or {}
        better = new and new["reader"] == "parseq" and (cur.get("reader") != "parseq" or new["play"] > cur["play"] + 1 or new["pct"] > cur["pct"] + 0.05)
        if a.promote and tt.exists() and not better: print(f"  {d.name}: traka_test.json nije bolja od traka.json, ostaje")
        if a.promote and better:
            if tj.exists(): tj.replace(d / "traka_stara.json")
            tt.replace(tj); print(f"  {d.name}: traka_test.json -> traka.json")
        rows.append((m, d, info(tj), (d / "video.mp4").exists()))
    rows.sort(key=lambda x: x[0]["date"])
    print(f"\n{'datum':10s}  {'utakmica':45s} {'yt id':12s} {'čitač':6s} {'raspored':10s} {'čitano':>6s} {'sat':>5s} {'gol':>3s}  rez.  baza  video")
    for m, d, t, vid in rows:
        ev = m.get("events") or []
        hs = sum((e["type"] == "goal" and e["side"] == "home") or (e["type"] == "owngoal" and e["side"] == "away") for e in ev)
        aw = sum((e["type"] == "goal" and e["side"] == "away") or (e["type"] == "owngoal" and e["side"] == "home") for e in ev)
        res = f"{hs}-{aw}"
        if t: line = f"{t['reader']:6s} {t['profile']:10s} {t['pct']:6.1%} {t['play']:5.1f} {t['goals']:3d}  {t['score']:5s} {res:5s}"
        else: line = f"{'-':6s} {'-':10s} {'':6s} {'':5s} {'':3s}  {'':5s} {res:5s}"
        flag = "" if t and t["reader"] == "parseq" and t["play"] > 30 else "  <-"
        print(f"{m['date'][:10]}  {m['id']:45s} {d.name:12s} {line} {'da' if vid else 'ne':5s}{flag}")
    print("\n<- treba (ponovno) pročitati: python batch.py --retraka   (sat < 30 min ili stari čitač)")
    if not a.write: return
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    for m, d, t, _ in rows:
        if not t or t["reader"] != "parseq": continue
        print(f"\n=== {m['id']}")
        for s in ("goals_to_site.py", "stats_to_site.py"):
            subprocess.run([sys.executable, str(ROOT / "scripts" / s), str(d / "traka.json"), "--match", m["id"], "--write"], cwd=ROOT / "scripts", env=env)


if __name__ == "__main__":
    main()
