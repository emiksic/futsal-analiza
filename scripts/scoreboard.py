"""Čitanje TV trake (SuperSport HMNL grafika: `1 | P | 07:39 | SQR 0-1 RIJ`): poluvrijeme, sat, rezultat.

  python scripts/scoreboard.py run/<id>/video.mp4 run/<id>/traka.json
  python scripts/scoreboard.py traka.mp4 traka.json --strip        (već izrezana traka 360x36, npr. iz ffmpeg crop)

Iz toga:
  reads  [t, poluvrijeme, sat (s do kraja), domaći, gosti] svakih 0.5 s snimke (null = nečitljivo / nema trake)
  play   dijelovi snimke u kojima sat teče: [t0, t1, poluvrijeme, vrijeme utakmice u t0 (s od početka)]
  goals  promjene rezultata: snimka t, poluvrijeme, sekunda utakmice (sat stoji nakon gola pa je to vrijeme gola), strana

Znakovi se prepoznaju usporedbom s predlošcima (scripts/traka/<profil>.npz), naučenima na Square - Rijeka.
Na 7g1c: 98.8 % slika pročitano, svih 10 golova u istoj minuti kao Semafor, sat teče 39.6 od 40 min.
"""
import argparse, json, os, re
import cv2, numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
CROP = (106, 46, 360, 36)                 # x, y, w, h trake na 1280x720
REG = {"per": (8, 36), "clk": (76, 146), "sh": (222, 249), "sa": (257, 290)}
Y0, Y1 = 9, 25


def load_profile(name):
    z = np.load(os.path.join(HERE, "traka", f"{name}.npz"))
    return {r: (z[f"{r}_X"], [str(k) for k in z[f"{r}_k"]]) for r in REG}


def bar_ok(f):
    b = f[25:29, 150:220].astype(int)                      # plava pozadina trake
    return ((b[..., 0] > 90) & (b[..., 0] > b[..., 2] + 40)).mean() > 0.6


def glyphs(f, reg):
    x0, x1 = REG[reg]; m = f[Y0:Y1, x0:x1, 2] > 150        # znamenke su svijetle (visok R), pozadina plava
    c = m.sum(0); out, s = [], None
    for x, v in enumerate(list(c) + [0]):
        if v and s is None: s = x
        if not v and s is not None:
            g = m[:, s:x]
            if g.sum() >= 4: out.append(g)
            s = None
    return out


def feat(g):
    w = g.shape[1]; im = np.zeros((16, 26), np.float32); im[:, :min(26, w)] = g[:, :26]
    return np.concatenate([im.ravel(), [w / 2]])


def split(g):
    """Dvije znamenke koje su se spojile u jedan komad: prereži na najtanjem stupcu u sredini."""
    w = g.shape[1]; c = g.sum(0); lo, hi = int(w * .3), int(w * .7); m = lo + int(np.argmin(c[lo:hi]))
    return [g[:, :m], g[:, m:]]


def read_frame(f, P):
    if not bar_ok(f): return None
    s = {}
    for r in REG:
        txt = ""
        for g in glyphs(f, r):
            for p in (split(g) if g.shape[1] > 16 else [g]):
                X, ks = P[r]; k = ks[int(((X - feat(p)) ** 2).sum(1).argmin())]
                if k != ":": txt += k
        s[r] = txt
    m = re.fullmatch(r"(\d{2})(\d{2})", s["clk"])
    if not (m and s["per"] in ("1", "2", "3", "4") and s["sh"].isdigit() and s["sa"].isdigit()): return None
    clk = int(m[1]) * 60 + int(m[2])
    if clk > 1200 or int(m[2]) > 59: return None
    return [int(s["per"]), clk, int(s["sh"]), int(s["sa"])]


def strips(path, is_strip, hz):
    cap = cv2.VideoCapture(path); fps = cap.get(cv2.CAP_PROP_FPS) or 30
    W, H = int(cap.get(3)), int(cap.get(4)); sx, sy = W / 1280, H / 720
    x, y, w, h = CROP; box = (round(x * sx), round(y * sy), round(w * sx), round(h * sy))
    step = 1 if is_strip else max(1, round(fps / hz)); fi = 0
    while True:
        if fi % step:
            if not cap.grab(): break
            fi += 1; continue
        ok, f = cap.read()
        if not ok: break
        if not is_strip:
            f = f[box[1]:box[1] + box[3], box[0]:box[0] + box[2]]
            if f.shape[:2] != (36, 360): f = cv2.resize(f, (360, 36), interpolation=cv2.INTER_AREA)
        yield fi / fps, f
        fi += 1


def analyse(reads):
    t = np.array([r[0] for r in reads]); ok = [i for i, r in enumerate(reads) if r[1] is not None]
    # sat teče između dva valjana čitanja ako je pao otprilike za proteklo vrijeme
    run = np.zeros(len(reads), bool)
    for a, b in zip(ok, ok[1:]):
        dt = t[b] - t[a]; dc = reads[a][2] - reads[b][2]
        if reads[a][1] == reads[b][1] and dt <= 6 and dc > 0 and abs(dc - dt) <= 1.01: run[a:b + 1] = True
    play, s = [], None
    for i, v in enumerate(list(run) + [False]):
        if v and s is None: s = i
        if not v and s is not None:
            r0 = reads[s] if reads[s][1] is not None else reads[s + 1]
            play.append([round(t[s], 2), round(t[i - 1] + (t[1] - t[0]), 2), r0[1], (r0[1] - 1) * 1200 + 1200 - r0[2]]); s = None
    # golovi: novi rezultat koji se drži barem 3 s
    goals, prev = [], None
    for k, i in enumerate(ok):
        sc = tuple(reads[i][3:5])
        if prev is None: prev = sc; continue
        nxt = [tuple(reads[j][3:5]) for j in ok[k:k + 6]]
        if sc != prev and all(x == sc for x in nxt):
            per, clk = reads[i][1], reads[i][2]
            side = "home" if sc[0] > prev[0] else "away" if sc[1] > prev[1] else "?"
            goals.append({"t": round(t[i], 2), "period": per, "clock": clk, "sec": (per - 1) * 1200 + 1200 - clk,
                          "score": list(sc), "side": side, "corrected": sc[0] < prev[0] or sc[1] < prev[1]})
            prev = sc
    return play, goals


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("video"); ap.add_argument("out")
    ap.add_argument("--strip", action="store_true", help="ulaz je već izrezana traka 360x36")
    ap.add_argument("--hz", type=float, default=2); ap.add_argument("--profile", default="supersport")
    a = ap.parse_args(); P = load_profile(a.profile)
    reads = []
    for t, f in strips(a.video, a.strip, a.hz):
        r = read_frame(f, P); reads.append([round(t, 2)] + (r if r else [None] * 4))
        if len(reads) % 1200 == 0: print(f"  {t / 60:5.1f} min", flush=True)
    good = sum(r[1] is not None for r in reads)
    play, goals = analyse(reads)
    json.dump({"profile": a.profile, "reads": reads, "play": play, "goals": goals}, open(a.out, "w"))
    print(f"pročitano {good / max(1, len(reads)):.1%} slika, sat teče {sum(p[1] - p[0] for p in play) / 60:.1f} min, golova {len(goals)}")
    for g in goals:
        print(f"  snimka {int(g['t'] // 60)}:{g['t'] % 60:04.1f}  {g['score'][0]}-{g['score'][1]}  "
              f"{g['sec'] // 60}'{g['sec'] % 60:02d}\"  ({g['side']}{', ispravak' if g['corrected'] else ''})")
    if good < 0.8 * len(reads): print("! malo pročitanih slika: možda druga grafika (drugi profil) ili traka nije na istom mjestu")


if __name__ == "__main__":
    main()
