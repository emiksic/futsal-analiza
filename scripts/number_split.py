"""Reži trackove gdje se pouzdano pročitani broj uporno promijeni (zamjena identiteta unutar iste ekipe).
python3 number_split.py tracks.json numbers.json out_tracks.json out_numbers.json [--run 4]
"""
import argparse, json
from collections import defaultdict, Counter
ap = argparse.ArgumentParser()
for k in ("tracks", "numbers", "out_tracks", "out_numbers"): ap.add_argument(k)
ap.add_argument("--run", type=int, default=4); ap.add_argument("--conf", type=float, default=0.6)
a = ap.parse_args()
d = json.load(open(a.tracks)); tl = d["timeline"]; N = json.load(open(a.numbers)); reads = N["reads"]

def compatible(x, y):
    """isti igrač može dati x i y (djelomično vidljiv broj)"""
    return x == y or (len(x) == 1 and x in y) or (len(y) == 1 and y in x)

seq = defaultdict(list)
for r in reads:
    if r["conf"] >= a.conf and r["num"] != "1": seq[r["id"]].append(r)
for s in seq.values(): s.sort(key=lambda r: r["t"])

cuts = defaultdict(list)          # tid -> [vrijeme reza]
for tid, s in seq.items():
    cur = None; cur_n = 0; i = 0
    while i < len(s):
        n = s[i]["num"]
        if cur is None or compatible(n, cur):
            if cur is None or (len(n) > len(cur)): cur = n if cur is None or len(n) >= len(cur) else cur
            cur_n += 1; i += 1; continue
        # moguća promjena: treba RUN uzastopnih čitanja kompatibilnih s novim brojem
        j = i; new = n
        while j < len(s) and compatible(s[j]["num"], new) and not compatible(s[j]["num"], cur):
            if len(s[j]["num"]) > len(new): new = s[j]["num"]
            j += 1
        lasting = j - i >= a.run and s[j - 1]["t"] - s[i]["t"] >= 1.0
        old_back = any(compatible(r["num"], cur) and not compatible(r["num"], new) for r in s[j:j + 10])
        if lasting and not old_back and cur_n >= 2:
            t_cut = (s[i - 1]["t"] + s[i]["t"]) / 2
            cuts[tid].append(t_cut); cur, cur_n, i = new, j - i, j
        else:
            i += 1                                     # šum, preskoči

next_id = max(p["id"] for fr in tl for p in fr["players"]) + 1
remap = {}                                            # (tid, segment) -> novi id
def seg_id(tid, t):
    k = sum(t > c for c in cuts.get(tid, []))
    if k == 0: return tid
    global next_id
    if (tid, k) not in remap: remap[(tid, k)] = next_id; next_id += 1
    return remap[(tid, k)]
for fr in tl:
    for p in fr["players"]:
        if p["id"] in cuts: p["id"] = seg_id(p["id"], fr["t"])
for r in reads:
    if r["id"] in cuts: r["id"] = seg_id(r["id"], r["t"])
json.dump(d, open(a.out_tracks, "w")); json.dump({"reads": reads}, open(a.out_numbers, "w"))
print("rezova po broju:", sum(len(v) for v in cuts.values()))
for tid, cs in cuts.items(): print(f"  track {tid}: rez u {', '.join(f'{c:.1f}s' for c in cs)}")
