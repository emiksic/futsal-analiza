"""Kalibracija terena bez nizanja kadrova: klikani referentni kadrovi + usporedba svakog kadra s najsličnijim.

1) kandidati:  python scripts/court_frames.py run/<id>/video.mp4 run/<id>/teren --traka run/<id>/traka.json
2) klikanje:   scripts/court_label.html u Chromeu -> Otvori mapu -> run/<id>/teren   (5+ kadrova, 4+ točke)
3) teren:      python scripts/court_calib.py fit run/<id>/teren [--L 40 --W 20]
               -> teren/court_model.json + teren/provjera_*.jpg (crte terena preko klikanih kadrova: moraju sjesti)
4) utakmica:   python scripts/court_calib.py track run/<id>/video.mp4 run/<id>/teren run/<id>/court.json
                      [--traka run/<id>/traka.json] [--hz 2] [--check 600 1600 2300]
               -> za svaki kadar (hz u sekundi) homografija slika -> teren u metrima (ishodište u centru,
                  x uzduž terena, y poprijeko, +y = bliža strana kameri), ili null kad nije glavna kamera

Kamera se samo okreće i zumira (stoji na mjestu), pa su dva kadra povezana homografijom za cijelu sliku.
Svaki kadar se uspoređuje izravno s klikanim kadrom (SIFT + RANSAC), pa se greška ne nakuplja.
Ista dvorana i kamera: isti teren/ (court_model.json + slike) vrijedi i za druge utakmice u toj dvorani.
"""
import argparse, glob, json, os, sys, time
import cv2, numpy as np

PTS = {"LFC": lambda L, W: (-L / 2, -W / 2), "LNC": lambda L, W: (-L / 2, W / 2), "RFC": lambda L, W: (L / 2, -W / 2),
       "RNC": lambda L, W: (L / 2, W / 2), "LGF": lambda L, W: (-L / 2, -1.5), "LGN": lambda L, W: (-L / 2, 1.5),
       "RGF": lambda L, W: (L / 2, -1.5), "RGN": lambda L, W: (L / 2, 1.5), "L6": lambda L, W: (-L / 2 + 6, 0),
       "R6": lambda L, W: (L / 2 - 6, 0), "L10": lambda L, W: (-L / 2 + 10, 0), "R10": lambda L, W: (L / 2 - 10, 0),
       "MF": lambda L, W: (0, -W / 2), "MN": lambda L, W: (0, W / 2), "C": lambda L, W: (0, 0),
       "CF": lambda L, W: (0, -3), "CN": lambda L, W: (0, 3)}
SC = 0.5                                   # SIFT radi na pola rezolucije (1280x720 -> 640x360)


def sane(H_img2court, L, W):
    """Donja polovica slike mora biti razuman komad poda (ne crta, ne cijela dvorana): 40-1500 m2, ispred kamere."""
    if H_img2court is None or not np.isfinite(H_img2court).all(): return False
    q = cv2.perspectiveTransform(np.float32([[[0, 300], [1280, 300], [1280, 720], [0, 720]]]), H_img2court)[0]
    if not np.isfinite(q).all(): return False
    w = (H_img2court @ np.array([[0, 1280, 1280, 0], [300, 300, 720, 720], [1, 1, 1, 1.0]]))[2]
    return bool((np.sign(w) == np.sign(w[0])).all() and 40 < abs(cv2.contourArea(q)) < 1500)


def court_lines(L, W):
    """Crte terena (u metrima) za provjeru: rub, središnja linija, krug, kazneni prostori (lukovi 6 m), točke."""
    out = [[(-L / 2, -W / 2), (L / 2, -W / 2), (L / 2, W / 2), (-L / 2, W / 2), (-L / 2, -W / 2)], [(0, -W / 2), (0, W / 2)]]
    out.append([(3 * np.cos(a), 3 * np.sin(a)) for a in np.linspace(0, 2 * np.pi, 40)])
    for s in (-1, 1):
        x0 = s * L / 2; arc = []
        for a in np.linspace(-np.pi / 2, 0, 12): arc.append((x0 - s * 6 * np.cos(a), -1.58 + 6 * np.sin(a)))
        for a in np.linspace(0, np.pi / 2, 12): arc.append((x0 - s * 6 * np.cos(a), 1.58 + 6 * np.sin(a)))
        out.append(arc)
        for d in (6, 10): out.append([(x0 - s * d - .15, 0), (x0 - s * d + .15, 0)])
    return out


def draw_court(img, H_c2i, L, W, col=(0, 255, 255)):
    for line in court_lines(L, W):
        p = cv2.perspectiveTransform(np.float32(line)[None], H_c2i)[0]
        cv2.polylines(img, [np.int32(p)], False, col, 2, cv2.LINE_AA)
    return img


# ---------------- fit ----------------
def cmd_fit(a):
    from scipy.optimize import least_squares
    rp = os.path.join(a.teren, "court_refs.json")
    if not os.path.exists(rp):
        sys.exit(f"Nema {rp}: prvo klikni točke u scripts/court_label.html (Otvori mapu -> {a.teren}) i spremi.")
    refs = json.load(open(rp, encoding="utf-8"))["frames"]
    names = [n for n, f in sorted(refs.items()) if any(k in PTS for k in f["pts"])]
    # 1) klikovi se prenose između kadrova koji se preklapaju (SIFT): tako svaki kadar ima točke s više dijelova
    #    terena, pa se mogu procijeniti i dužina i širina (iz jednog kadra se vidi samo dio)
    sift = cv2.SIFT_create(nfeatures=3000); bf = cv2.BFMatcher(cv2.NORM_L2)
    F = {n: feats(sift, cv2.imread(os.path.join(a.teren, n))) for n in names}
    S = np.diag([SC, SC, 1.0]); Si = np.linalg.inv(S)
    P = {n: {k: (np.array(v, float), 1.0) for k, v in refs[n]["pts"].items() if k in PTS} for n in names}
    for i in names:
        for j in names:
            if i == j: continue
            Hh, nin = match(bf, F[j], F[i], 40)
            if Hh is None or nin < 40: continue
            Hji = Si @ Hh @ S
            for k, v in refs[j]["pts"].items():
                if k in PTS and k not in refs[i]["pts"]:
                    q = cv2.perspectiveTransform(np.float32([[v]]), Hji)[0, 0]
                    if -400 < q[0] < 1680 and -200 < q[1] < 920 and k not in P[i]: P[i][k] = (q.astype(float), 0.5)
    use = []
    for n in names:
        c = np.float32([PTS[k](40, 20) for k in P[n]])
        if len(c) >= 4 and cv2.contourArea(cv2.convexHull(c)) >= 4: use.append(n)
        else: print(f"  {n}: premalo točaka izvan jednog pravca, preskačem")
    if len(use) < 2: sys.exit("Treba barem 2 kadra s 4+ točke koje nisu na jednom pravcu (bolje 5+ kadrova).")

    def fit_frame(n, L, W, H0=None):
        ks = list(P[n]); c = np.array([PTS[k](L, W) for k in ks], float); im = np.array([P[n][k][0] for k in ks]); w = np.array([P[n][k][1] for k in ks])
        if H0 is None: H0, _ = cv2.findHomography(np.float32(c), np.float32(im), 0); H0 = H0 / H0[2, 2]
        def r(x):
            p = np.append(x, 1).reshape(3, 3) @ np.c_[c, np.ones(len(c))].T
            return (((p[:2] / p[2]).T - im) * w[:, None]).ravel()
        sol = least_squares(r, H0.ravel()[:8], x_scale="jac", loss="huber", f_scale=3.0)
        return np.append(sol.x, 1).reshape(3, 3), sol
    def total(L, W): return sum(fit_frame(n, L, W)[1].cost for n in use)
    L, W = a.L, a.W
    if not a.fix_lw:               # mreža dimenzija, pa finije oko najbolje
        best = min(((total(l, w), l, w) for l in np.arange(30, 44.01, 1.0) for w in np.arange(15, 25.01, 0.5)))
        _, L, W = min(((total(l, w), l, w) for l in np.arange(best[1] - 1, best[1] + 1.01, 0.25) for w in np.arange(best[2] - .5, best[2] + .51, 0.125)))
    H, err = [], []
    for n in use:
        Hm, _ = fit_frame(n, L, W); H.append(Hm)
        for k, v in refs[n]["pts"].items():          # greška samo na stvarno klikanim točkama
            if k in PTS:
                q = Hm @ np.array([*PTS[k](L, W), 1.0]); err.append(np.hypot(q[0] / q[2] - v[0], q[1] / q[2] - v[1]))
    err = np.array(err); names = use
    good = [i for i, Hm in enumerate(H) if sane(np.linalg.inv(Hm), L, W)]
    for i, n in enumerate(names):
        if i in good: continue
        best = (None, 0)
        for j in good:
            Hh, nin = match(bf, F[names[j]], F[n], 40)
            if Hh is not None and nin > best[1]: best = (Si @ Hh @ S @ H[j], nin)
        if best[0] is not None and sane(np.linalg.inv(best[0]), L, W):
            H[i] = best[0] / best[0][2, 2]; print(f"  {n}: točke gotovo na jednom pravcu -> teren preuzet od susjednog kadra ({best[1]} poklapanja)")
        else: print(f"  ! {n}: neispravan i nema dobrog susjeda; dodaj točke izvan jednog pravca")
    print(f"teren {L:.2f} x {W:.2f} m, {len(names)} kadrova, {len(err)} točaka, greška: medijan {np.median(err):.1f} px, najveća {err.max():.1f} px")
    model = {"L": round(float(L), 3), "W": round(float(W), 3), "refs": []}
    k = 0
    for n, Hm in zip(names, H):
        np_ = len([q for q in refs[n]["pts"] if q in PTS]); e = err[k:k + np_] if np_ else np.zeros(1); k += np_
        model["refs"].append({"image": n, "t": refs[n].get("t"), "H_court2img": (Hm / Hm[2, 2]).tolist()})
        img = cv2.imread(os.path.join(a.teren, n)); draw_court(img, Hm, L, W)
        for q, v in refs[n]["pts"].items(): cv2.circle(img, (int(v[0]), int(v[1])), 5, (0, 0, 255), 2)
        cv2.imwrite(os.path.join(a.teren, f"provjera_{os.path.splitext(n)[0]}.jpg"), img)
        ks = [q for q in refs[n]["pts"] if q in PTS]
        bad = ", ".join(f"{q} {v:.0f} px" for q, v in zip(ks, e) if v > 5)
        print(f"  {n}: {np_} točaka, greška do {e.max():.1f} px" + (f"   <- provjeri: {bad}" if bad else ""))
    json.dump(model, open(os.path.join(a.teren, "court_model.json"), "w"), indent=1)
    print(f"-> {os.path.join(a.teren, 'court_model.json')}; pogledaj provjera_*.jpg (žute crte moraju sjesti na prave)")


# ---------------- track ----------------
def mask_for(h, w):
    m = np.full((h, w), 255, np.uint8); m[: int(95 * SC), : int(480 * SC)] = 0      # TV traka gore lijevo
    return m


def feats(sift, img):
    g = cv2.cvtColor(cv2.resize(img, (int(1280 * SC), int(720 * SC)), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
    return sift.detectAndCompute(g, mask_for(*g.shape))


def match(bf, A, B, min_in):
    (ka, da), (kb, db) = A, B
    if da is None or db is None or len(ka) < 8 or len(kb) < 8: return None, 0
    good = [m for m, n in (p for p in bf.knnMatch(da, db, k=2) if len(p) == 2) if m.distance < 0.75 * n.distance]
    if len(good) < min_in: return None, 0
    pa = np.float32([ka[m.queryIdx].pt for m in good]); pb = np.float32([kb[m.trainIdx].pt for m in good])
    H, inl = cv2.findHomography(pa, pb, cv2.RANSAC, 3.0)
    if H is None: return None, 0
    return H, int(inl.sum())


def cmd_track(a):
    model = json.load(open(os.path.join(a.teren, "court_model.json"), encoding="utf-8")); L, W = model["L"], model["W"]
    sift = cv2.SIFT_create(nfeatures=2000); bf = cv2.BFMatcher(cv2.NORM_L2)
    refs = []
    for r in model["refs"]:
        img = cv2.imread(os.path.join(a.teren, r["image"])); refs.append({"f": feats(sift, img), "H": np.array(r["H_court2img"])})
    S = np.diag([SC, SC, 1.0]); Si = np.linalg.inv(S)
    cap = cv2.VideoCapture(a.video); fps = cap.get(cv2.CAP_PROP_FPS) or 30; nfr = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    Wv, Hv = int(cap.get(3)), int(cap.get(4)); V = np.diag([1280 / Wv, 720 / Hv, 1.0])     # izvorna slika -> 1280x720
    step = max(1, round(fps / a.hz))
    ranges = [(0, nfr / fps)]
    if a.traka:                                # samo od prvog do zadnjeg trenutka igre po poluvremenu (bez stanke)
        play = json.load(open(a.traka))["play"]; ranges = []
        for p in sorted({x[2] for x in play}):
            P = [x for x in play if x[2] == p]; ranges.append((P[0][0] - 10, P[-1][1] + 10))
    def wanted(t): return any(r0 <= t <= r1 for r0, r1 in ranges)
    out = []
    if a.resume and os.path.exists(a.out): out = json.load(open(a.out))["frames"]
    t_done = out[-1][0] if out else -1
    last, T0, fi = 0, time.time(), 0; ok_n = 0
    checks = {round(c * fps / step) * step for c in (a.check or [])}
    def save():
        tmp = a.out + ".tmp"; json.dump({"L": L, "W": W, "hz": a.hz, "note": "H: slika 1280x720 -> teren (m)", "frames": out}, open(tmp, "w")); os.replace(tmp, a.out)
    next_save = time.time() + 120
    while True:
        t = fi / fps
        if fi % step or not wanted(t) or t <= t_done:
            if not cap.grab(): break
            fi += 1; continue
        ok, img = cap.read()
        if not ok: break
        if (Wv, Hv) != (1280, 720): img = cv2.resize(img, (1280, 720), interpolation=cv2.INTER_AREA)
        F = feats(sift, img)
        order = [last] + [i for i in range(len(refs)) if i != last]
        best = (None, 0, -1)
        for i in order:
            Hm, n = match(bf, F, refs[i]["f"], a.min_inliers)
            if n > best[1]: best = (Hm, n, i)
            if i == last and n >= 3 * a.min_inliers: break          # zadnji referentni je i dalje dobar
        Hm, n, i = best
        rec = [round(t, 3), None]
        if Hm is not None and n >= a.min_inliers:
            Hf = Si @ Hm @ S                                         # kadar -> referentni (puna rezolucija)
            Hic = np.linalg.inv(refs[i]["H"]) @ Hf                   # kadar -> teren
            c = cv2.perspectiveTransform(np.float32([[[640, 560]]]), Hic)[0, 0]
            if abs(c[0]) < L / 2 + 8 and abs(c[1]) < W / 2 + 8 and sane(Hic, L, W):
                Hic = Hic / Hic[2, 2]; rec = [round(t, 3), [round(float(v), 7) for v in Hic.ravel()], i, n]; last = i; ok_n += 1
        out.append(rec)
        if fi in checks and rec[1]:
            draw_court(img, np.linalg.inv(np.array(rec[1]).reshape(3, 3)), L, W)
            cv2.imwrite(os.path.splitext(a.out)[0] + f"_provjera_{t:07.1f}.jpg", img)
        if len(out) % 600 == 0:
            print(f"  {t / 60:5.1f} min   kalibrirano {ok_n / len(out):.0%}   {(time.time() - T0) / 60:.0f} min rada", flush=True)
        if time.time() > next_save: save(); next_save = time.time() + 120
        fi += 1
    save()
    print(f"gotovo: {len(out)} kadrova, kalibrirano {ok_n / max(1, len(out)):.0%} -> {a.out}")


def main():
    for st in (sys.stdout, sys.stderr):
        try: st.reconfigure(encoding="utf-8", errors="replace")
        except Exception: pass
    ap = argparse.ArgumentParser(); sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fit"); f.add_argument("teren"); f.add_argument("--L", type=float, default=40); f.add_argument("--W", type=float, default=20)
    f.add_argument("--fix-lw", action="store_true", help="ne procjenjuj dimenzije, uzmi --L --W")
    t = sub.add_parser("track"); t.add_argument("video"); t.add_argument("teren"); t.add_argument("out")
    t.add_argument("--traka"); t.add_argument("--hz", type=float, default=2); t.add_argument("--min-inliers", type=int, default=30)
    t.add_argument("--check", type=float, nargs="*"); t.add_argument("--resume", action="store_true")
    a = ap.parse_args()
    {"fit": cmd_fit, "track": cmd_track}[a.cmd](a)


if __name__ == "__main__":
    main()
