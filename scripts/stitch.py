"""Spajanje fragmentiranih trackova: isti tim + blizu predviđene pozicije + mali vremenski razmak.
Upotreba: python3 stitch.py tracks.json out.json [--max-gap 3]
"""
import json, sys, argparse, collections
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument("inp"); ap.add_argument("out")
ap.add_argument("--max-gap", type=float, default=3.0, help="max sekundi rupe")
ap.add_argument("--base-px", type=float, default=60, help="tolerancija pozicije")
ap.add_argument("--px-per-s", type=float, default=180, help="koliko se tolerancija širi po sekundi")
ap.add_argument("--cfg")
a = ap.parse_args()

PLAYER_TEAMS = {"ljubicasti", "bijeli", "golman_z"}
if a.cfg:
    import os; sys.path.insert(0, os.path.dirname(__file__))
    from matchcfg import Match
    PLAYER_TEAMS = set(Match(a.cfg).teams)
d = json.load(open(a.inp)); tl = d["timeline"]

# skupi točke (t, x_noge, y_noge) po tracku; tim = većinski glas
pts = collections.defaultdict(list); tvotes = collections.defaultdict(collections.Counter)
for fr in tl:
    for p in fr["players"]:
        x1, y1, x2, y2 = p["box"]
        pts[p["id"]].append((fr["t"], (x1 + x2) / 2, y2))
        tvotes[p["id"]][p["team"]] += 1
team = {k: v.most_common(1)[0][0] for k, v in tvotes.items()}

def endpoint(seq, last=True, n=5):
    """pozicija i brzina na kraju (ili početku) tracka"""
    s = seq[-n:] if last else seq[:n]
    t = np.array([q[0] for q in s]); xy = np.array([[q[1], q[2]] for q in s])
    v = (xy[-1] - xy[0]) / (t[-1] - t[0]) if len(s) > 1 and t[-1] > t[0] else np.zeros(2)
    return (t[-1] if last else t[0]), (xy[-1] if last else xy[0]), v

tracks = [k for k in pts if team[k] in PLAYER_TEAMS]
ends = {k: endpoint(pts[k], True) for k in tracks}
starts = {k: endpoint(pts[k], False) for k in tracks}

# kandidati za spajanje: A završi, B počne nakon toga
cands = []
for A in tracks:
    tA, pA, vA = ends[A]
    for B in tracks:
        if A == B or team[A] != team[B]: continue
        tB, pB, _ = starts[B]
        gap = tB - tA
        if not (0 < gap <= a.max_gap): continue
        pred = pA + vA * min(gap, 1.0)          # predikcija, brzinu ne vjerujemo predugo
        dist = np.linalg.norm(pB - pred)
        if dist < a.base_px + a.px_per_s * gap:
            cands.append((dist + 40 * gap, A, B))

# pohlepno: najbolji parovi prvi, svaki kraj/početak koristi se jednom
cands.sort(); used_end, used_start, nxt = set(), set(), {}
for cost, A, B in cands:
    if A in used_end or B in used_start: continue
    nxt[A] = B; used_end.add(A); used_start.add(B)

# lanci -> novi ID (najmanji u lancu)
root = {}
for k in tracks:
    if k in used_start: continue
    chain, c = [k], k
    while c in nxt: c = nxt[c]; chain.append(c)
    for c in chain: root[c] = k

for fr in tl:
    for p in fr["players"]:
        p["orig_id"] = p["id"]; p["id"] = root.get(p["id"], p["id"])
json.dump(d, open(a.out, "w"))
n_after = len(set(root.values()))
print(f"igrackih trackova: {len(tracks)} -> {n_after}  (spojeno {len(nxt)})")
