"""Izvoz cijele utakmice za preglednik na stranici (mini-mapa + oznake preko YouTube videa).

  python scripts/export_match.py --tracks run/7g1c/tracks.json --ball run/7g1c_full.json --court run/7g1c/court.json \\
         --traka run/7g1c/traka.json --home SQR --away RIJ --home-kit dark --out run/7g1c/web.json [--hz 5]
  python scripts/upload_analysis.py run/7g1c/web.json --match <id> --yt-offset 0 --team-map SQR=home RIJ=away

Ulazi: igrači (track.py), lopta (tracknet.py detect), teren (court_calib.py track), TV traka (scoreboard.py).
Vrijeme u podacima = vrijeme snimke, pa je za isti YouTube prijenos --yt-offset 0.
Ekipe: po boji dresa (svijetla / tamna, prag se nađe sam), samo osobe na terenu; golman uz svoj gol ide svojoj ekipi.
Smjer napada po poluvremenu se odredi iz položaja lopte pri golovima. Posjed: scripts/possession.py (najbliži igrač lopti, samo dok teče sat).
"""
import argparse, collections, json, os, sys, types
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ball"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from court_calib import sane


def ball_path(dets_file, W_img=1280):
    import render_ball as R
    d = json.load(open(dets_file))
    a = types.SimpleNamespace(min_conf=0.45, short_conf=0.62, vmax=60, jump=2.0, max_gap=0.7, static_share=0, static_s=6.0,
                              step=2, fps_step=1 / np.median(np.diff([r["t"] for r in d[:200]])))
    steps = [{"t": r["t"], "dets": r["dets"], "cut": False, "cam": [0, 0]} for r in d]
    s = W_img / 1280
    R.dedupe(steps, s); trs = R.build_tracklets(steps, a, s); ch = R.best_path(trs, steps, a, s)
    pos = R.path_positions(ch, steps, a, a.fps_step, s)
    return np.array([st["t"] for st in steps]), np.array([[p[1], p[2]] if p else [np.nan, np.nan] for p in pos])


def otsu(v):
    h, e = np.histogram(v, 64); c = (e[:-1] + e[1:]) / 2; best, thr = -1, np.median(v)
    for i in range(1, 64):
        w0, w1 = h[:i].sum(), h[i:].sum()
        if not w0 or not w1: continue
        m0, m1 = (h[:i] * c[:i]).sum() / w0, (h[i:] * c[i:]).sum() / w1; b = w0 * w1 * (m0 - m1) ** 2
        if b > best: best, thr = b, c[i]
    return thr


def main():
    ap = argparse.ArgumentParser()
    for k in ("tracks", "ball", "court", "traka", "out"): ap.add_argument("--" + k, required=True)
    ap.add_argument("--home", required=True); ap.add_argument("--away", required=True)
    ap.add_argument("--home-kit", choices=["dark", "light"], required=True, help="domaći igraju u tamnom ili svijetlom dresu")
    ap.add_argument("--hz", type=float, default=5); ap.add_argument("--title", default="")
    ap.add_argument("--no-ref", action="store_true", help="ne izdvajaj suce po crvenoj boji (ekipa u crvenom dresu)")
    a = ap.parse_args()

    print("učitavam…", flush=True)
    tl = json.load(open(a.tracks))["timeline"]
    cd = json.load(open(a.court)); L, W = cd["L"], cd["W"]
    ct = np.array([f[0] for f in cd["frames"]])
    cH = [np.array(f[1]).reshape(3, 3) if f[1] else None for f in cd["frames"]]
    tr = json.load(open(a.traka))
    print("praćenje lopte…", flush=True)
    bt, bxy = ball_path(a.ball)

    def H_at(t):                          # slika -> teren, linearno između dva susjedna kalibrirana kadra
        i = int(np.searchsorted(ct, t))
        if i <= 0 or i >= len(ct): return None
        A, B = cH[i - 1], cH[i]
        if t - ct[i - 1] > 0.6 and ct[i] - t > 0.6: return None
        if A is None or B is None: return A if A is not None else B
        w = (t - ct[i - 1]) / (ct[i] - ct[i - 1]); H = (1 - w) * A + w * B; return H / H[2, 2]
    def proj(H, x, y):
        p = H @ np.array([x, y, 1.0]); return p[0] / p[2], p[1] / p[2]

    # boja dresa po tracku (medijan LAB torza)
    F = collections.defaultdict(list)
    for fr in tl:
        for p in fr["players"]:
            if p.get("feat"): F[p["id"]].append(p["feat"])
    lab = {i: np.median(v, 0) for i, v in F.items()}
    ref = {i for i, v in lab.items() if v[1] > 145}                         # crveno: suci (i tamnocrveni golman, vidi dolje)
    n_ref, n_all = sum(len(F[i]) for i in ref), sum(len(v) for v in F.values())
    if a.no_ref or n_ref > 0.3 * n_all:                                     # crveno-plavi dres (Torcida, Hajduk): "suci" su pola ljudi
        print(f"crveno ima {n_ref / max(1, n_all):.0%} opažanja: jedna ekipa igra u crvenom, suci se ne izdvajaju po boji")
        ref = set()
    # ekipe: 2 grupe po boji dresa (k-means u LAB, boja (a, b) ima veću težinu od svjetline), jer npr. zeleni i
    # crveno-plavi dres imaju sličnu svjetlinu pa sam prag na L (stari način) ne razdvaja ekipe
    ids = [i for i in lab if i not in ref and len(F[i]) >= 30]
    wts = np.array([len(F[i]) for i in ids], float)
    X = np.array([[lab[i][0], 2.0 * (lab[i][1] - 128), 2.0 * (lab[i][2] - 128)] for i in ids])
    thr = otsu(X[:, 0]); lo, hi = X[:, 0] < thr, X[:, 0] >= thr
    C = np.array([X[lo].mean(0) if lo.any() else X.min(0), X[hi].mean(0) if hi.any() else X.max(0)])
    for _ in range(50):
        lbl = np.argmin(((X[:, None, :] - C[None]) ** 2).sum(-1), 1)
        C2 = np.array([np.average(X[lbl == k], 0, wts[lbl == k]) if (lbl == k).any() else C[k] for k in (0, 1)])
        if np.allclose(C2, C): break
        C = C2
    dark = int(np.argmin(C[:, 0]))                                           # grupa s tamnijim dresom
    print(f"grupe dresova (L, 2a, 2b): tamnija {C[dark].round().astype(int).tolist()}, svjetlija {C[1 - dark].round().astype(int).tolist()}")
    dark_team = 0 if a.home_kit == "dark" else 1
    def team_of(i):
        if i in ref: return 2
        v = lab.get(i)
        if v is None: return -1
        x = np.array([v[0], 2.0 * (v[1] - 128), 2.0 * (v[2] - 128)])
        k = int(np.argmin(((C - x) ** 2).sum(1)))
        return dark_team if k == dark else 1 - dark_team

    # smjer: u kojem poluvremenu domaći napadaju +x (iz lopte pri golovima)
    votes = collections.Counter()
    ends = [p[1] for p in tr["play"]]
    for g in tr["goals"]:
        te = max([e for e in ends if e <= g["t"] + 0.5], default=None)
        if te is None: continue
        k = int(np.searchsorted(bt, te)); seg = range(max(0, k - 150), k)
        xs = []
        for j in seg:
            if np.isnan(bxy[j, 0]): continue
            H = H_at(bt[j])
            if H is not None: xs.append(proj(H, *bxy[j])[0])
        if xs:
            x = xs[-1]; home_dir = np.sign(x) if g["side"] == "home" else -np.sign(x)
            votes[(g["period"], home_dir)] += 1
    hdir = {p: (1 if votes[(p, 1)] >= votes[(p, -1)] else -1) for p in (1, 2)}
    if not votes: hdir = {1: 1, 2: -1}
    if hdir[1] == hdir[2]: hdir[2] = -hdir[1]                               # ekipe mijenjaju strane
    print(f"domaći napadaju: 1. pol {'+x' if hdir[1] > 0 else '-x'}, 2. pol {'+x' if hdir[2] > 0 else '-x'} (glasovi {dict(votes)})")
    run = [(p[0], p[1], p[2]) for p in tr["play"]]
    def live_per(t):
        for t0, t1, per in run:
            if t0 <= t < t1: return 1, per
        prev = [per for t0, t1, per in run if t1 <= t]; return 0, (prev[-1] if prev else 1)

    tt = np.array([fr["t"] for fr in tl]); step = 1 / a.hz; frames = []; t = tt[0]
    while t <= tt[-1]:
        i = min(int(np.searchsorted(tt, t)), len(tt) - 1); k = i - 1 if i > 0 and t - tt[i - 1] < tt[i] - t else i
        fr = tl[k]; H = H_at(fr["t"]); live, per = live_per(fr["t"])
        if H is not None and (abs(np.linalg.det(H)) < 1e-14 or not sane(H, L, W)): H = None
        rec = {"t": round(fr["t"], 2), "H": None, "p": [], "b": None, "h": -1, "live": live, "pc": [0, 0], "L": None, "g": [], "dir": hdir[per]}
        if H is not None:
            Hc2i = np.linalg.inv(H); Hc2i = Hc2i / Hc2i[2, 2]; rec["H"] = [round(float(v), 6) for v in Hc2i.ravel()[:8]]
            for p in fr["players"]:
                x1, y1, x2, y2 = p["box"]; cx, cy = proj(H, (x1 + x2) / 2, y2)
                if not (abs(cx) < L / 2 + 0.7 and abs(cy) < W / 2 + 0.7): continue      # samo na terenu
                ti = team_of(p["id"]); gk = 0
                if ti == 2 and abs(cx) > L / 2 - 6 and abs(cy) < 6:                   # tamnocrveni golman uz gol, ne sudac
                    defends_home = np.sign(cx) == -hdir[per]; ti = 0 if defends_home else 1; gk = 1
                if ti < 0: continue
                rec["p"].append([ti, -1, gk, x1, y1, x2, y2, round(cx, 2), round(cy, 2)])
            j = int(np.searchsorted(bt, fr["t"]))
            j = min(max(j, 0), len(bt) - 1)
            if abs(bt[j] - fr["t"]) < 0.05 and not np.isnan(bxy[j, 0]):
                bx, by = proj(H, *bxy[j])
                if abs(bx) < L / 2 + 1.5 and abs(by) < W / 2 + 1.5:
                    rec["b"] = [round(float(bxy[j, 0]), 1), round(float(bxy[j, 1]), 1), round(bx, 2), round(by, 2)]
        frames.append(rec); t += step
    teams = [{"name": a.home, "color": "#1d1d1f" if a.home_kit == "dark" else "#ffffff"},
             {"name": a.away, "color": "#ffffff" if a.home_kit == "dark" else "#1d1d1f"}, {"name": "Sudac", "color": "#e5484d"}]
    D = {"title": a.title or f"{a.home} – {a.away}", "fps": a.hz, "img": [1280, 720], "teams": teams,
         "court": {"L": L, "W": W, "D": 6.0}, "players": [], "states": [], "events": [], "frames": frames}
    cnt = collections.Counter(p[0] for f in frames for p in f["p"]); tot = sum(cnt.values()) or 1
    print("osobe na terenu po ekipi: " + ", ".join(f"{teams[k]['name']} {cnt[k] / tot:.0%}" for k in (0, 1, 2)))
    for k in (0, 1, 2):
        ids = [i for i in lab if team_of(i) == k and len(F[i]) >= 30]
        if ids: print(f"  {teams[k]['name']}: {len(ids)} trackova, LAB medijan {np.median([lab[i] for i in ids], 0).round().astype(int).tolist()}")
    from possession import add_possession, summary
    print(summary(D, add_possession(D)))
    json.dump(D, open(a.out, "w"), separators=(",", ":"))
    cal = sum(f["H"] is not None for f in frames); nb = sum(f["b"] is not None for f in frames)
    npl = np.mean([len(f["p"]) for f in frames if f["H"]]) if cal else 0
    print(f"{len(frames)} kadrova ({a.hz:g}/s), teren {cal / len(frames):.0%}, lopta {nb / len(frames):.0%}, "
          f"prosječno {npl:.1f} osoba na terenu -> {a.out} ({os.path.getsize(a.out) / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
