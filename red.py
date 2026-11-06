"""Obradi sve utakmice koje su na stranici stavljene u red (admin -> Utakmica -> Analiza -> "Stavi u red").

  python red.py            obradi cijeli red (skidanje, traka, lopta, igrači, teren, mini-mapa, posjed, upload)
  python red.py --list     samo ispiši što čeka

Za svaku utakmicu u redu: status na stranici -> "U obradi", pa batch.py (isti koraci kao inače; već gotovi koraci se
preskaču, ali izvoz i upload se ponove), pa status -> "Analizirano" (upload ga postavi) ili "Greška u obradi" s razlogom.
Ključ: .env (SUPABASE_SECRET_KEY), kao upload_analysis.py.
"""
import argparse, json, subprocess, sys, time, urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "scripts"))
from upload_analysis import load_env, call          # noqa: E402
from batch import yt_id                             # noqa: E402

COLS = "id,comp,round,date,home,away,hall,status,youtube,analysis"


def set_status(url, key, m, status, **extra):
    an = dict(m.get("analysis") or {}); an["status"] = status
    an.pop("error", None); an.update(extra)          # "error" se vidi u adminu
    call("PATCH", f"{url}/rest/v1/matches?id=eq.{m['id']}", key, json.dumps({"analysis": an}).encode("utf-8"),
         {"Content-Type": "application/json", "Prefer": "return=minimal"})
    m["analysis"] = an


def main():
    for st in (sys.stdout, sys.stderr):
        try: st.reconfigure(encoding="utf-8", errors="replace")
        except Exception: pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()
    url, key = load_env()
    q = urllib.parse.quote("analysis->>status")
    rows = call("GET", f"{url}/rest/v1/matches?{q}=eq.queued&select={COLS}&order=date.asc", key) or []
    if not rows: print("Red je prazan."); return
    print(f"U redu: {len(rows)}")
    for m in rows: print(f"  {m['id']:45s} {m.get('youtube') or '(nema YouTube linka)'}")
    if a.list: return

    todo = []
    for m in rows:
        v = yt_id(m.get("youtube"))
        if not v:
            set_status(url, key, m, "failed", error="Utakmica nema YouTube link."); print(f"! {m['id']}: nema YouTube linka"); continue
        for f in ("batch.done", "minimapa.done"):                        # iz reda = obradi ponovno (izvoz + upload)
            (ROOT / "run" / v / f).unlink(missing_ok=True)
        set_status(url, key, m, "processing"); todo.append((m, v))
    if not todo: return
    (ROOT / "run").mkdir(exist_ok=True)
    mf = ROOT / "run" / "queue_matches.json"
    json.dump([{k: m[k] for k in COLS.split(",") if k != "analysis"} for m, _ in todo], open(mf, "w", encoding="utf-8"), ensure_ascii=False)
    t0 = time.time()
    subprocess.run([sys.executable, str(ROOT / "batch.py"), "--matches", str(mf)], cwd=ROOT)

    print(f"\n=== red gotov za {(time.time() - t0) / 60:.0f} min")
    for m, v in todo:
        cur = (call("GET", f"{url}/rest/v1/matches?id=eq.{m['id']}&select=id,analysis", key) or [{}])[0]
        an = cur.get("analysis") or {}
        if an.get("status") == "done" and (ROOT / "run" / v / "batch.done").exists():
            print(f"  ok  {m['id']}"); continue
        why = ("obrada je stala prije kraja, vidi run/batch_log.txt" if not (ROOT / "run" / v / "batch.done").exists()
               else "video je obrađen, ali mini-mapa nije napravljena (dvorana nije kalibrirana ili nema dresa u data/dresovi.json)")
        m["analysis"] = an
        if an.get("data"):                                       # stara analiza postoji: ostaje vidljiva
            set_status(url, key, m, "done", error=why); print(f"  !   {m['id']}: {why} (ostaje prethodna analiza)")
        else:
            set_status(url, key, m, "failed", error=why); print(f"  !!  {m['id']}: {why}")


if __name__ == "__main__":
    main()
