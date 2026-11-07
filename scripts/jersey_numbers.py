"""Brojevi na dresovima za cijelu utakmicu: track -> broj igrača (iz zapisnika).

  python scripts/jersey_numbers.py run/<id>/video.mp4 run/<id>/tracks.json run/<id>/teams.json --match <ID> \
         --out run/<id>/numbers.json [--every 0.4] [--min-h 55]

Koraci:
1. ekipa i boja dresa po tracku iz teams.json (piše ga export_match.py)
2. dopušteni brojevi = igrači ekipe iz zapisnika utakmice (bez golmana), iz site/src/data
3. za svaki track svakih `--every` s: izrez broja (number_crop) -> PARSeq ocjena SAMO za brojeve iz zapisnika
4. glasanje po tracku (sigurnija čitanja imaju veću težinu); isti broj u istoj ekipi ne smije biti na dva
   tracka u isto vrijeme (ostaje jači)
"""
import argparse, collections, glob, json, os, sys, time
import cv2, numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def roster_numbers(match_id):
    """{0: {"nums": [...], "gk": [...]}, 1: {...}} iz zapisnika (roster) i popisa igrača"""
    for f in glob.glob(os.path.join(ROOT, "site/src/data/*.json")):
        d = json.load(open(f, encoding="utf-8"))
        m = next((x for x in d["matches"] if x["id"] == match_id), None)
        if not m: continue
        P = {p["id"]: p for p in d.get("players", [])}
        out = {}
        for ti, side in enumerate(("home", "away")):
            r = (m.get("roster") or {}).get(side) or {}
            num = r.get("num") or {}
            nums, gk = set(), set()
            for pid in r.get("players", []):
                n = str(num.get(pid) or (P.get(pid) or {}).get("num") or "").strip()
                if not n.isdigit(): continue
                (gk if pid in r.get("gk", []) or (P.get(pid) or {}).get("gk") else nums).add(str(int(n)))
            out[ti] = {"nums": sorted(nums - gk, key=int), "gk": sorted(gk, key=int)}
        return out
    sys.exit(f"utakmica {match_id} nije u site/src/data")


def main():
    for st in (sys.stdout, sys.stderr):
        try: st.reconfigure(encoding="utf-8", errors="replace")
        except Exception: pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video"); ap.add_argument("tracks"); ap.add_argument("teams")
    ap.add_argument("--match", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--every", type=float, default=0.4, help="isti track najviše svakih N s")
    ap.add_argument("--min-h", type=int, default=75, help="najmanja visina igrača u px (manji: broj je premalen)")
    ap.add_argument("--min-post", type=float, default=0.7); ap.add_argument("--min-abs", type=float, default=0.3)
    ap.add_argument("--min-greedy", type=float, default=0.9, help="slobodno čitanje (bez zapisnika) mora dati isti broj s ovom sigurnošću")
    ap.add_argument("--crop", choices=["fixed", "color"], default="fixed",
                    help="fixed: stalni dio leđa (radi i za prugaste dresove); color: traženje piksela različitih od dresa (number_crop)")
    ap.add_argument("--end", type=float, default=1e9, help="samo do N-te minute snimke (brzi test)")
    ap.add_argument("--debug", help="mapa: spremi uzorak izrezaka s pročitanim brojem (za provjeru)")
    a = ap.parse_args()

    from parseq_digits import DigitReader
    from number_crop import number_crop
    T = json.load(open(a.teams)); team = {int(k): v for k, v in T["track_team"].items()}
    kit = [np.array(T["kit_lab"][0], float), np.array(T["kit_lab"][1], float)]
    ROS = roster_numbers(a.match)
    for ti in (0, 1): print(f"{T['names'][ti]}: brojevi iz zapisnika {ROS[ti]['nums']} (golmani {ROS[ti]['gk']})")
    if not ROS[0]["nums"] or not ROS[1]["nums"]: sys.exit("zapisnik nema brojeve za obje ekipe")
    tl = [fr for fr in json.load(open(a.tracks))["timeline"] if fr["t"] <= a.end * 60]
    R = DigitReader(); cap = cv2.VideoCapture(a.video); fps = cap.get(cv2.CAP_PROP_FPS) or 30

    last_read, pos, t0 = {}, 0, time.time()
    reads = collections.defaultdict(list)                  # track -> [(t, num, post, p_abs)]
    span = collections.defaultdict(lambda: [1e9, -1e9]); crops_n = 0; dbg, dbg_n = [], [0]
    for k, fr in enumerate(tl):
        for p in fr["players"]:
            s = span[p["id"]]; s[0] = min(s[0], fr["t"]); s[1] = max(s[1], fr["t"])
        todo = [p for p in fr["players"] if team.get(p["id"]) in (0, 1) and p["box"][3] - p["box"][1] >= a.min_h
                and p["box"][3] < 716 and fr["t"] - last_read.get(p["id"], -1e9) >= a.every]
        if not todo: continue
        target = int(round(fr["t"] * fps))
        while pos < target: cap.grab(); pos += 1
        ok, f = cap.read(); pos += 1
        if not ok: break
        crops, who = [], []
        for p in todo:
            last_read[p["id"]] = fr["t"]
            if a.crop == "fixed":                         # broj na leđima: gornja polovica torza, sredina
                x1, y1, x2, y2 = map(int, p["box"]); h, w = y2 - y1, x2 - x1
                c = f[max(0, y1 + int(.14 * h)):y1 + int(.46 * h), max(0, x1 + int(.2 * w)):x2 - int(.2 * w)]
                c = c.copy() if c.size else None
            else:
                c, _ = number_crop(f, p["box"], kit[team[p["id"]]])
            if c is not None and c.shape[0] >= 6 and c.shape[1] >= 4: crops.append(c); who.append(p)
        if not crops: continue
        crops_n += len(crops)
        greedy = R.read(crops)
        for p, c, sc, (gt, gc) in zip(who, crops, R.score(crops, [ROS[team[p["id"]]]["nums"] for p in who]), greedy):
            if not sc: continue
            ks = list(sc); v = np.array([sc[q] for q in ks]); post = np.exp(v - v.max()); post /= post.sum()
            b = int(np.argmax(v))
            # ocjena samo među brojevima iz zapisnika uvijek nekoga izabere; zato i slobodno čitanje mora reći isto
            ok_ = post[b] >= a.min_post and np.exp(v[b]) >= a.min_abs and gt == ks[b] and gc >= a.min_greedy
            if ok_: reads[p["id"]].append((fr["t"], ks[b], float(post[b]), float(np.exp(v[b]))))
            if a.debug and dbg_n[0] < 120 and np.random.random() < 0.05:
                big = cv2.resize(c, (96, 96), interpolation=cv2.INTER_CUBIC); big = cv2.copyMakeBorder(big, 0, 26, 0, 4, cv2.BORDER_CONSTANT)
                cv2.putText(big, f"{gt or '-'} {gc:.2f}/{ks[b]}{' OK' if ok_ else ''}", (3, big.shape[0] - 7), 0, 0.45, (0, 255, 0) if ok_ else (80, 80, 255), 1)
                dbg.append(big); dbg_n[0] += 1
        if k % 3000 == 0: print(f"  {fr['t'] / 60:5.1f} min  izrezaka {crops_n}  ({time.time() - t0:.0f} s)", flush=True)

    if a.debug and dbg:                                   # mreža izrezaka: slobodno/zapisnik, + = prihvaćeno
        os.makedirs(a.debug, exist_ok=True); H_ = max(x.shape[0] for x in dbg)
        dbg = [cv2.copyMakeBorder(x, 0, H_ - x.shape[0], 0, 0, cv2.BORDER_CONSTANT) for x in dbg]
        rows = [np.hstack(dbg[i:i + 10] + [np.zeros_like(dbg[0])] * (10 - len(dbg[i:i + 10]))) for i in range(0, len(dbg), 10)]
        cv2.imwrite(os.path.join(a.debug, "izrezi.jpg"), np.vstack(rows)); print("uzorak izrezaka:", os.path.join(a.debug, "izrezi.jpg"))
    # glasanje po tracku
    tracks = {}
    for tid, L in reads.items():
        sc = collections.defaultdict(float)
        for _, num, post, _ in L: sc[num] += post ** 2
        num, best = max(sc.items(), key=lambda z: z[1]); share = best / sum(sc.values())
        if best >= 1.0 and share >= 0.6 and sum(1 for x in L if x[1] == num) >= 2:
            tracks[tid] = {"num": num, "team": team[tid], "score": round(best, 2), "share": round(share, 2), "n": len(L)}
    # isti broj u istoj ekipi u isto vrijeme: ostaje jači track
    keep, by = {}, collections.defaultdict(list)
    for tid, info in sorted(tracks.items(), key=lambda z: -z[1]["score"]):
        key = (info["team"], info["num"])
        if any(min(span[tid][1], span[o][1]) - max(span[tid][0], span[o][0]) > 1.0 for o in by[key]): continue
        by[key].append(tid); keep[tid] = info
    json.dump({"tracks": {str(k): v for k, v in keep.items()}, "roster": {str(k): v for k, v in ROS.items()}}, open(a.out, "w"))

    det = collections.Counter(); lab = collections.Counter()
    for fr in tl:
        for p in fr["players"]:
            if team.get(p["id"]) in (0, 1): det[team[p["id"]]] += 1; lab[team[p["id"]]] += p["id"] in keep
    print(f"izrezaka {crops_n}, trackova s brojem {len(keep)} ({(time.time() - t0) / 60:.1f} min)")
    for ti in (0, 1):
        sec = collections.Counter()
        for tid, v in keep.items():
            if v["team"] == ti: sec[v["num"]] += span[tid][1] - span[tid][0]
        print(f"  {T['names'][ti]}: igrač poznat u {lab[ti] / max(1, det[ti]):.0%} detekcija; "
              + ", ".join(f"#{n} {s / 60:.0f} min" for n, s in sorted(sec.items(), key=lambda z: int(z[0]))))


if __name__ == "__main__":
    main()
