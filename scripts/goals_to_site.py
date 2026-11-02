"""Točna vremena golova s TV trake (scoreboard.py) -> događaji utakmice u bazi (sekunda + oznaka exact).

  python scripts/goals_to_site.py run/<id>/traka.json --match 1-hmnl-2026-27-k2-square-rijeka           (samo prikaz)
  python scripts/goals_to_site.py run/<id>/traka.json --match 1-hmnl-2026-27-k2-square-rijeka --write   (upis)

Golovi iz baze (Semafor) i s trake se spoje redom. Upisuje se samo ako se svaki par slaže: ista ekipa koja je zabila
i razlika najviše 60 s. Inače ništa ne mijenja i ispiše razlike. Ključ: .env (SUPABASE_SECRET_KEY), kao upload_analysis.py.
"""
import argparse, json, sys, urllib.request
from upload_analysis import load_env


def api(url, key, method="GET", body=None):
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json",
                                          "Prefer": "return=minimal"})
    with urllib.request.urlopen(req) as r:
        txt = r.read().decode(); return json.loads(txt) if txt else None


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("traka"); ap.add_argument("--match", required=True)
    ap.add_argument("--write", action="store_true"); a = ap.parse_args()
    base, key = load_env()
    rows = api(f"{base}/rest/v1/matches?id=eq.{a.match}&select=id,events", key)
    if not rows: sys.exit(f"Nema utakmice {a.match} u bazi.")
    events = rows[0]["events"] or []
    tv = [g for g in json.load(open(a.traka))["goals"] if not g["corrected"]]
    db = sorted([e for e in events if e["type"] in ("goal", "owngoal")], key=lambda e: (e["period"], e["sec"]))
    if len(tv) != len(db): sys.exit(f"Broj golova se ne slaže: traka {len(tv)}, baza {len(db)}. Ništa nije promijenjeno.")
    ok = True
    for e, g in zip(db, tv):
        scorer = e["side"] if e["type"] == "goal" else ("away" if e["side"] == "home" else "home")
        old = (e["period"] - 1) * 1200 + e["sec"]; new = g["sec"]
        good = scorer == g["side"] and abs(old - new) <= 60 and e["period"] == g["period"]
        ok &= good
        print(f"  {'ok' if good else '!!'}  {g['score'][0]}-{g['score'][1]}  baza {old // 60}'{old % 60:02d}\"  ->  traka {new // 60}'{new % 60:02d}\"  ({scorer} / {g['side']})")
        e["_new"] = new - (g["period"] - 1) * 1200
    if not ok: sys.exit("Neki golovi se ne slažu (!!). Ništa nije promijenjeno.")
    for e in db: e["sec"] = e.pop("_new"); e["exact"] = True
    events.sort(key=lambda e: (e.get("period", 0), e.get("sec", 0)))
    if a.write:
        api(f"{base}/rest/v1/matches?id=eq.{a.match}", key, "PATCH", {"events": events}); print("Upisano.")
    else:
        print("Sve se slaže. Za upis dodaj --write.")


if __name__ == "__main__":
    main()
