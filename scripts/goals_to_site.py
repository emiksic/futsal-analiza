"""Točna vremena golova s TV trake (scoreboard.py) -> događaji utakmice u bazi (sekunda + oznaka exact).

  python scripts/goals_to_site.py run/<id>/traka.json --match 1-hmnl-2026-27-k2-square-rijeka           (samo prikaz)
  python scripts/goals_to_site.py run/<id>/traka.json --match 1-hmnl-2026-27-k2-square-rijeka --write   (upis)

Gol iz baze (Semafor) i gol s trake se spoje ako je zabila ista ekipa, u istom poluvremenu, s razlikom do 90 s (najbliži prvi).
Gol koji već ima točnu sekundu sa Semafora (exact) se ne mijenja; ostali dobiju sekundu s trake. Golovi bez para se samo ispišu. Ključ: .env (SUPABASE_SECRET_KEY), kao upload_analysis.py.
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
    TR = json.load(open(a.traka)); tv = [g for g in TR["goals"] if not g["corrected"]]
    reads = [r for r in TR.get("reads", []) if r[1] is not None]
    def vtime(g):
        # sekunda YouTube snimke kad je gol pao: prvo čitanje na kojem sat već stoji na vremenu gola
        # (traka pokaže novi rezultat tek nekoliko sekundi kasnije, g["t"])
        c = [r[0] for r in reads if r[1] == g["period"] and r[2] == g["clock"] and g["t"] - 120 <= r[0] <= g["t"]]
        return round(min(c) if c else g["t"] - 3, 1)
    db = [e for e in events if e["type"] in ("goal", "owngoal")]
    def scorer(e): return e["side"] if e["type"] == "goal" else ("away" if e["side"] == "home" else "home")
    def tsec(e): return (e["period"] - 1) * 1200 + e["sec"]
    print(f"golova: baza {len(db)}, traka {len(tv)}")
    # spajanje po najbližem vremenu, samo ista ekipa i isto poluvrijeme, razlika do 90 s
    pairs = sorted((abs(tsec(e) - g["sec"]), i, j) for i, e in enumerate(db) for j, g in enumerate(tv)
                   if scorer(e) == g["side"] and e["period"] == g["period"] and abs(tsec(e) - g["sec"]) <= 90)
    used_e, used_g, match = set(), set(), {}
    for _, i, j in pairs:
        if i not in used_e and j not in used_g: used_e.add(i); used_g.add(j); match[i] = j
    # Semafor zna samo minutu, pa redoslijed golova u istoj ili bliskoj minuti zna biti zamijenjen (domaći/gosti).
    # Kad traka ima sve golove (isti broj kao baza), preostale golove iste ekipe u istom poluvremenu spoji
    # redom kojim su zabijeni na traci, bez obzira na razliku u vremenu.
    order = set()
    if len(tv) == len(db):
        for per in {e["period"] for e in db}:
            for side in ("home", "away"):
                E = sorted((i for i, e in enumerate(db) if i not in used_e and e["period"] == per and scorer(e) == side and not e.get("exact")), key=lambda i: tsec(db[i]))
                G = sorted((j for j, g in enumerate(tv) if j not in used_g and g["period"] == per and g["side"] == side), key=lambda j: tv[j]["sec"])
                if E and len(E) == len(G):
                    for i, j in zip(E, G): used_e.add(i); used_g.add(j); match[i] = j; order.add(i)
    changed = 0
    for i, e in sorted(enumerate(db), key=lambda x: tsec(x[1])):
        old = tsec(e); who = f"{scorer(e):4s}"
        if i not in match: print(f"  --  {who} baza {old // 60}'{old % 60:02d}\"  nema para na traci, ne mijenjam"); continue
        g = tv[match[i]]; new = g["sec"]
        vt = vtime(g)
        if e.get("vt") is None or abs(e["vt"] - vt) > 1: e["vt"] = vt; changed += 1          # za video u adminu (skica gola)
        if e.get("exact"):
            print(f"  ==  {who} baza {old // 60}'{old % 60:02d}\"  već točno sa Semafora (traka {new // 60}'{new % 60:02d}\"), ne mijenjam"); continue
        print(f"  ok  {who} baza {old // 60}'{old % 60:02d}\"  ->  {new // 60}'{new % 60:02d}\"" + ("  (redoslijed po traci)" if i in order else ""))
        e["sec"] = new - (g["period"] - 1) * 1200; e["exact"] = True; changed += 1
    for j, g in enumerate(tv):
        if j not in used_g: print(f"  ??  traka {g['sec'] // 60}'{g['sec'] % 60:02d}\" {g['side']} ({g['score'][0]}-{g['score'][1]}) nema para u bazi")
    events.sort(key=lambda e: (e.get("period", 0), e.get("sec", 0)))
    if not changed: print("Nema promjena."); return
    if a.write:
        api(f"{base}/rest/v1/matches?id=eq.{a.match}", key, "PATCH", {"events": events}); print("Upisano.")
    else:
        print(f"Promijenilo bi se {changed} golova. Za upis dodaj --write.")


if __name__ == "__main__":
    main()
