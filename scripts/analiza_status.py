"""Pregled video analize po utakmici (iz run/<id>/web.json): teren, lopta, ekipe, posjed.

  python scripts/analiza_status.py [--comps 1-hmnl-2026-27]

Stupci: teren = kadrova s poznatim terenom, lopta = kadrova s loptom, igra = kadrova dok teče sat,
osobe = prosječno osoba na terenu, dom/gos/sud = udio osoba po ekipi, posjed (dom–gos) i koliko je vremena igre posjed poznat.
"""
import argparse, collections, glob, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    for st in (sys.stdout, sys.stderr):
        try: st.reconfigure(encoding="utf-8", errors="replace")
        except Exception: pass
    ap = argparse.ArgumentParser(); ap.add_argument("--comps", nargs="*"); a = ap.parse_args()
    rows = []
    for f in glob.glob(str(ROOT / "site/src/data/*.json")):
        for m in json.load(open(f, encoding="utf-8"))["matches"]:
            v = re.search(r"(?:v=|youtu\.be/|/live/)([\w-]{11})", m.get("youtube") or "")
            if not v or (a.comps and m["comp"] not in a.comps): continue
            w = ROOT / "run" / v[1] / "web.json"
            if w.exists(): rows.append((m["date"], m["id"], w))
    print(f"{'utakmica':42s} {'teren':>5s} {'lopta':>5s} {'igra':>5s} {'osobe':>5s}  {'dom':>4s} {'gos':>4s} {'sud':>4s}   {'posjed':>9s} {'poznat':>6s}")
    for _, mid, w in sorted(rows):
        D = json.load(open(w, encoding="utf-8")); F = D["frames"]; n = len(F) or 1; fps = D.get("fps", 5)
        cal = [f for f in F if f.get("H")]
        cnt = collections.Counter(p[0] for f in F for p in f["p"]); tot = sum(cnt.values()) or 1
        live = sum(1 for f in F if f.get("live"))
        pc = F[-1].get("pc", [0, 0]) if F else [0, 0]; s = pc[0] + pc[1]
        poss = f"{round(100 * pc[0] / s):3d}–{100 - round(100 * pc[0] / s):<3d}" if s else "   –   "
        flag = "  <- malo terena" if len(cal) < 0.5 * n else ("  <- posjed nepouzdan" if s < 0.6 * live / fps else "")
        print(f"{mid.replace('1-hmnl-2026-27-', ''):42s} {len(cal) / n:5.0%} {sum(1 for f in F if f.get('b')) / n:5.0%} {live / n:5.0%} "
              f"{sum(len(f['p']) for f in cal) / max(1, len(cal)):5.1f}  {cnt[0] / tot:4.0%} {cnt[1] / tot:4.0%} {cnt[2] / tot:4.0%}   "
              f"{poss:>9s} {s / max(1, live / fps):6.0%}{flag}")


if __name__ == "__main__":
    main()
