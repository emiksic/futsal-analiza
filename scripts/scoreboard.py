"""Čitanje TV trake: poluvrijeme, sat, rezultat.

  python scripts/scoreboard.py run/<id>/video.mp4 run/<id>/traka.json                 (PARSeq, raspored se bira sam)
  python scripts/scoreboard.py run/<id>/video.mp4 traka.json --layout torcida --dur 600   (zadani raspored, prvih 10 min)
  python scripts/scoreboard.py traka.mp4 traka.json --reader tpl --strip   (stari čitač s predlošcima, samo SuperSport stari font)

Raspored trake po produkciji je u scripts/traka/profili.json (kutije polja na 1280x720). Font nije bitan:
znakove čita PARSeq (parseq_digits.py) s ograničenim skupom znakova. Raspored se bira automatski: na 24 slike
iz snimke proba se svaki i uzme onaj s najviše valjanih čitanja (sat + rezultat). Smjer sata (unatrag/naprijed)
i poluvrijeme (ako ga traka ne piše) određuju se iz samih čitanja.

Iz toga:
  reads  [t, poluvrijeme, sat (s do kraja), domaći, gosti] svakih 0.5 s snimke (null = nečitljivo / nema trake)
  play   dijelovi snimke u kojima sat teče: [t0, t1, poluvrijeme, vrijeme utakmice u t0 (s od početka)]
  goals  promjene rezultata: snimka t, poluvrijeme, sekunda utakmice (sat stoji nakon gola pa je to vrijeme gola), strana

Znakovi se prepoznaju usporedbom s predlošcima (scripts/traka/<profil>.npz), naučenima na Square - Rijeka.
Na 7g1c: 98.8 % slika pročitano, svih 10 golova u istoj minuti kao Semafor, sat teče 39.6 od 40 min.
"""
import argparse, json, os, re, sys
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

# ---------------- PARSeq čitač (bilo koji font, raspored iz profili.json) ----------------
CHARS = {"per": "0123456789P", "clk": "0123456789:.", "score": "0123456789-:"}


def load_layouts():
    L = json.load(open(os.path.join(HERE, "traka", "profili.json"), encoding="utf-8"))
    return {k: v for k, v in L.items() if not k.startswith("_")}


def get_reader():
    sys.path.insert(0, HERE)
    import torch
    from parseq_digits import DigitReader
    R = DigitReader()
    if torch.cuda.is_available(): R.m = R.m.cuda()
    return R


def crop(f, box):
    H, W = f.shape[:2]; sx, sy = W / 1280, H / 720; x, y, w, h = box
    return f[round(y * sy):round((y + h) * sy), round(x * sx):round((x + w) * sx)]


def parse(txt):
    """{'per','clk','score'} tekst -> [poluvrijeme ili None, sat na traci u s, domaći, gosti] ili None"""
    c = txt.get("clk", "")
    m = re.fullmatch(r"(\d{1,2}):(\d{2})", c) or re.fullmatch(r"(\d{1,2})(\d{2})", c)
    if m: clk = int(m[1]) * 60 + int(m[2]); sec = int(m[2])
    else:
        m = re.fullmatch(r"(\d{1,2})\.\d", c)                       # zadnja minuta: "45.3"
        if not m: return None
        clk = sec = int(m[1])
    if sec > 59 or clk > 2400: return None
    sc = txt.get("score", "")
    parts = re.split(r"[-:]", sc)
    # PARSeq kod "1:1" zna zapeti i ponavljati ("1:1:1:1"): ako se dijelovi ponavljaju s periodom 2, uzmi prva dva
    if len(parts) > 2 and all(parts) and all(q == parts[i % 2] for i, q in enumerate(parts)): sc = f"{parts[0]}-{parts[1]}"
    m = re.fullmatch(r"(\d{1,2})[-:](\d{1,2})", sc)
    if not m:
        d = re.sub(r"\D", "", sc)
        if len(d) != 2: return None                                 # crtica nije pročitana: samo za d-d
        m = [None, d[0], d[1]]
    per = re.sub(r"\D", "", txt.get("per", ""))
    per = int(per) if per in ("1", "2", "3", "4") else None
    return [per, clk, int(m[1]), int(m[2])]


class Cache:
    """Polje koje se nije promijenilo od zadnjeg čitanja (rezultat, poluvrijeme, sat koji stoji) ne čita se ponovno."""
    def __init__(self): self.ref, self.last = {}, {}

    def same(self, fld, c):
        g = cv2.cvtColor(cv2.resize(c, (64, 24), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY).astype(np.int16)
        p = self.ref.get(fld)
        if p is not None and np.abs(g - p).mean() < 3: return True
        self.ref[fld] = g; return False


def read_frames(frames, lay, R, cache=None):
    """frames: lista BGR slika -> lista parse() rezultata (u batchu, s cacheom nepromijenjenih polja)"""
    flds = [f for f in ("per", "clk", "score") if f in lay]
    out = [{} for _ in frames]; todo = {f: [] for f in flds}
    for i, f in enumerate(frames):
        for fld in flds:
            c = crop(f, lay[fld])
            if not (cache and cache.same(fld, c)): todo[fld].append((i, c))
    for fld, L in todo.items():
        for (i, _), (txt, conf) in zip(L, R.read([c for _, c in L], chars=CHARS[fld]) if L else []):
            out[i][fld] = txt if conf > 0.3 else ""
    last = cache.last if cache else {}
    for f in out:                                     # ponovi zadnje pročitano za nepromijenjena polja
        for fld in flds:
            if fld in f: last[fld] = f[fld]
            else: f[fld] = last.get(fld, "")
    return [parse(t) for t in out]


def frames(path, hz, dur=None):
    cap = cv2.VideoCapture(path); fps = cap.get(cv2.CAP_PROP_FPS) or 30
    step = max(1, round(fps / hz)); fi = 0
    while dur is None or fi / fps < dur:
        if fi % step:
            if not cap.grab(): break
            fi += 1; continue
        ok, f = cap.read()
        if not ok: break
        yield fi / fps, f
        fi += 1


def pick_layout(path, layouts, R, n=24):
    cap = cv2.VideoCapture(path); N = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)); S = []
    for k in np.linspace(0.1, 0.9, n):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(k * N)); ok, f = cap.read()
        if ok: S.append(f)
    if not S: raise SystemExit(f"ne mogu otvoriti video: {path}")
    score = {name: sum(r is not None for r in read_frames(S, lay, R)) for name, lay in layouts.items()}
    best = max(score, key=score.get)
    print("rasporedi:", ", ".join(f"{k} {v}/{len(S)}" for k, v in score.items()), "->", best)
    return best


def normalize(reads, lay):
    """sat -> sekunde do kraja poluvremena (kao SuperSport), poluvrijeme iz resetiranja sata ako ga traka ne piše"""
    ok = [r for r in reads if r[2] is not None]
    d = lay.get("dir", "auto")
    if d == "auto":
        up = down = 0
        for a, b in zip(ok, ok[1:]):
            dt, dc = b[0] - a[0], b[2] - a[2]
            if 0 < dt <= 1.5 and abs(abs(dc) - dt) <= 1.01 and dc: up += dc > 0; down += dc < 0
        d = "up" if up > down else "down"
    per_auto, prev = 1, None
    for r in reads:
        if r[2] is None: continue
        clk = r[2]
        if d == "up":
            if clk > 1200: clk -= 1200; r[1] = r[1] or 2          # sat ide 20:00 -> 40:00 u drugom poluvremenu
            clk = 1200 - clk
        if clk > 1200: r[1:] = [None] * 4; continue
        if "per" not in lay and r[1] is None:
            if prev is not None and clk - prev > 600 and prev < 300: per_auto += 1   # sat se vratio na početak
            r[1] = per_auto
        r[2] = clk; prev = clk
    last = None                                                     # poluvrijeme nepročitano: uzmi od susjeda
    for r in reads:
        if r[2] is None: continue
        if r[1] is None: r[1] = last
        last = r[1]
    for r in reads:
        if r[2] is not None and r[1] is None: r[1:] = [None] * 4
    return d


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
    ap.add_argument("--hz", type=float, default=2); ap.add_argument("--dur", type=float, help="samo prvih N s snimke (test)")
    ap.add_argument("--layout", help="raspored iz profili.json (zadano: automatski)")
    ap.add_argument("--reader", default="parseq", choices=["parseq", "tpl"])
    ap.add_argument("--strip", action="store_true", help="tpl: ulaz je već izrezana traka 360x36")
    ap.add_argument("--profile", default="supersport", help="tpl: predlošci scripts/traka/<profil>.npz")
    a = ap.parse_args(); reads = []
    if a.reader == "tpl":
        P = load_profile(a.profile); name = a.profile; d = "down"
        for t, f in strips(a.video, a.strip, a.hz):
            r = read_frame(f, P); reads.append([round(t, 2)] + (r if r else [None] * 4))
            if len(reads) % 1200 == 0: print(f"  {t / 60:5.1f} min", flush=True)
    else:
        L = load_layouts(); R = get_reader()
        name = a.layout or pick_layout(a.video, L, R); lay = L[name]; cache = Cache(); buf = []
        def flush():
            for (t, _), r in zip(buf, read_frames([f for _, f in buf], lay, R, cache)):
                reads.append([round(t, 2)] + (r if r else [None] * 4))
            buf.clear()
        for t, f in frames(a.video, a.hz, a.dur):
            buf.append((t, f))
            if len(buf) == 64: flush()
            if len(reads) % 1200 == 0 and reads and not buf: print(f"  {t / 60:5.1f} min", flush=True)
        flush(); d = normalize(reads, lay)
    good = sum(r[1] is not None for r in reads)
    play, goals = analyse(reads)
    json.dump({"profile": name, "reader": a.reader, "dir": d, "reads": reads, "play": play, "goals": goals}, open(a.out, "w"))
    print(f"raspored {name}, sat {'unatrag' if d == 'down' else 'naprijed'}: pročitano {good / max(1, len(reads)):.1%} slika, "
          f"sat teče {sum(p[1] - p[0] for p in play) / 60:.1f} min, golova {len(goals)}")
    for g in goals:
        print(f"  snimka {int(g['t'] // 60)}:{g['t'] % 60:04.1f}  {g['score'][0]}-{g['score'][1]}  "
              f"{g['sec'] // 60}'{g['sec'] % 60:02d}\"  ({g['side']}{', ispravak' if g['corrected'] else ''})")
    if good < 0.5 * len(reads): print("! malo pročitanih slika: možda nova grafika (dodaj raspored u scripts/traka/profili.json)")


if __name__ == "__main__":
    main()
