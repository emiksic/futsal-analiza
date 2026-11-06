"""Tempo utakmice s TV trake (scoreboard.py) -> matches.stats u bazi (prikaz: utakmica -> Statistika -> Tempo igre).

  python scripts/stats_to_site.py run/<id>/traka.json --match 1-hmnl-2026-27-k2-square-rijeka           (samo prikaz)
  python scripts/stats_to_site.py run/<id>/traka.json --match 1-hmnl-2026-27-k2-square-rijeka --write   (upis)

Treba stupac stats (jednom u Supabase SQL editoru): alter table public.matches add column if not exists stats jsonb;
"""
import argparse, json
from goals_to_site import api, load_env


def tempo(tr):
    # spoji dijelove koje je razdvojila samo nečitljiva slika (rupa < 1.5 s, a sat je u međuvremenu tekao)
    segs = []
    for t0, t1, per, el in tr["play"]:
        if segs and segs[-1][2] == per and t0 - segs[-1][1] < 1.5 and abs((el - segs[-1][3]) - (t0 - segs[-1][4])) <= 1.5:
            segs[-1][1] = t1
        else: segs.append([t0, t1, per, el, t0])
    if not segs: return None                                       # traka nije pročitana (nepoznata grafika)
    out = {"source": "TV traka", "halves": []}
    L = [s[1] - s[0] for s in segs]
    for p in sorted({s[2] for s in segs}):
        S = [s for s in segs if s[2] == p]
        out["halves"].append({"period": p, "real": round(S[-1][1] - S[0][0]), "play": round(sum(s[1] - s[0] for s in S)),
                              "stoppages": len(S) - 1})
    k = max(range(len(segs)), key=lambda i: L[i])
    out.update(stoppages=sum(h["stoppages"] for h in out["halves"]), avgPlay=round(sum(L) / len(L), 1),
               longestPlay=round(L[k]), longestAt=round(segs[k][3]))
    return out


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("traka"); ap.add_argument("--match", required=True)
    ap.add_argument("--write", action="store_true"); a = ap.parse_args()
    t = tempo(json.load(open(a.traka)))
    if t is None: print("nema dijelova igre s TV trake (sat nije pročitan), tempo se ne upisuje"); return
    st = {"tempo": t}
    print(f"prekida {t['stoppages']}, igra bez prekida prosječno {t['avgPlay']} s, najdulje {t['longestPlay']} s (od {t['longestAt'] // 60}'{t['longestAt'] % 60:02d}\")")
    for h in t["halves"]: print(f"  {h['period']}. poluvrijeme: trajalo {h['real'] // 60} min {h['real'] % 60} s, prekida {h['stoppages']}")
    bad = [h for h in t["halves"] if not (1200 <= h["real"] <= 3600)]
    if len(t["halves"]) != 2 or bad:
        print("! poluvremena nisu realna (svako mora trajati 20-60 min, točno dva): traka je krivo pročitana, tempo se NE upisuje"); return
    if not a.write: print("Za upis dodaj --write."); return
    base, key = load_env()
    rows = api(f"{base}/rest/v1/matches?id=eq.{a.match}&select=id,stats", key)
    if not rows: raise SystemExit(f"Nema utakmice {a.match} u bazi.")
    api(f"{base}/rest/v1/matches?id=eq.{a.match}", key, "PATCH", {"stats": {**(rows[0].get("stats") or {}), **st}})
    print("Upisano.")


if __name__ == "__main__":
    main()
