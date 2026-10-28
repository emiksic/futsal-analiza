"""Čitanje brojeva (lokalizacija + PARSeq) za sve igrače ekipa iz match.json; sprema sva čitanja.
Glasanje/spajanje radi revote.py.
python3 jersey_vote.py clip.mp4 tracks.json numbers.json --cfg match.json [--min-h 65] [--min-conf 0.5] [--start --end]
"""
import argparse, json, os, sys, cv2
sys.path.insert(0, os.path.dirname(__file__))
from parseq_digits import DigitReader
from number_crop import number_crop
from matchcfg import Match

ap = argparse.ArgumentParser()
ap.add_argument("video"); ap.add_argument("tracks"); ap.add_argument("out"); ap.add_argument("--cfg", required=True)
ap.add_argument("--min-h", type=int, default=65); ap.add_argument("--min-conf", type=float, default=0.5)
ap.add_argument("--every", type=int, default=1, help="svaki N-ti zapis timelinea")
ap.add_argument("--roster", help="roster.json: čitanje ograničeno na brojeve iz zapisnika")
ap.add_argument("--min-post", type=float, default=0.6); ap.add_argument("--min-abs", type=float, default=0.1)
ap.add_argument("--start", type=float, default=0); ap.add_argument("--end", type=float, default=1e9)
a = ap.parse_args()
Mt = Match(a.cfg); R = DigitReader()
import numpy as np
ROSTER = json.load(open(a.roster)) if a.roster else None
def cands_of(team):
    r = ROSTER[Mt.name[team]]; return [n for n in r["players"] if n not in r["gk"]]
tl = [fr for fr in json.load(open(a.tracks))["timeline"] if a.start <= fr["t"] <= a.end][::a.every]
cap = cv2.VideoCapture(a.video); fps = cap.get(5)
want = {round(fr["t"] * fps): fr for fr in tl}
fi = round(a.start * fps); cap.set(1, fi); last = max(want)
reads = []; n_crops = 0
while fi <= last:
    ok, f = cap.read()
    if not ok: break
    fr = want.get(fi); fi += 1
    if fr is None: continue
    crops, who = [], []
    for p in fr["players"]:
        if p["team"] not in Mt.teams or p.get("gk") or p["box"][3] - p["box"][1] < a.min_h or p["box"][3] >= 716: continue
        c, _ = number_crop(f, p["box"], Mt.kit_lab[p["team"]], Mt.c["teams"][p["team"]].get("num_lab"))
        if c is not None and c.shape[0] >= 6: crops.append(c); who.append(p)
    n_crops += len(crops)
    if ROSTER:
        for p, sc in zip(who, R.score(crops, [cands_of(p["team"]) for p in who])):
            if not sc: continue
            ks = list(sc); v = np.array([sc[k] for k in ks]); post = np.exp(v - v.max()); post /= post.sum()
            b = int(np.argmax(v))
            if post[b] >= a.min_post and np.exp(v[b]) >= a.min_abs:
                reads.append({"t": fr["t"], "id": p["id"], "team": p["team"], "num": ks[b], "conf": round(float(post[b]), 3),
                              "p_abs": round(float(np.exp(v[b])), 3)})
    else:
        for p, (txt, conf) in zip(who, R.read(crops)):
            if txt and len(txt) <= 2 and txt[0] != "0" and conf >= a.min_conf:
                reads.append({"t": fr["t"], "id": p["id"], "team": p["team"], "num": txt, "conf": round(conf, 3)})
json.dump({"reads": reads}, open(a.out, "w"))
print(f"izrezaka broja: {n_crops}, pouzdanih čitanja: {len(reads)}")
