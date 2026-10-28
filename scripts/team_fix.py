"""Boja dresa po detekciji (iz match.json) + rezanje tracka na mjestu zamjene identiteta između ekipa.
python3 team_fix.py clip.mp4 tracks.json out.json --cfg match.json [--window 6]
"""
import argparse, json, os, sys, cv2
from collections import defaultdict, Counter, deque
sys.path.insert(0, os.path.dirname(__file__))
from matchcfg import Match, chroma_feat

ap = argparse.ArgumentParser()
ap.add_argument("video"); ap.add_argument("tracks"); ap.add_argument("out"); ap.add_argument("--cfg", required=True)
ap.add_argument("--window", type=int, default=6)
a = ap.parse_args()
M = Match(a.cfg)
d = json.load(open(a.tracks)); tl = d["timeline"]

def frames_at(video, times):
    """sekvencijalno čitanje (brže od skakanja)"""
    cap = cv2.VideoCapture(video); fps = cap.get(5); want = {round(t * fps): i for i, t in enumerate(times)}
    fi = 0; last = max(want)
    while fi <= last:
        ok, f = cap.read()
        if not ok: break
        if fi in want: yield want[fi], f
        fi += 1

for i, f in frames_at(a.video, [fr["t"] for fr in tl]):
    for p in tl[i]["players"]: p["color"] = M.classify(chroma_feat(f, p["box"]))

TEAMS = set(M.teams); OTHER = {"sudac"}
next_id = max(p["id"] for fr in tl for p in fr["players"]) + 1
state = {}; splits = []
for fr in tl:
    for p in fr["players"]:
        oid = p["id"]; c = p.get("color", "?")
        s = state.setdefault(oid, {"new": oid, "votes": Counter(), "recent": deque(maxlen=a.window)})
        s["recent"].append(c)
        team = s["votes"].most_common(1)[0][0] if s["votes"] else c
        rc = Counter(x for x in s["recent"] if x in TEAMS | OTHER)
        if (team in TEAMS and len(s["recent"]) == a.window and rc and rc.most_common(1)[0][1] >= a.window - 1
                and rc.most_common(1)[0][0] != team and sum(s["votes"].values()) >= a.window):
            splits.append((fr["t"], s["new"], next_id, team, rc.most_common(1)[0][0]))
            s["new"] = next_id; next_id += 1; s["votes"] = Counter(s["recent"])
        else:
            s["votes"][c] += 1
        p["orig_id"] = oid; p["id"] = s["new"]

final = defaultdict(Counter)
for fr in tl:
    for p in fr["players"]: final[p["id"]][p.get("color", "?")] += 1
for fr in tl:
    for p in fr["players"]:
        best = [k for k, _ in final[p["id"]].most_common() if k != "?"]
        p["team"] = best[0] if best and final[p["id"]][best[0]] >= 0.3 * sum(final[p["id"]].values()) else "?"
json.dump(d, open(a.out, "w"))
cnt = Counter(p["team"] for fr in tl for p in fr["players"])
print(f"rezova (ID switch): {len(splits)} | detekcija po ulozi: {dict(cnt)}")
