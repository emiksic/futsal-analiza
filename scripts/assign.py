"""Dodjela brojeva trackovima uz zapisnik: model grešaka čitanja + ograničenja igre.
- P(čitanje | igrač N): točno; djelomično (jedna znamenka dvoznamenkastog broja); ostalo = greška
- isti broj ne može biti na dva tracka u isto vrijeme; najviše --field brojeva u polju po ekipi (bez izmjena)
python3 assign.py tracks.json reads.json out_tracks.json --cfg match.json --roster roster.json [--field 4]
"""
import argparse, json, os, sys, numpy as np
from collections import defaultdict
sys.path.insert(0, os.path.dirname(__file__))
from matchcfg import Match
ap = argparse.ArgumentParser()
ap.add_argument("tracks"); ap.add_argument("reads"); ap.add_argument("out")
ap.add_argument("--cfg", required=True); ap.add_argument("--roster", required=True)
ap.add_argument("--field", type=int, default=4); ap.add_argument("--min-score", type=float, default=4.0)
a = ap.parse_args()
Mt = Match(a.cfg); RO = json.load(open(a.roster))
d = json.load(open(a.tracks)); tl = d["timeline"]; reads = json.load(open(a.reads))["reads"]
EPS, NULL = 0.02, 0.08                         # greška čitanja; "nasumični broj" (nul-model)

def p_read(r, N):
    if r == N: return 0.85 if len(N) == 1 else 0.5
    if len(r) == 1 and len(N) == 2 and r in N: return 0.5 / len(set(N))
    return EPS

team_of, span, gk = {}, {}, set()
for fr in tl:
    for p in fr["players"]:
        team_of[p["id"]] = p["team"]; s = span.setdefault(p["id"], [fr["t"], fr["t"]]); s[1] = fr["t"]
        if p.get("gk"): gk.add(p["id"])
by = defaultdict(list)
for r in reads:
    if r["id"] not in gk and team_of.get(r["id"]) in Mt.teams: by[r["id"]].append(r)

cand = []
for tid, rs in by.items():
    tm = team_of[tid]; ro = RO[Mt.name[tm]]; nums = [n for n in ro["players"] if n not in ro["gk"]]
    for N in nums:
        ll = sum(r["conf"] * (np.log(p_read(r["num"], N)) - np.log(NULL)) for r in rs)
        if ll >= a.min_score: cand.append((ll, tid, N))
cand.sort(reverse=True)

def ov(i, j): return min(span[i][1], span[j][1]) - max(span[i][0], span[j][0])
assigned, holders, used = {}, defaultdict(list), defaultdict(set)
for ll, tid, N in cand:
    tm = team_of[tid]
    if tid in assigned: continue
    if any(ov(tid, o) > 0.5 for o in holders[(tm, N)]): continue          # isti broj, isto vrijeme
    if N not in used[tm] and len(used[tm]) >= a.field: continue          # već 4 u polju
    assigned[tid] = N; holders[(tm, N)].append(tid); used[tm].add(N)
for fr in tl:
    for p in fr["players"]:
        p.pop("player", None)
        if p["id"] in assigned: p["player"] = f"{Mt.name[p['team']]} {assigned[p['id']]}"
json.dump(d, open(a.out, "w"))
tot = sum(1 for fr in tl for p in fr["players"] if p["team"] in Mt.teams and not p.get("gk"))
lab = sum(1 for fr in tl for p in fr["players"] if "player" in p)
print(f"dodijeljeno trackova: {len(assigned)} | detekcija s brojem: {lab}/{tot} ({lab/tot*100:.0f}%)")
for tm in Mt.teams:
    print(f"  {Mt.name[tm]} u polju: {sorted(used[tm], key=int)}")
    for N in sorted(used[tm], key=int):
        print(f"     {N:>3}: trackovi {holders[(tm, N)]}  (~{sum(span[x][1]-span[x][0] for x in holders[(tm, N)]):.0f} s)")
