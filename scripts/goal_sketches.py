"""Automatske skice golova (strijelac i asistent na terenu) iz lopte, igrača i kalibracije -> događaji u bazi (map).

  python scripts/goal_sketches.py --tracks run/7g1c/tracks.json --ball run/7g1c_full.json --court run/7g1c/court.json \\
         --traka run/7g1c/traka.json --home-kit dark --match 1-hmnl-2026-27-k2-square-rijeka [--write] [--png skice.png]

Za svaki gol s TV trake: trenutak ulaska lopte u gol, pa unatrag zadnji igrač ekipe strijelca uz loptu (= mjesto udarca)
i igrač iste ekipe prije njega (= asistent, ako između nije dotaknuo protivnik). Skica je okrenuta tako da ekipa napada
desni gol. Gol koji već ima ručno nacrtanu skicu se ne dira. Golovi gdje se udarac ne može pouzdano naći se preskoče.
"""
import argparse, collections, json, os, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from export_match import ball_path, otsu
from court_calib import sane


def main():
    ap = argparse.ArgumentParser()
    for k in ("tracks", "ball", "court", "traka"): ap.add_argument("--" + k, required=True)
    ap.add_argument("--home-kit", choices=["dark", "light"], required=True); ap.add_argument("--match")
    ap.add_argument("--write", action="store_true"); ap.add_argument("--png"); ap.add_argument("--out")
    a = ap.parse_args()
    tl = json.load(open(a.tracks))["timeline"]; tt = np.array([f["t"] for f in tl])
    cd = json.load(open(a.court)); L, W = cd["L"], cd["W"]; ct = np.array([f[0] for f in cd["frames"]])
    cH = [np.array(f[1]).reshape(3, 3) if f[1] else None for f in cd["frames"]]
    cH = [H if H is not None and sane(H, L, W) else None for H in cH]
    tr = json.load(open(a.traka)); bt, bxy = ball_path(a.ball)

    def H_at(t):
        i = int(np.searchsorted(ct, t))
        if i <= 0 or i >= len(ct): return None
        A, B = cH[i - 1], cH[i]
        if A is None or B is None: return A if A is not None else B
        w = (t - ct[i - 1]) / (ct[i] - ct[i - 1]); H = (1 - w) * A + w * B; return H / H[2, 2]
    def proj(H, x, y):
        p = H @ np.array([x, y, 1.0]); return np.array([p[0] / p[2], p[1] / p[2]])

    F = collections.defaultdict(list)
    for fr in tl:
        for p in fr["players"]:
            if p.get("feat"): F[p["id"]].append(p["feat"])
    lab = {i: np.median(v, 0) for i, v in F.items()}
    thr = otsu(np.array([v[0] for i, v in lab.items() if v[1] <= 145 and len(F[i]) >= 30]))
    dark = 0 if a.home_kit == "dark" else 1
    def team(i):
        v = lab.get(i)
        if v is None or v[1] > 145: return -1
        return dark if v[0] < thr else 1 - dark

    ends = [p[1] for p in tr["play"]]
    # smjer napada domaćih po poluvremenu (iz lopte pri golovima), kao export_match
    def ball_court(t0, t1):
        out = []
        for k in np.where((bt > t0) & (bt <= t1))[0]:
            if np.isnan(bxy[k, 0]): continue
            H = H_at(bt[k])
            if H is not None: out.append((bt[k], *proj(H, *bxy[k])))
        return np.array(out).reshape(-1, 3)
    votes = collections.Counter()
    for g in tr["goals"]:
        te = max([e for e in ends if e <= g["t"] + 0.5], default=None)
        if te is None: continue
        B = ball_court(te - 5, te)
        if len(B): votes[(g["period"], np.sign(B[-1, 1]) * (1 if g["side"] == "home" else -1))] += 1
    hdir = {p: (1 if votes[(p, 1)] >= votes[(p, -1)] else -1) for p in (1, 2)}
    if hdir[1] == hdir[2]: hdir[2] = -hdir[1]

    res = []
    for g in tr["goals"]:
        te = max([e for e in ends if e <= g["t"] + 0.5], default=None)
        st = 0 if g["side"] == "home" else 1; att = hdir[g["period"]] * (1 if st == 0 else -1)
        if te is None: res.append((g, None, "nema igre prije gola")); continue
        B = ball_court(te - 15, te + 0.5)
        inn = [i for i in range(len(B)) if att * B[i, 1] > L / 2 - 0.8 and abs(B[i, 2]) < 2.2]
        if inn: tg = B[inn[0], 0]
        else:                                   # nije viđena na samoj liniji: trenutak kad je bila najbliže golu (do 4 m)
            near = [i for i in range(len(B)) if np.hypot(B[i, 1] - att * L / 2, B[i, 2]) < 4]
            if not near: res.append((g, None, "lopta nije viđena blizu gola")); continue
            tg = B[min(near, key=lambda i: np.hypot(B[i, 1] - att * L / 2, B[i, 2])), 0]
        # dodiri: najbliži igrač (na terenu) uz loptu, 30/s, 6 s prije ulaska u gol
        touches = []
        for k in np.where((tt > tg - 6) & (tt <= tg))[0]:
            j = int(np.argmin(np.abs(bt - tt[k])))
            if abs(bt[j] - tt[k]) > 0.05 or np.isnan(bxy[j, 0]): continue
            H = H_at(tt[k])
            if H is None: continue
            b = proj(H, *bxy[j]); best = (1.3, None)
            for p in tl[k]["players"]:
                x1, y1, x2, y2 = p["box"]; c = proj(H, (x1 + x2) / 2, y2)
                if abs(c[0]) > L / 2 + 0.5 or abs(c[1]) > W / 2 + 0.5: continue
                d = np.hypot(*(c - b))
                if d < best[0]: best = (d, (team(p["id"]), p["id"], c))
            if best[1] and best[1][0] >= 0: touches.append((tt[k], *best[1]))
        own = [x for x in touches if x[1] == st]
        if not own: res.append((g, None, "nema igrača ekipe strijelca uz loptu prije gola")); continue
        shot = own[-1]
        if np.hypot(shot[3][0] - att * L / 2, shot[3][1]) > 30: res.append((g, None, "udarac predaleko, nesigurno")); continue
        assist = None
        for x in reversed([x for x in touches if x[0] < shot[0] - 0.4 and shot[0] - x[0] < 5]):
            if x[1] != st: break                                   # protivnik je dotaknuo -> nema asistencije
            if x[2] != shot[2] and np.hypot(*(x[3] - shot[3])) > 3: assist = x; break
        f = att                                                    # okreni da ekipa napada desno
        mp = {"s": [round(float(f * shot[3][0]), 1), round(float(f * shot[3][1]), 1)],
              "a": [round(float(f * assist[3][0]), 1), round(float(f * assist[3][1]), 1)] if assist else None, "auto": True}
        res.append((g, mp, f"udarac s {np.hypot(mp['s'][0] - L / 2, mp['s'][1]):.0f} m" + (", s asistencijom" if assist else "")))

    for g, mp, why in res:
        print(f"  {g['score'][0]}-{g['score'][1]} {g['sec'] // 60}'{g['sec'] % 60:02d}\"  {'ok ' if mp else '-- '} {why}")
    print(f"skica: {sum(1 for _, m, _ in res if m)} od {len(res)} golova")
    if a.out: json.dump([{"sec": g["sec"], "period": g["period"], "side": g["side"], "map": m} for g, m, _ in res], open(a.out, "w"))
    if a.png:
        import cv2
        s = 14; tiles = []
        for g, mp, _ in res:
            im = np.full((int((W + 2) * s), int((L + 2) * s), 3), (60, 120, 60), np.uint8)
            X = lambda x: int((x + L / 2 + 1) * s); Y = lambda y: int((y + W / 2 + 1) * s)
            cv2.rectangle(im, (X(-L / 2), Y(-W / 2)), (X(L / 2), Y(W / 2)), (255, 255, 255), 1); cv2.line(im, (X(0), Y(-W / 2)), (X(0), Y(W / 2)), (255, 255, 255), 1)
            cv2.putText(im, f"{g['score'][0]}-{g['score'][1]} {'SQR' if g['side'] == 'home' else 'RIJ'}", (5, 15), 0, 0.5, (255, 255, 255), 1)
            if mp:
                gp = (X(L / 2), Y(0))
                if mp["a"]: cv2.line(im, (X(mp["a"][0]), Y(mp["a"][1])), (X(mp["s"][0]), Y(mp["s"][1])), (255, 255, 255), 1); cv2.circle(im, (X(mp["a"][0]), Y(mp["a"][1])), 6, (255, 255, 255), 2)
                cv2.line(im, (X(mp["s"][0]), Y(mp["s"][1])), gp, (0, 220, 255), 2); cv2.circle(im, (X(mp["s"][0]), Y(mp["s"][1])), 7, (0, 0, 0), -1)
            tiles.append(im)
        while len(tiles) % 3: tiles.append(np.zeros_like(tiles[0]))
        cv2.imwrite(a.png, np.vstack([np.hstack(tiles[i:i + 3]) for i in range(0, len(tiles), 3)]))
    if not a.match: return
    from goals_to_site import api, load_env
    base, key = load_env()
    ev = api(f"{base}/rest/v1/matches?id=eq.{a.match}&select=events", key)[0]["events"] or []
    goals = [e for e in ev if e["type"] == "goal"]; n = 0
    for g, mp, _ in res:
        if not mp: continue
        cand = [e for e in goals if e["side"] == g["side"] and e["period"] == g["period"] and abs(e["sec"] - (g["sec"] - (g["period"] - 1) * 1200)) <= 90]
        if not cand: print(f"  ! gol {g['score']} nema para u bazi"); continue
        e = min(cand, key=lambda e: abs(e["sec"] - (g["sec"] - (g["period"] - 1) * 1200)))
        if e.get("map") and not e["map"].get("auto"): continue             # ručna skica ostaje
        e["map"] = mp; n += 1
    if a.write and n:
        api(f"{base}/rest/v1/matches?id=eq.{a.match}", key, "PATCH", {"events": ev}); print(f"Upisano {n} skica.")
    elif n: print(f"Upisalo bi se {n} skica. Za upis dodaj --write.")


if __name__ == "__main__":
    main()
